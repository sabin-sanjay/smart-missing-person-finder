// backend.js: talking to our AI backend (face search, video, accounts).
//
// The backend runs on a laptop behind a free tunnel whose address changes on
// each start, so it saves its current address in Supabase (app_config) and we
// read it from there. checkBackend() tells us whether it's running right now.

import { supabase } from './supabase'

export async function getBackendUrl() {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'backend_url').maybeSingle()
  return (data?.value || import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
}

/** true = the AI server answered within 5 seconds */
export async function checkBackend() {
  try {
    const url = await getBackendUrl()
    if (!url) return false
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}
