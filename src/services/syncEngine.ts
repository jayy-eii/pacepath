/**
 * syncEngine.ts
 * Reliable, offline-first outbox sync engine for PacePath.
 * - Enqueues all writes to Dexie syncOutbox table.
 * - Idempotently syncs batches via Supabase SECURITY DEFINER RPC: sync_batch(p_payload).
 * - Automatic exponential retry with backoff on failure.
 * - Items removed from outbox ONLY when RPC confirms success.
 * - Triggers on app start, 'online' event, every 30s, and after question answers.
 * - Never blocks the UI.
 */

import { db, isIndexedDBAvailable, type SyncTable, type SyncOutboxItem } from './db'
import { generateUUID } from './syncMappers'

export interface SyncState {
  status: 'synced' | 'syncing' | 'offline' | 'error'
  pendingCount: number
  lastSyncedAt: number | null
  lastError: string | null
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

// In-memory fallback for environments without IndexedDB
export const memSyncOutbox = new Map<string, SyncOutboxItem>()

let syncState: SyncState = {
  status: 'offline',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
}

const listeners = new Set<(state: SyncState) => void>()

function updateState(partial: Partial<SyncState>) {
  syncState = { ...syncState, ...partial }
  listeners.forEach((fn) => {
    try {
      fn(syncState)
    } catch {
      // ignore listener errors
    }
  })
}

export function getSyncState(): SyncState {
  return syncState
}

export function subscribeSyncState(fn: (state: SyncState) => void): () => void {
  listeners.add(fn)
  fn(syncState)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Calculates exponential retry backoff in milliseconds.
 * 1s, 2s, 4s, 8s, 16s... up to max 30s.
 */
export function calculateBackoffMs(retryCount: number): number {
  if (retryCount <= 0) return 0
  return Math.min(30000, 1000 * Math.pow(2, retryCount - 1))
}

/**
 * Enqueues a write to the Dexie syncOutbox (asynchronous, non-blocking).
 */
export async function enqueueSync(
  table: SyncTable,
  payload: Record<string, unknown>,
): Promise<void> {
  const itemId = payload.id ? String(payload.id) : generateUUID()
  const item: SyncOutboxItem = {
    id: itemId,
    table,
    action: 'UPSERT',
    payload,
    retryCount: 0,
    timestamp: Date.now(),
  }

  try {
    const hasIdb = await isIndexedDBAvailable()
    if (hasIdb) {
      await db.syncOutbox.put(item)
    } else {
      memSyncOutbox.set(item.id, item)
    }
  } catch (err) {
    memSyncOutbox.set(item.id, item)
  }

  // Refresh pending count
  await refreshPendingCount()

  // Trigger sync asynchronously in background without awaiting
  triggerDebouncedSync()
}

/**
 * Gets total pending items count in the outbox.
 */
export async function getPendingOutboxCount(): Promise<number> {
  try {
    const hasIdb = await isIndexedDBAvailable()
    if (hasIdb) {
      return await db.syncOutbox.count()
    }
    return memSyncOutbox.size
  } catch {
    return memSyncOutbox.size
  }
}

/**
 * Gets all pending outbox items (for inspection in Dev Console).
 */
export async function getAllPendingOutboxItems(): Promise<SyncOutboxItem[]> {
  try {
    const hasIdb = await isIndexedDBAvailable()
    if (hasIdb) {
      return await db.syncOutbox.orderBy('timestamp').toArray()
    }
    return Array.from(memSyncOutbox.values()).sort((a, b) => a.timestamp - b.timestamp)
  } catch {
    return Array.from(memSyncOutbox.values()).sort((a, b) => a.timestamp - b.timestamp)
  }
}

async function refreshPendingCount(): Promise<number> {
  const count = await getPendingOutboxCount()
  updateState({ pendingCount: count })
  return count
}

let isProcessing = false
let syncTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Triggers a debounced sync run (e.g. 150ms delay to batch simultaneous writes).
 */
export function triggerDebouncedSync(): void {
  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(() => {
    processSyncQueue().catch(() => {})
  }, 150)
}

/**
 * Force sync now (returns result Promise).
 */
export async function forceSyncNow(): Promise<{ success: boolean; synced: number; error?: string }> {
  return await processSyncQueue(true)
}

/**
 * Core outbox processing routine.
 * Sends batch to Supabase RPC sync_batch.
 * Items removed only on confirmed success.
 */
export async function processSyncQueue(
  ignoreBackoff: boolean = false,
): Promise<{ success: boolean; synced: number; error?: string }> {
  if (isProcessing) {
    return { success: false, synced: 0, error: 'Sync already in progress' }
  }

  isProcessing = true
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  if (!isOnline || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    await refreshPendingCount()
    updateState({ status: 'offline' })
    isProcessing = false
    return { success: false, synced: 0, error: 'Offline or Supabase not configured' }
  }

  updateState({ status: 'syncing' })

  try {
    const hasIdb = await isIndexedDBAvailable()
    let items: SyncOutboxItem[] = []

    if (hasIdb) {
      items = await db.syncOutbox.orderBy('timestamp').limit(50).toArray()
    } else {
      items = Array.from(memSyncOutbox.values()).slice(0, 50)
    }

    if (items.length === 0) {
      updateState({ status: 'synced', pendingCount: 0 })
      isProcessing = false
      return { success: true, synced: 0 }
    }

    const now = Date.now()
    const eligibleItems = ignoreBackoff
      ? items
      : items.filter((item) => {
          const backoff = calculateBackoffMs(item.retryCount)
          return now - item.timestamp >= backoff
        })

    if (eligibleItems.length === 0) {
      // Items are waiting for backoff timer
      await refreshPendingCount()
      updateState({ status: 'error' })
      isProcessing = false
      return { success: false, synced: 0, error: 'Eligible items waiting for backoff' }
    }

    // Assemble batch payload grouped by table
    const batchPayload: Record<SyncTable, Array<Record<string, unknown>>> = {
      students: [],
      sessions: [],
      attempts: [],
      gap_reports: [],
      misconception_events: [],
    }

    for (const item of eligibleItems) {
      batchPayload[item.table].push(item.payload)
    }

    // Call Supabase RPC sync_batch
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_payload: batchPayload }),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const errMsg = errJson?.message || `HTTP ${response.status} ${response.statusText}`
      throw new Error(errMsg)
    }

