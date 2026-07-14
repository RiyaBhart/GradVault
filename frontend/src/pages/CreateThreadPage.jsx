import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiCall } from '../context/api'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import GlassPanel from '../components/GlassPanel'

export default function CreateThreadPage() {
  const { user } = useAuth()
  const [type, setType] = useState('pair') // 'pair' | 'group'
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Please enter a thread title.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const newThread = await apiCall('/threads', {
        method: 'POST',
        body: JSON.stringify({
          type,
          title: title.trim(),
        }),
      })
      navigate(`/threads/${newThread.id}`)
    } catch (err) {
      setError(err.message || 'Failed to create thread.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-container">
      <GlassPanel variant="light" className="app-header">
        <div className="header-left">
          <Link to="/" className="btn-back">← Back to Threads</Link>
        </div>
        <div className="header-right">
          <ThemeToggle />
          <span className="user-sticker">{user?.avatar_sticker}</span>
          <span className="user-nickname">{user?.nickname}</span>
        </div>
      </GlassPanel>

      <main className="main-content">
        <div className="form-card-container">
          <GlassPanel style={{ padding: '2rem 2.25rem' }}>
            <h1>Create a New Thread</h1>
            <p className="form-subtitle">Choose who you want to share this time-locked space with.</p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="field-group">
                <label>Thread Type</label>
                <div className="type-toggle-group">
                  <button
                    type="button"
                    className={`type-toggle-btn ${type === 'pair' ? 'active' : ''}`}
                    onClick={() => setType('pair')}
                  >
                    <span className="type-icon">👥</span>
                    <span className="type-label">Pair</span>
                    <span className="type-desc">For just you and one friend</span>
                  </button>
                  <button
                    type="button"
                    className={`type-toggle-btn ${type === 'group' ? 'active' : ''}`}
                    onClick={() => setType('group')}
                  >
                    <span className="type-icon">📣</span>
                    <span className="type-label">Group</span>
                    <span className="type-desc">For multiple friends to join</span>
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="thread-title">Thread Title</label>
                <input
                  id="thread-title"
                  type="text"
                  placeholder="e.g. Summer Memories 2026, Alice & Bob"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}

              <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: '1rem' }}>
                {submitting ? 'Creating Thread...' : 'Create Thread'}
              </button>
            </form>
          </GlassPanel>
        </div>
      </main>
    </div>
  )
}
