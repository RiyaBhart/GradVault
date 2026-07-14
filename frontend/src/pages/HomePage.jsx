import { useAuth } from '../context/AuthContext'
import StreakBadge from '../components/StreakBadge'

export default function HomePage() {
  const { user, logout } = useAuth()

  return (
    <div className="home-container">
      <div className="home-card">
        <span className="home-avatar">{user?.avatar_sticker ?? '✉️'}</span>
        <h1 className="home-greeting">Welcome back,</h1>
        <p className="home-nickname">
          {user?.nickname}
          <StreakBadge streakCount={user?.streak_count} />
        </p>
        <p className="home-username">@{user?.username}</p>
        <p className="home-placeholder">
          🚧 Threads, letters, and time-locked photos are coming in Week 2.
        </p>
        <button className="btn-secondary" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  )
}
