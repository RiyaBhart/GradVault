import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiCall } from '../context/api'
import { useAuth } from '../context/AuthContext'

export default function JoinPage() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(true)

  useEffect(() => {
    // If not logged in, save the path in sessionStorage for post-auth redirection
    if (!user) {
      sessionStorage.setItem('redirect_after_login', `/join/${code}`)
      // Navigate to home (auth screen)
      navigate('/')
      return
    }

    async function acceptInvite() {
      try {
        const cleanCode = code ? code.trim().toUpperCase() : ''
        const result = await apiCall(`/invites/${cleanCode}/accept`, {
          method: 'POST',
        })
        // Redirect to the newly joined thread
        navigate(`/threads/${result.thread_id}`)
      } catch (err) {
        setError(err.message || 'Could not join thread. The link may have expired or is invalid.')
      } finally {
        setJoining(false)
      }
    }

    acceptInvite()
  }, [code, user, navigate])

  if (!user) {
    return (
      <div className="join-container">
        <p className="loading-state">Redirecting to sign in...</p>
      </div>
    )
  }

  return (
    <div className="join-container">
      <div className="join-card">
        <span className="join-icon">{joining ? '🔄' : error ? '❌' : '🎉'}</span>
        <h1>{error ? 'Oops!' : 'Joining Thread'}</h1>
        
        {joining ? (
          <p className="join-status">Accepting invite invitation, please wait...</p>
        ) : error ? (
          <div className="empty-state" style={{ marginTop: '1rem', padding: '1rem' }}>
            <p className="error-message" style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>{error}</p>
            <p className="empty-subtext" style={{ marginBottom: '1.5rem' }}>This invite link may have expired or is invalid. Ask your friend for a new one!</p>
            <Link to="/" className="btn-primary" style={{ display: 'inline-block', width: 'auto', padding: '0.6rem 1.5rem' }}>Go to My Threads</Link>
          </div>
        ) : (
          <p className="join-status">Joined successfully! Redirecting you now...</p>
        )}
      </div>
    </div>
  )
}
