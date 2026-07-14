import { useState } from 'react'
import { apiCall } from '../context/api'
import GlassPanel from './GlassPanel'

/**
 * GuessLockModal
 * Shown when a locked entry's lock type is known and the global date has passed.
 *
 * Props:
 *   entryId       — numeric entry ID
 *   lockType      — 'passcode' | 'riddle'
 *   riddleQuestion — string, shown for riddle locks only
 *   onSuccess()   — called after a successful unlock so parent can refresh
 *   onClose()     — called when the modal is dismissed
 */
export default function GuessLockModal({ entryId, lockType, riddleQuestion, onSuccess, onClose }) {
  const [guess, setGuess] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!guess.trim()) return

    setLoading(true)
    setFailed(false)
    setError('')

    try {
      const result = await apiCall(`/entries/${entryId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ guess: guess.trim() }),
      })

      if (result.success) {
        onSuccess?.()
      } else {
        setFailed(true)
        setGuess('')
      }
    } catch (err) {
      // 403 from the global gate
      if (err.message?.includes('not yet available')) {
        setError('This capsule is still sealed — the unlock date has not passed yet.')
      } else {
        setError(err.message || 'Something went wrong.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <GlassPanel className="modal-card guess-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>

        <div className="guess-modal-header">
          <span className="guess-modal-icon">{lockType === 'riddle' ? '🧩' : '🔑'}</span>
          <h2>{lockType === 'riddle' ? 'Solve the Riddle' : 'Enter Passcode'}</h2>
        </div>

        {lockType === 'riddle' && riddleQuestion && (
          <div className="riddle-question-box">
            <p className="riddle-question-label">The question:</p>
            <p className="riddle-question-text">"{riddleQuestion}"</p>
            <p className="riddle-hint">Close answers are accepted — don't worry about spelling!</p>
          </div>
        )}

        {lockType === 'passcode' && (
          <p className="guess-modal-tip">
            Enter the passcode the sender set for this entry.
          </p>
        )}

        {failed && (
          <div className="guess-result-banner guess-fail">
            ❌ Wrong answer. Try again — no hints!
          </div>
        )}

        {error && (
          <div className="guess-result-banner guess-error">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="guess-form">
          <input
            type={lockType === 'passcode' ? 'password' : 'text'}
            className="guess-input"
            placeholder={lockType === 'riddle' ? 'Your answer...' : 'Passcode...'}
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            autoFocus
            disabled={loading}
            autoComplete="off"
          />
          <div className="guess-form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !guess.trim()}
            >
              {loading ? 'Checking...' : '🔓 Try Unlock'}
            </button>
          </div>
        </form>
      </GlassPanel>
    </div>
  )
}
