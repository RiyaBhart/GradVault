import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { setApiToken } from './api'

/**
 * AuthContext — the JWT access token is stored ONLY in this React context
 * (i.e., in memory). It is never written to localStorage or sessionStorage.
 *
 * Trade-off: the token is lost on page refresh, which means the user has to
 * log in again. We'll address this in a later week (e.g., httpOnly refresh
 * token cookie). For Week 1 this is the correct starting point.
 */

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)      // raw JWT string
  const [user, setUser] = useState(null)         // UserResponse object from /users/me
  const [loading, setLoading] = useState(false)

  /**
   * Called after a successful login — stores the token and immediately
   * fetches the full user profile so the rest of the app has it.
   */
  const setAuth = useCallback(async (accessToken) => {
    setToken(accessToken)
    setApiToken(accessToken)
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      }
    } catch {
      // Network error — leave user null; the UI will handle it.
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setApiToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, loading, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Hook for consuming auth state in any component. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
