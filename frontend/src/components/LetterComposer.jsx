import { useState } from 'react'
import { apiCall } from '../context/api'
import { useRef } from 'react'
import LockPicker from './LockPicker'
import SongPicker from './SongPicker'

export default function LetterComposer({ threadId, onPost }) {
  const [content, setContent] = useState('')
  const [theme, setTheme] = useState('classic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const lockPickerRef = useRef(null)
  const songPickerRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!content.trim()) {
      setError('Please write something before posting.')
      return
    }

    // Validate lock fields if a lock type is selected
    if (lockPickerRef.current && !lockPickerRef.current.isValid()) {
      setError('Please complete the lock fields or choose "No Lock".')
      return
    }

    // Validate YouTube URL if entered
    if (songPickerRef.current && !songPickerRef.current.isValid()) {
      setError('Please fix the YouTube song link or remove it.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const lock = lockPickerRef.current?.getLockPayload() ?? null
      const youtube_url = songPickerRef.current?.getYouTubeUrl() ?? null
      await apiCall(`/threads/${threadId}/entries/letter`, {
        method: 'POST',
        body: JSON.stringify({
          text_content: content.trim(),
          theme,
          ...(lock ? { lock } : {}),
          ...(youtube_url ? { youtube_url } : {}),
        }),
      })
      setContent('')
      songPickerRef.current?.reset()
      if (onPost) onPost()
    } catch (err) {
      setError(err.message || 'Failed to post entry.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="letter-composer">
      <h3>Drop a New Letter</h3>
      <p className="composer-tip">
        Once posted, your letter is instantly locked. No one (not even you) can read it yet!
      </p>

      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Dear future self, or dear friends... write your thoughts here."
          rows={5}
          disabled={loading}
          required
        />

        <LockPicker ref={lockPickerRef} />

        <div className="theme-picker">
          <span className="theme-picker-title">Theme <span className="optional-tag">optional</span></span>
          <div className="theme-options">
            <button type="button" className={`theme-btn ${theme === 'classic' ? 'active' : ''}`} onClick={() => setTheme('classic')}>📜 Classic</button>
            <button type="button" className={`theme-btn ${theme === 'floral' ? 'active' : ''}`} onClick={() => setTheme('floral')}>🌸 Floral</button>
            <button type="button" className={`theme-btn ${theme === 'night' ? 'active' : ''}`} onClick={() => setTheme('night')}>🌌 Night</button>
          </div>
        </div>

        <SongPicker ref={songPickerRef} />

        {error && <p className="form-error">{error}</p>}

        <div className="composer-actions">
          <button type="submit" className="btn-primary" disabled={loading || !content.trim()}>
            {loading ? 'Locking Letter...' : '🔒 Lock Letter'}
          </button>
        </div>
      </form>
    </div>
  )
}
