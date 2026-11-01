import { useEffect, useRef, useState } from 'react'
import { updateSessionActiveSeconds } from '../services/api'

/**
 * Tracks active seconds for a session according to the strict rule:
 * "count time only while the tab is visible and the user interacted in the last 60 seconds
 * (track with visibilitychange and tap/scroll/key events). Do not count idle time."
 */
export function useActiveTracker(sessionId: string | null, initialSeconds = 0) {
  const [activeSeconds, setActiveSeconds] = useState(initialSeconds)
  const activeSecondsRef = useRef(initialSeconds)
  const lastInteractionRef = useRef<number>(0)
  const sessionIdRef = useRef(sessionId)

  useEffect(() => {
    sessionIdRef.current = sessionId
    activeSecondsRef.current = activeSeconds
  }, [sessionId, activeSeconds])

  useEffect(() => {
    if (!sessionId) return

    lastInteractionRef.current = Date.now()

    const registerInteraction = () => {
      lastInteractionRef.current = Date.now()
    }

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach((evt) => {
      window.addEventListener(evt, registerInteraction, { passive: true })
    })

    const interval = window.setInterval(() => {
      if (typeof document === 'undefined') return

      const isVisible = document.visibilityState === 'visible'
      const interactedRecently = Date.now() - lastInteractionRef.current <= 60000

      if (isVisible && interactedRecently) {
        setActiveSeconds((prev) => {
          const next = prev + 1
          activeSecondsRef.current = next
          return next
        })
      }
    }, 1000)

    // Sync to DB periodically every 5 seconds
    const syncInterval = window.setInterval(() => {
      if (sessionIdRef.current) {
        updateSessionActiveSeconds(sessionIdRef.current, activeSecondsRef.current).catch(console.error)
      }
    }, 5000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && sessionIdRef.current) {
        updateSessionActiveSeconds(sessionIdRef.current, activeSecondsRef.current).catch(console.error)
      } else if (document.visibilityState === 'visible') {
        lastInteractionRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(interval)
      window.clearInterval(syncInterval)
      events.forEach((evt) => {
        window.removeEventListener(evt, registerInteraction)
      })
      document.removeEventListener('visibilitychange', onVisibilityChange)

      // Flush final active seconds on unmount
      if (sessionIdRef.current) {
        updateSessionActiveSeconds(sessionIdRef.current, activeSecondsRef.current).catch(console.error)
      }
    }
  }, [sessionId])

  return {
    activeSeconds,
    getActiveSeconds: () => activeSecondsRef.current,
  }
}
