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
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [showJoinMenu, setShowJoinMenu] = useState(false)
  const [showInviteInput, setShowInviteInput] = useState(false)
  const navigate = useNavigate()

  // Close menu on outside click or escape
  useEffect(() => {
    function handleGlobalClick(e) {
      if (!e.target.closest('.join-menu-container')) {
        setShowJoinMenu(false)
        setShowInviteInput(false)
      }
    }
    if (showJoinMenu) {
      document.addEventListener('mousedown', handleGlobalClick)
    }
    return () => document.removeEventListener('mousedown', handleGlobalClick)
  }, [showJoinMenu])

  async function handleJoinSubmit() {
    if (!inviteCode.trim()) return
    setJoining(true)
    setJoinError('')
    try {
      const res = await apiCall(`/invites/${inviteCode.trim()}/accept`, { method: 'POST' })
      navigate(`/threads/${res.thread_id}`)
    } catch (err) {
      setJoinError('Invalid or expired code.')
    } finally {
      setJoining(false)
    }
  }

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
          <div className="join-menu-container" style={{ position: 'relative' }}>
            <button 
              className="btn-icon" 
              onClick={() => setShowJoinMenu(!showJoinMenu)}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--brand-primary)', color: 'white', border: 'none',
                cursor: 'pointer', fontSize: '1.2rem', marginLeft: '0.5rem', fontWeight: 'bold'
              }}
              title="Join or Create"
            >
              +
            </button>
            {showJoinMenu && (
              <GlassPanel className="join-menu-popover" style={{
                position: 'absolute', top: '120%', right: '0', zIndex: 100,
                width: '240px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
              }}>
                {!showInviteInput ? (
                  <>
                    <button 
                      className="btn-secondary" 
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => navigate('/threads/new')}
                    >
                      Create a new thread
                    </button>
                    <button 
                      className="btn-secondary" 
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => setShowInviteInput(true)}
                    >
                      Enter an invite code
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      placeholder="Enter code..." 
                      value={inviteCode} 
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '100%' }}
                      disabled={joining}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn-secondary" 
                        onClick={() => setShowInviteInput(false)}
                        disabled={joining}
                        style={{ flex: 1, padding: '0.5rem' }}
                      >
                        Back
                      </button>
                      <button 
                        className="btn-primary" 
                        onClick={handleJoinSubmit} 
                        disabled={joining || !inviteCode.trim()}
                        style={{ flex: 1, padding: '0.5rem' }}
                      >
                        {joining ? '...' : 'Join'}
                      </button>
                    </div>
                    {joinError && <span style={{ color: '#ff4d4d', fontSize: '0.85rem' }}>{joinError}</span>}
                  </div>
                )}
              </GlassPanel>
            )}
          </div>
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
