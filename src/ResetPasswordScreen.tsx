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
      // Redeem the recovery token here, inside the click handler, and nowhere
      // else. On /reset the emailed link carries only a token_hash and the
      // client is built with detectSessionInUrl disabled, so no session exists
      // until this line runs. An email scanner that merely fetches the page
      // never reaches it, which is what stops the single-use link being burned
      // before the teacher opens it.
      const tokenHash = new URLSearchParams(window.location.search).get('token_hash')
      if (tokenHash) {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        if (verifyErr) {
          setError('This reset link has expired or has already been used. Request a new one from the sign in screen.')
          return
        }
      }

      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) {
        // No token_hash and no recovery session: the link was opened without
        // credentials, or they have already been spent. Say so plainly rather
        // than surfacing a raw auth API error.
        setError('This reset link has expired or has already been used. Request a new one from the sign in screen.')
        return
      }
      // The recovery link signs the teacher in before they choose a password.
      // Drop that session so the new password is actually exercised at login,
      // and so an abandoned reset can't leave an authenticated session behind.
      await supabase.auth.signOut()
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
            <p className="text-sm" style={{ color: '#8b8b9a' }}>Your new password is saved. Sign in with it to continue.</p>
            <button
              type="button"
              onClick={onDone}
              className="mt-5 w-full py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl"
            >
              Go to sign in
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
