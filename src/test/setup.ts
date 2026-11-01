import { vi, beforeAll } from 'vitest'

// Force unconfigured / offline-fallback in all unit test environments
vi.stubEnv('VITE_SUPABASE_URL', '')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

// Global network guard: unit tests must NEVER touch the network
beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      throw new Error(
        `NETWORK CALL BLOCKED: Unit tests must never make real network requests! Attempted fetch to: ${url}`,
      )
    }),
  )
})
