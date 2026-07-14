import { useState } from 'react'
import { apiCall } from '../context/api'
import GlassPanel from './GlassPanel'

export default function InvitePanel({ threadId }) {
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function generateInvite() {
    setLoading(true)
    setError('')
    try {
      const data = await apiCall(`/threads/${threadId}/invite`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setInvite(data)
    } catch (err) {
      setError(err.message || 'Failed to generate invite.')
    } finally {
      setLoading(false)
    }
  }

  const joinUrl = invite ? `${window.location.origin}/join/${invite.code}` : ''

  function copyToClipboard() {
    if (!joinUrl) return
    navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <GlassPanel className="invite-panel">
      <h3>Invite Friends</h3>
      <p className="invite-description">
        Share this code or link with friends to let them join this thread.
      </p>

      {error && <p className="form-error">{error}</p>}

      {!invite ? (
        <button
          className="btn-secondary"
          onClick={generateInvite}
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Generate Invite Link'}
        </button>
      ) : (
        <div className="invite-result">
          <div className="invite-link-wrapper">
            <input
              type="text"
              readOnly
              value={joinUrl}
              className="invite-url-input"
              onClick={(e) => e.target.select()}
            />
            <button className="btn-copy" onClick={copyToClipboard}>
              {copied ? 'Copied! ✅' : 'Copy'}
            </button>
          </div>
          <span className="invite-code-label">
            Code: <code>{invite.code}</code>
          </span>
        </div>
      )}
    </GlassPanel>
  )
}
