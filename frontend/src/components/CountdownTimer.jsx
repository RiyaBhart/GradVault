import { useState, useEffect, useRef } from 'react'
import { apiCall } from '../context/api'
import GraduationCap from './GraduationCap'

/**
 * CountdownTimer
 * Driven by GET /site/config (server time + unlock_date).
 * Corrects for client clock drift using a computed offset from the server.
 * Re-syncs every 60 s to stay accurate on long sessions.
 *
 * Props:
 *   onUnlockedChange(bool) — called whenever the site lock state changes.
 */
export default function CountdownTimer({ onUnlockedChange }) {
  const [unlockDate, setUnlockDate] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)   // ms until unlock
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [error, setError] = useState('')
  const offsetRef = useRef(0)  // ms difference: serverTime - Date.now()

  // Fetch server config and compute offset
  async function syncConfig() {
    try {
      const data = await apiCall('/site/config', { method: 'GET' })
      const serverNow = new Date(data.server_time).getTime()
      const clientNow = Date.now()
      offsetRef.current = serverNow - clientNow
      setUnlockDate(new Date(data.unlock_date).getTime())
      setError('')
    } catch {
      setError('Could not load site config.')
    }
  }

  // Initial sync + re-sync every 60 s
  useEffect(() => {
    syncConfig()
    const interval = setInterval(syncConfig, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Tick every second, computing corrected "now"
  useEffect(() => {
    if (unlockDate === null) return
    const tick = () => {
      const correctedNow = Date.now() + offsetRef.current
      const diff = unlockDate - correctedNow
      if (diff <= 0) {
        setTimeLeft(0)
        if (!isUnlocked) {
          setIsUnlocked(true)
          onUnlockedChange?.(true)
        }
      } else {
        setTimeLeft(diff)
        if (isUnlocked) {
          setIsUnlocked(false)
          onUnlockedChange?.(false)
        }
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [unlockDate])  // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return null  // silently hide on error (non-critical widget)
  if (timeLeft === null) return null  // still loading

  if (isUnlocked) {
    return (
      <div className="countdown-banner countdown-unlocked">
        <span className="countdown-icon"><GraduationCap /></span>
        <span className="countdown-label">Capsule is open! All entries can be unlocked.</span>
      </div>
    )
  }

  const totalSecs = Math.floor(timeLeft / 1000)
  const days  = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins  = Math.floor((totalSecs % 3600) / 60)
  const secs  = totalSecs % 60

  const pad = (n) => String(n).padStart(2, '0')

  return (
    <div className="countdown-banner countdown-locked">
      <span className="countdown-icon"><GraduationCap /></span>
      <div className="countdown-content">
        <span className="countdown-label">Unlocks in</span>
        <div className="countdown-digits">
          <div className="digit-block">
            <span className="digit">{pad(days)}</span>
            <span className="digit-unit">d</span>
          </div>
          <span className="digit-sep">:</span>
          <div className="digit-block">
            <span className="digit">{pad(hours)}</span>
            <span className="digit-unit">h</span>
          </div>
          <span className="digit-sep">:</span>
          <div className="digit-block">
            <span className="digit">{pad(mins)}</span>
            <span className="digit-unit">m</span>
          </div>
          <span className="digit-sep">:</span>
          <div className="digit-block">
            <span className="digit">{pad(secs)}</span>
            <span className="digit-unit">s</span>
          </div>
        </div>
      </div>
    </div>
  )
}