    // RPC Confirmed Success: Delete synced items from outbox
    const syncedIds = eligibleItems.map((item) => item.id)

    if (hasIdb) {
      await db.syncOutbox.bulkDelete(syncedIds)
    } else {
      syncedIds.forEach((id) => memSyncOutbox.delete(id))
    }

    const remaining = await refreshPendingCount()
    updateState({
      status: remaining === 0 ? 'synced' : 'syncing',
      lastSyncedAt: Date.now(),
      lastError: null,
    })

    isProcessing = false

    // If there are more pending items in queue, continue processing
    if (remaining > 0) {
      triggerDebouncedSync()
    }

    return { success: true, synced: syncedIds.length }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Sync batch RPC failed'

    // Update retryCount on failed items
    try {
      const hasIdb = await isIndexedDBAvailable()
      if (hasIdb) {
        const failedItems = await db.syncOutbox.limit(50).toArray()
        for (const item of failedItems) {
          await db.syncOutbox.update(item.id, {
            retryCount: item.retryCount + 1,
            lastError: errorMsg,
          })
        }
      } else {
        memSyncOutbox.forEach((item) => {
          item.retryCount += 1
          item.lastError = errorMsg
        })
      }
    } catch {
      // ignore retry increment errors
    }

    await refreshPendingCount()
    updateState({
      status: 'error',
      lastError: errorMsg,
    })

    isProcessing = false
    return { success: false, synced: 0, error: errorMsg }
  }
}

/**
 * Initializes the background sync engine.
 * - Listens for 'online' events.
 * - Schedules 30s background sync heartbeat.
 * - Runs initial queue flush.
 */
export function initSyncEngine(): () => void {
  const handleOnline = () => {
    triggerDebouncedSync()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
  }

  // Periodic 30s heartbeat
  const intervalId = setInterval(() => {
    processSyncQueue().catch(() => {})
  }, 30000)

  // Initial trigger on app start
  triggerDebouncedSync()

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
    }
    clearInterval(intervalId)
  }
}
