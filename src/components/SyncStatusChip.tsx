import { useState, useEffect } from 'react'
import { subscribeSyncState, forceSyncNow, type SyncState } from '../services/syncEngine'

export function SyncStatusChip() {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'offline',
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
  })
  const [isSyncingManually, setIsSyncingManually] = useState(false)

  useEffect(() => {
    return subscribeSyncState((st) => setSyncState(st))
  }, [])

  const handleManualSync = async () => {
    if (isSyncingManually) return
    setIsSyncingManually(true)
    try {
      await forceSyncNow()
    } finally {
      setIsSyncingManually(false)
    }
  }

  let label = 'Offline (saved locally)'
  let chipClass = 'sync-chip-offline'
  let icon = '⚪'

  if (syncState.status === 'syncing' || isSyncingManually) {
    label = syncState.pendingCount > 0 ? `Syncing (${syncState.pendingCount})...` : 'Syncing...'
    chipClass = 'sync-chip-syncing'
    icon = '🟡'
  } else if (syncState.status === 'synced') {
    label = syncState.pendingCount === 0 ? 'All saved' : `Pending (${syncState.pendingCount})`
    chipClass = 'sync-chip-synced'
    icon = '🟢'
  } else if (syncState.status === 'error') {
    label = syncState.pendingCount > 0 ? `Retry (${syncState.pendingCount})` : 'Sync error'
    chipClass = 'sync-chip-error'
    icon = '🔴'
  } else if (syncState.status === 'offline') {
    label = syncState.pendingCount > 0 ? `Offline (${syncState.pendingCount} local)` : 'Offline (saved locally)'
    chipClass = 'sync-chip-offline'
    icon = '⚪'
  }

  return (
    <button
      type="button"
      className={`chip sync-status-chip ${chipClass}`}
      onClick={handleManualSync}
      title={
        syncState.lastSyncedAt
          ? `Last synced: ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}. Click to force sync.`
          : 'Sync status. Click to trigger sync.'
      }
      aria-label={`Sync status: ${label}`}
    >
      <span aria-hidden="true" className="sync-chip-dot">{icon}</span>
      <span className="chip-text">{label}</span>
    </button>
  )
}
