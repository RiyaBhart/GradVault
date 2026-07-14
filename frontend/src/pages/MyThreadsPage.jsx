import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiCall } from '../context/api'
import StreakBadge from '../components/StreakBadge'
import ThemeToggle from '../components/ThemeToggle'
import GraduationCap from '../components/GraduationCap'
import GlassPanel from '../components/GlassPanel'
import { useAuth } from '../context/AuthContext'

export default function MyThreadsPage() {
  const { user, logout } = useAuth()
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchThreads() {
      try {
        const data = await apiCall('/threads')
        setThreads(data || [])
      } catch (err) {
        setError(err.message || 'Failed to load threads.')
      } finally {
        setLoading(false)
      }
    }
    fetchThreads()
  }, [])

  return (
    <div className="app-container">
      <GlassPanel variant="light" className="app-header">
        <div className="header-left header-logo-container">
          <GraduationCap />
          <span className="logo-text">GradVault</span>
        </div>
        <div className="header-right">
          <ThemeToggle />
          <span className="user-sticker" title={`Streak: ${user?.streak_count || 0}`}>{user?.avatar_sticker}</span>
          <span className="user-nickname">{user?.nickname}</span>
          <StreakBadge streakCount={user?.streak_count} />
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </GlassPanel>

      <main className="main-content">
        <GlassPanel style={{ padding: '2rem' }}>
          <div className="section-header">
            <h1>My Threads</h1>
            <Link to="/threads/new" className="btn-primary btn-new-thread">
              + New Thread
            </Link>
          </div>

          {loading ? (
            <p className="loading-state">Loading threads...</p>
          ) : error ? (
            <p className="error-state">{error}</p>
          ) : threads.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <p>You don't have any threads yet.</p>
              <p className="empty-subtext">Create a thread to start locking memories or ask a friend for their invite link!</p>
              <Link to="/threads/new" className="btn-primary" style={{ display: 'inline-block', width: 'auto', marginTop: '1rem', padding: '0.6rem 1.5rem' }}>
                Create a Thread
              </Link>
            </div>
          ) : (
            <div className="threads-grid">
              {threads.map((thread) => (
                <Link key={thread.id} to={`/threads/${thread.id}`} className="thread-card-link">
                  <div className="thread-card">
                    <div className="thread-card-header">
                      <span className="thread-type-badge">{thread.type}</span>
                      <span className="thread-date">
                        {new Date(thread.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="thread-title">{thread.title}</h3>
                    <div className="thread-card-footer">
                      <span>Enter thread →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </GlassPanel>
      </main>
    </div>
  )
}
