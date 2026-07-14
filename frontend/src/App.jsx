import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import BackgroundBubbles from './components/BackgroundBubbles'
import AuthPage from './pages/AuthPage'
import MyThreadsPage from './pages/MyThreadsPage'
import CreateThreadPage from './pages/CreateThreadPage'
import ThreadPage from './pages/ThreadPage'
import JoinPage from './pages/JoinPage'
import Footer from './components/Footer'

function AppContent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Post-authentication redirect logic
  useEffect(() => {
    if (user) {
      const redirectTo = sessionStorage.getItem('redirect_after_login')
      if (redirectTo) {
        sessionStorage.removeItem('redirect_after_login')
        navigate(redirectTo)
      }
    }
  }, [user, navigate])

  if (!user) {
    // Save current path to redirect back to it after logging in
    if (location.pathname !== '/') {
      sessionStorage.setItem('redirect_after_login', location.pathname)
    }

    return <AuthPage />
  }

  return (
    <Routes>
      <Route path="/" element={<MyThreadsPage />} />
      <Route path="/threads/new" element={<CreateThreadPage />} />
      <Route path="/threads/:id" element={<ThreadPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <BackgroundBubbles />
          <AppContent />
          <Footer />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
