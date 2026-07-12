import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import App from './App.tsx'
import AuthScreen from './AuthScreen.tsx'
import SetupScreen from './SetupScreen.tsx'
import ResetPasswordScreen from './ResetPasswordScreen.tsx'

type AppState = 'loading' | 'auth' | 'setup' | 'app' | 'demo' | 'recovery'

export default function Root() {
  const [state, setState] = useState<AppState>('loading')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setState(session ? 'app' : 'auth')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') {
        setState('recovery')
      } else {
        setState(session ? 'app' : 'auth')
      }
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
    return <ResetPasswordScreen onDone={() => setState(session ? 'app' : 'auth')} />
  }

  if (state === 'setup' && session) {
    return <SetupScreen userId={session.user.id} onDone={() => setState('app')} />
  }

  if (state === 'app' && session) {
    return <App userId={session.user.id} onSignOut={handleSignOut} onNeedsSetup={() => setState('setup')} />
  }

  return null
}
