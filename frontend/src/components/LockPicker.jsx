import { useState, useImperativeHandle, forwardRef } from 'react'

/**
 * LockPicker
 * Collapsible panel for choosing an optional per-entry lock at creation time.
 * Mode: 'none' | 'passcode' | 'riddle'
 *
 * Exposed via forwardRef so parent can call getLockPayload() to retrieve
 * the lock object (or null if no lock chosen).
 */
const LockPicker = forwardRef(function LockPicker(_, ref) {
  const [mode, setMode] = useState('none')
  const [passcode, setPasscode] = useState('')
  const [riddleQuestion, setRiddleQuestion] = useState('')
  const [riddleAnswer, setRiddleAnswer] = useState('')
  const [showPasscode, setShowPasscode] = useState(false)

  // Expose getLockPayload() to parent via ref
  useImperativeHandle(ref, () => ({
    getLockPayload() {
      if (mode === 'none') return null
      if (mode === 'passcode') {
        if (!passcode.trim()) return null
        return { lock_type: 'passcode', passcode: passcode.trim() }
      }
      if (mode === 'riddle') {
        if (!riddleQuestion.trim() || !riddleAnswer.trim()) return null
        return {
          lock_type: 'riddle',
          riddle_question: riddleQuestion.trim(),
          riddle_answer: riddleAnswer.trim(),
        }
      }
      return null
    },
    isValid() {
      if (mode === 'none') return true
      if (mode === 'passcode') return passcode.trim().length > 0
      if (mode === 'riddle') return riddleQuestion.trim().length > 0 && riddleAnswer.trim().length > 0
      return true
    },
  }))

  return (
    <div className="lock-picker">
      <div className="lock-picker-header">
        <span className="lock-picker-icon">🔐</span>
        <span className="lock-picker-title">Add a Personal Lock <span className="optional-tag">optional</span></span>
      </div>

      <div className="lock-mode-group">
        <button
          type="button"
          className={`lock-mode-btn ${mode === 'none' ? 'active' : ''}`}
          onClick={() => setMode('none')}
        >
          No Lock
        </button>
        <button
          type="button"
          className={`lock-mode-btn ${mode === 'passcode' ? 'active' : ''}`}
          onClick={() => setMode('passcode')}
        >
          🔑 Passcode
        </button>
        <button
          type="button"
          className={`lock-mode-btn ${mode === 'riddle' ? 'active' : ''}`}
          onClick={() => setMode('riddle')}
        >
          🧩 Riddle
        </button>
      </div>

      {mode === 'passcode' && (
        <div className="lock-fields">
          <label className="lock-label">
            Secret Passcode
            <span className="lock-hint">The recipient must type this exactly to unlock.</span>
          </label>
          <div className="passcode-input-wrapper">
            <input
              type={showPasscode ? 'text' : 'password'}
              className="lock-input"
              placeholder="e.g. ourSecretWord"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="passcode-toggle"
              onClick={() => setShowPasscode((p) => !p)}
              title={showPasscode ? 'Hide passcode' : 'Show passcode'}
            >
              {showPasscode ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
      )}

      {mode === 'riddle' && (
        <div className="lock-fields">
          <label className="lock-label">
            Your Riddle
            <span className="lock-hint">The question the recipient will see.</span>
          </label>
          <textarea
            className="lock-input lock-textarea"
            placeholder="e.g. What was the name of our favorite café?"
            value={riddleQuestion}
            onChange={(e) => setRiddleQuestion(e.target.value)}
            rows={2}
          />
          <label className="lock-label" style={{ marginTop: '0.75rem' }}>
            Answer
            <span className="lock-hint">Typos are forgiven — close matches are accepted.</span>
          </label>
          <input
            type="text"
            className="lock-input"
            placeholder="e.g. The Blue Door"
            value={riddleAnswer}
            onChange={(e) => setRiddleAnswer(e.target.value)}
          />
        </div>
      )}
    </div>
  )
})

export default LockPicker
