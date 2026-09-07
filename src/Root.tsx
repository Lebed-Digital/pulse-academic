import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import App from './App.tsx'
import AuthScreen from './AuthScreen.tsx'
import SetupScreen from './SetupScreen.tsx'
import ResetPasswordScreen from './ResetPasswordScreen.tsx'

type AppState = 'loading' | 'auth' | 'setup' | 'app' | 'demo' | 'recovery'

// Supabase's GoTrue client fires PASSWORD_RECOVERY from a setTimeout(0)
// queued at module load time (inside the client constructor's own
// initialize() call), before this component's useEffect has run and
// subscribed via onAuthStateChange. That event is emitted to zero
// listeners and lost, so the recovery flow can never be detected reactively
// on first load. Read it synchronously from the URL hash instead, the same
// way the SDK itself decides callbackUrlType internally, before it has a
// chance to strip the hash.
function isRecoveryCallbackUrl(): boolean {
  if (typeof window === 'undefined' || !window.location.hash) return false
  const params = new URLSearchParams(window.location.hash.slice(1))
  return params.get('type') === 'recovery' && Boolean(params.get('access_token'))
}

// The /reset interception page. The emailed link now points here on our own
// domain carrying only a token_hash, so nothing is redeemed until the teacher
// presses the button. Reached before any token exists, so it cannot depend on
// the hash check above.
function isResetPage(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === '/reset'
}

export default function Root() {
  const [state, setState] = useState<AppState>(() =>
    isRecoveryCallbackUrl() || isResetPage() ? 'recovery' : 'loading',
  )
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      // A PASSWORD_RECOVERY event from onAuthStateChange below can resolve
      // before or after this. Never let a plain getSession() check clobber
      // an in-progress recovery flow back to 'app'.
      setState(cur => (cur === 'recovery' ? cur : session ? 'app' : 'auth'))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') {
        setState('recovery')
        return
      }
      // Supabase re-validates the session (e.g. on tab refocus), firing this
      // listener even though nothing actually changed. Don't bounce a teacher
      // out of an in-progress Setup screen for the same still-signed-in user.
      setState(cur => {
        // INITIAL_SESSION is replayed to every newly registered subscriber with
        // the recovery session already saved, and it always beats the
        // PASSWORD_RECOVERY event above (which the SDK defers via setTimeout 0).
        // Without this guard it overwrites 'recovery' with 'app' microseconds
        // after the lazy initializer sets it, so the teacher lands inside the
        // app already signed in and never gets to choose a new password.
        if (cur === 'recovery') return cur
        if (cur === 'setup' && session) return cur
        return session ? 'app' : 'auth'
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setState('auth')
  }

  if (state === 'loading') {
    return <div className="min-h-screen" style={{ background: '#0d0d0f' }} />
  }

  if (state === 'auth') {
    return <AuthScreen onDemo={() => setState('demo')} />
  }

  if (state === 'demo') {
    return <App userId="demo-user" isDemo onSignOut={() => setState('auth')} />
  }

  if (state === 'recovery') {
    return <ResetPasswordScreen onDone={() => setState('auth')} />
  }

  if (state === 'setup' && session) {
    return <SetupScreen userId={session.user.id} onDone={() => setState('app')} />
  }

  if (state === 'app' && session) {
    return <App userId={session.user.id} onSignOut={handleSignOut} onNeedsSetup={() => setState('setup')} />
  }

  return null
}
