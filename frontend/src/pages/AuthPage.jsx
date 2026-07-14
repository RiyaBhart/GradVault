import { useState } from 'react'
import LoginForm from '../components/LoginForm'
import SignupForm from '../components/SignupForm'
import GraduationCap from '../components/GraduationCap'
import GlassPanel from '../components/GlassPanel'
import ThemeToggle from '../components/ThemeToggle'

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState('login')

  return (
    <div className="auth-layout">
      {/* Fixed theme toggle — uses same ThemeContext as the rest of the app */}
      <div className="auth-theme-corner">
        <ThemeToggle />
      </div>
      <GlassPanel className="auth-card-glass">
        
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <GraduationCap style={{ width: 40, height: 40, margin: '0 auto', color: 'var(--accent)' }} />
          <h1 className="auth-title" style={{ marginTop: '0.5rem' }}>GradVault</h1>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'login'}
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Log In
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'signup'}
            className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => setActiveTab('signup')}
          >
            Sign Up
          </button>
          <div className="auth-tab-indicator" data-active={activeTab} />
        </div>

        <div role="tabpanel">
          {activeTab === 'login' ? (
            <LoginForm />
          ) : (
            <SignupForm onSwitch={() => setActiveTab('login')} />
          )}
        </div>
      </GlassPanel>
    </div>
  )
}
