import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const AVATAR_OPTIONS = ['✉️', '📸', '🌙', '⭐', '🌸', '🎵', '🦋', '🔮']

export default function SignupForm({ onSwitch }) {
  const { setAuth } = useAuth()
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [avatarSticker, setAvatarSticker] = useState('✉️')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    try {
      // 1. Create the account
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          nickname: nickname.trim(),
          password,
          avatar_sticker: avatarSticker,
        }),
      })
      const signupData = await signupRes.json()
      if (!signupRes.ok) {
        setError(signupData.detail || 'Signup failed.')
        return
      }

      // 2. Immediately log in so the user lands on the home page
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
        }),
      })
      const loginData = await loginRes.json()
      if (!loginRes.ok) {
        // Account created but login failed — ask them to sign in manually
        setError('Account created! Please sign in.')
        onSwitch()
        return
      }
      await setAuth(loginData.access_token)
    } catch {
      setError('Network error — is the backend running?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
        <div className="field-group">
          <label htmlFor="signup-username">Username</label>
          <input
            id="signup-username"
            type="text"
            autoComplete="username"
            placeholder="letters, numbers, underscores"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="field-group">
          <label htmlFor="signup-nickname">Nickname</label>
          <input
            id="signup-nickname"
            type="text"
            autoComplete="nickname"
            placeholder="how friends will see you"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
          />
        </div>

        <div className="field-group">
          <label htmlFor="signup-password">Password <span className="hint">(min 8 chars)</span></label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="field-group">
          <label>Pick your avatar</label>
          <div className="avatar-picker">
            {AVATAR_OPTIONS.map((sticker) => (
              <button
                key={sticker}
                type="button"
                className={`avatar-option${avatarSticker === sticker ? ' selected' : ''}`}
                onClick={() => setAvatarSticker(sticker)}
                aria-label={`Select avatar ${sticker}`}
                aria-pressed={avatarSticker === sticker}
              >
                {sticker}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
    </form>
  )
}
