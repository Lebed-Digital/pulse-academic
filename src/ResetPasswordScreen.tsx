import { useState } from 'react'
import { supabase } from './lib/supabase'

type Props = {
  onDone: () => void
}

export default function ResetPasswordScreen({ onDone }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setSuccess(true)
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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#f0f0f2' }}>Pulse</h1>
          <p className="text-sm mt-1" style={{ color: '#5a5a6a' }}>Academic Tracker</p>
        </div>

        {success ? (
          <div className="rounded-2xl px-6 py-8 text-center" style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-2xl mb-3">✅</p>
            <h2 className="text-base font-bold mb-2" style={{ color: '#f0f0f2' }}>Password updated</h2>
            <p className="text-sm" style={{ color: '#8b8b9a' }}>Your new password is saved. You're all set.</p>
            <button
              type="button"
              onClick={onDone}
              className="mt-5 w-full py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl"
            >
              Continue to app
            </button>
          </div>
        ) : (
          <div className="rounded-2xl px-6 py-6" style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="text-base font-bold mb-5" style={{ color: '#f0f0f2' }}>Set a new password</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#8b8b9a' }}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="w-full text-sm rounded-xl px-4 py-2.5 outline-none border focus:border-teal-500"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#8b8b9a' }}>Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
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
                {loading ? '…' : 'Update password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
