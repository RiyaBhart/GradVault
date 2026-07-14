import { useState, useEffect } from 'react'
import { apiCall } from '../context/api'
import GuessLockModal from './GuessLockModal'
import GlassPanel from './GlassPanel'

export default function LockedEntryCard({ entry, members, isSiteUnlocked, onUnlockSuccess }) {
  const [showGuessModal, setShowGuessModal] = useState(false)
  const [autoUnlocking, setAutoUnlocking] = useState(false)

  const author = members.find((m) => m.user_id === entry.author_id)
  const authorName = author ? author.nickname : `User #${entry.author_id}`
  const authorSticker = author ? author.avatar_sticker : '👤'

  const formattedDate = new Date(entry.created_at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  // Auto-unlock entries that have no per-entry lock once the site gate opens.
  // These entries require no user interaction — the date gate alone is enough.
  useEffect(() => {
    if (!isSiteUnlocked) return         // gate still closed
    if (entry.has_lock) return          // has a passcode/riddle — user must solve it
    if (entry.is_unlocked) return       // already recorded
    if (autoUnlocking) return

    setAutoUnlocking(true)
    apiCall(`/entries/${entry.id}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ guess: '' }),  // no lock → guess is ignored by server
    })
      .then((result) => {
        if (result?.success && onUnlockSuccess) {
          // Pass null for the ID — no animation for auto-unlocked entries
          onUnlockSuccess(null)
        }
      })
      .catch(() => {
        /* silently ignore — will retry on next render */
      })
      .finally(() => setAutoUnlocking(false))
  }, [isSiteUnlocked, entry.has_lock, entry.is_unlocked, entry.id])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GlassPanel variant="solid" className="locked-entry-card">
      <div className="entry-header">
        <div className="author-info">
          <span className="author-sticker">{authorSticker}</span>
          <div className="author-text">
            <span className="author-nickname">{authorName}</span>
          </div>
        </div>
        <div className="entry-tags">
          {entry.has_lock
            ? <span className="entry-locked-badge">🔒 Locked</span>
            : <span className="entry-locked-badge">🔒 Sealed</span>
          }
          <span className="entry-type-tag">
            {entry.entry_type === 'photo' ? '📸 Photo' : '✉️ Letter'}
          </span>
        </div>
      </div>

      <div className="entry-bodylocked">
        <div className="lock-illustration">
          <span className="lock-emoji">🔒</span>
          <span className="lock-status">Time-locked</span>
        </div>
        <p className="locked-placeholder-text">
          {`This ${entry.entry_type === 'photo' ? 'photo' : 'letter'} is sealed in the capsule.`}
        </p>

        {/* Show unlock button only when: site gate is open + there IS a per-entry lock */}
        {entry.has_lock && isSiteUnlocked && (
          <button
            className="btn-primary btn-try-unlock"
            onClick={() => setShowGuessModal(true)}
          >
            {entry.lock_type === 'riddle' ? '🧩 Solve Riddle' : '🔑 Enter Passcode'}
          </button>
        )}

        {/* Auto-unlock progress indicator */}
        {autoUnlocking && (
          <p className="auto-unlock-hint">✨ Opening...</p>
        )}
      </div>

      <div className="entry-footer">
        <span className="entry-date">{formattedDate}</span>
      </div>

      {showGuessModal && (
        <GuessLockModal
          entryId={entry.id}
          lockType={entry.lock_type}
          riddleQuestion={entry.riddle_question}
          onSuccess={() => {
            setShowGuessModal(false)
            // Pass the entry ID so ThreadPage knows to play the animation
            if (onUnlockSuccess) onUnlockSuccess(entry.id)
          }}
          onClose={() => setShowGuessModal(false)}
        />
      )}
    </GlassPanel>
  )
}
