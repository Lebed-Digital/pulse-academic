import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zhkgdbjhcignpcspllso.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// On /reset the recovery token must not be redeemed just because something
// opened the URL. An email scanner fetching the page would otherwise hand the
// SDK a token to process at import time, before any human is involved. Leaving
// detection on everywhere else keeps every other auth flow untouched.
const isResetPage = typeof window !== 'undefined' && window.location.pathname === '/reset'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: !isResetPage },
})
