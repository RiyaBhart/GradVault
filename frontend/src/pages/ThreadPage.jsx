import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiCall, apiFetch } from '../context/api'
import StreakBadge from '../components/StreakBadge'
import { useAuth } from '../context/AuthContext'
import InvitePanel from '../components/InvitePanel'
import LetterComposer from '../components/LetterComposer'
import CameraCapture from '../components/CameraCapture'
import LockedEntryCard from '../components/LockedEntryCard'
import RevealedEntryCard from '../components/RevealedEntryCard'
import CountdownTimer from '../components/CountdownTimer'
import ThemeToggle from '../components/ThemeToggle'
import GlassPanel from '../components/GlassPanel'

export default function ThreadPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('letter') // 'letter' | 'photo'
  const [isSiteUnlocked, setIsSiteUnlocked] = useState(false)
  const [justUnlockedId, setJustUnlockedId] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const fetchThreadDetails = useCallback(async () => {
    try {
      const threadData = await apiCall(`/threads/${id}`)
      setData(threadData)
    } catch (err) {
      setError(err.message || 'Failed to load thread details.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchThreadDetails()
  }, [fetchThreadDetails])

  // Called by LockedEntryCard after a successful unlock.
  // entryId is null for auto-unlocked (no-lock) entries — no animation for those.
  function handleUnlockSuccess(entryId) {
    if (entryId !== null) {
      setJustUnlockedId(entryId)
    }
    fetchThreadDetails()
  }

  async function handleExportThread() {
    setIsExporting(true)
    setExportError('')
    try {
      const res = await apiFetch(`/threads/${id}/export`)
      const blob = await res.blob()

      let fileName = `gradvault-${data?.thread?.title || 'thread'}.pdf`
      const contentDisposition = res.headers.get('content-disposition')
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/)
        if (match && match[1]) {
          fileName = match[1]
        }
      }

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err.message || 'Failed to export thread.')
    } finally {
      setIsExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="app-container">
        <GlassPanel variant="light" className="app-header">
          <div className="header-left">
            <Link to="/" className="btn-back">← My Threads</Link>
          </div>
          <div className="header-right">
            <ThemeToggle />
          </div>
        </GlassPanel>
        <main className="main-content">
          <p className="loading-state">Loading thread...</p>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="app-container">
        <GlassPanel variant="light" className="app-header">
          <div className="header-left">
            <Link to="/" className="btn-back">← My Threads</Link>
          </div>
          <div className="header-right">
            <ThemeToggle />
          </div>
        </GlassPanel>
        <main className="main-content">
          <p className="error-state">{error || 'Thread not found.'}</p>
        </main>
      </div>
    )
  }

  const { thread, members, entries } = data

  return (
    <div className="app-container">
      <GlassPanel variant="light" className="app-header">
        <div className="header-left">
          <Link to="/" className="btn-back">← My Threads</Link>
        </div>
        <div className="header-right">
          <ThemeToggle />
          <span className="user-sticker">{user?.avatar_sticker}</span>
          <span className="user-nickname">{user?.nickname}</span>
          <StreakBadge streakCount={user?.streak_count} />
        </div>
      </GlassPanel>

      <main className="main-content thread-view-layout">
        <GlassPanel style={{ padding: '1.5rem' }} className="thread-main">
          <CountdownTimer onUnlockedChange={setIsSiteUnlocked} />

          <div className="thread-title-area">
            <div className="title-top-row">
              <span className="thread-type-badge">{thread.type}</span>
              <button
                className="btn-export-thread"
                onClick={handleExportThread}
                disabled={isExporting}
                title="Download unlocked entries as a self-contained HTML keepsake"
              >
                {isExporting ? '⏳ Exporting...' : '📥 Export Thread'}
              </button>
            </div>
            <h1>{thread.title}</h1>
            <span className="thread-created-date">
              Created on {new Date(thread.created_at).toLocaleDateString()}
            </span>
            {exportError && <p className="export-error">{exportError}</p>}
          </div>

          <div className="composer-tab-group">
            <button
              className={`composer-tab-btn ${activeTab === 'letter' ? 'active' : ''}`}
              onClick={() => setActiveTab('letter')}
            >
              ✉️ Write Letter
            </button>
            <button
              className={`composer-tab-btn ${activeTab === 'photo' ? 'active' : ''}`}
              onClick={() => setActiveTab('photo')}
            >
            📸 Photo / Video
            </button>
          </div>

          {activeTab === 'letter' ? (
            <LetterComposer threadId={thread.id} onPost={fetchThreadDetails} />
          ) : (
            <CameraCapture threadId={thread.id} onPost={fetchThreadDetails} />
          )}

          <div className="thread-timeline">
            <h2>Capsule Timeline ({entries.length} entries)</h2>
            {entries.length === 0 ? (
              <div className="empty-timeline">
                <span className="empty-timeline-icon">🔒</span>
                <p>No locked entries in this thread yet.</p>
                <p className="empty-timeline-sub">Be the first to drop a locked letter or photo!</p>
              </div>
            ) : (
              <div className="entries-timeline">
                {entries.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📭</span>
                    <p>No memories locked in this thread yet.</p>
                    <p className="empty-subtext">Be the first to drop a photo or video above!</p>
                  </div>
                ) : (
                  entries.map((entry) =>
                    // If the global date has passed AND the user has an entry_unlocks row
                    (isSiteUnlocked && entry.is_unlocked) ? (
                      // This user has already solved this entry — show the content.
                      // playAnimation=true ONLY if it was just unlocked in this session.
                      <RevealedEntryCard
                        key={entry.id}
                        entry={entry}
                        members={members}
                        playAnimation={justUnlockedId === entry.id}
                      />
                    ) : (
                      // Still locked — show the sealed placeholder + unlock button.
                      <LockedEntryCard
                        key={entry.id}
                        entry={entry}
                        members={members}
                        isSiteUnlocked={isSiteUnlocked}
                        onUnlockSuccess={handleUnlockSuccess}
                      />
                    )
                  )
                )}
              </div>
            )}
          </div>
        </GlassPanel>

        <aside className="thread-sidebar">
          <InvitePanel threadId={thread.id} />

          <GlassPanel className="members-panel">
            <h3>Thread Members ({members.length})</h3>
            <div className="members-list">
              {members.map((member) => (
                <div key={member.user_id} className="member-row">
                  <span className="member-avatar">{member.avatar_sticker || '👤'}</span>
                  <div className="member-details">
                    <span className="member-name">{member.nickname}</span>
                    <span className="member-uname">@{member.username}</span>
                  </div>
                  {member.user_id === thread.created_by && (
                    <span className="creator-badge" title="Creator">👑</span>
                  )}
                </div>
              ))}
            </div>
          </GlassPanel>
        </aside>
      </main>
    </div>
  )
}
