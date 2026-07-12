import { useState } from 'react'
import { supabase } from './lib/supabase'

type Props = {
  onDemo: () => void
}

type Mode = 'login' | 'signup'

export default function AuthScreen({ onDemo }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmSent, setConfirmSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleForgotPassword() {
    setError('')
    if (!email) {
      setError('Enter your email above first, then tap Forgot password.')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://app.pulseacademic.com',
      })
      if (err) throw err
      setResetSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setConfirmSent(true)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        // Auth state change handled by Root.tsx listener
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = { background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5" style={{ background: '#0d0d0f' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#f0f0f2' }}>Pulse</h1>
          <p className="text-sm mt-1" style={{ color: '#5a5a6a' }}>Academic Tracker</p>
        </div>

        {resetSent ? (
          <div className="rounded-2xl px-6 py-8 text-center" style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-2xl mb-3">📬</p>
            <h2 className="text-base font-bold mb-2" style={{ color: '#f0f0f2' }}>Check your email</h2>
            <p className="text-sm" style={{ color: '#8b8b9a' }}>We sent a password reset link to <span className="font-semibold" style={{ color: '#f0f0f2' }}>{email}</span>. Click it to set a new password.</p>
            <button
              type="button"
              onClick={() => { setResetSent(false); setMode('login') }}
              className="mt-5 text-sm font-semibold text-teal-400 hover:text-teal-300"
            >
              Back to log in
            </button>
          </div>
        ) : confirmSent ? (
          <div className="rounded-2xl px-6 py-8 text-center" style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-2xl mb-3">📬</p>
            <h2 className="text-base font-bold mb-2" style={{ color: '#f0f0f2' }}>Check your email</h2>
            <p className="text-sm" style={{ color: '#8b8b9a' }}>We sent a confirmation link to <span className="font-semibold" style={{ color: '#f0f0f2' }}>{email}</span>. Click it to activate your account, then come back and log in.</p>
            <button
              type="button"
              onClick={() => { setConfirmSent(false); setMode('login') }}
              className="mt-5 text-sm font-semibold text-teal-400 hover:text-teal-300"
            >
              Back to log in
            </button>
          </div>
        ) : (
          <div className="rounded-2xl px-6 py-6" style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="text-base font-bold mb-5" style={{ color: '#f0f0f2' }}>
              {mode === 'login' ? 'Log in to your account' : 'Create your account'}
            </h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#8b8b9a' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@school.edu"
                  className="w-full text-sm rounded-xl px-4 py-2.5 outline-none border focus:border-teal-500"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#8b8b9a' }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
                  className="w-full text-sm rounded-xl px-4 py-2.5 outline-none border focus:border-teal-500"
                  style={inputStyle}
                />
              </div>
              {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl disabled:opacity-50 mt-1"
              >
                {loading ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>

            {mode === 'login' && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-xs font-semibold hover:text-teal-400 transition-colors disabled:opacity-50"
                  style={{ color: '#5a5a6a' }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
                className="text-xs font-semibold hover:text-teal-400 transition-colors"
                style={{ color: '#5a5a6a' }}
              >
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
              </button>
            </div>
          </div>
        )}

        {/* Demo */}
        <div className="mt-5 text-center">
          <p className="text-xs mb-2" style={{ color: '#5a5a6a' }}>Just browsing?</p>
          <button
            type="button"
            onClick={onDemo}
            className="text-sm font-semibold text-teal-400 hover:text-teal-300 rounded-2xl px-6 py-2.5"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            Try the demo →
          </button>
        </div>
      </div>
    </div>
  )
}
