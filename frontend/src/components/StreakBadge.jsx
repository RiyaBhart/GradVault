export default function StreakBadge({ streakCount }) {
  if (!streakCount || streakCount < 1) return null

  return (
    <div className="streak-badge" title={`${streakCount} day streak!`}>
      <span className="streak-icon">🔥</span>
      <span className="streak-count">{streakCount}</span>
    </div>
  )
}
