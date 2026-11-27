// supabase.js
// Creates ONE connection to our Supabase project that the whole app shares.
// Any file can use it with:   import { supabase } from '../lib/supabase'

import { createClient } from '@supabase/supabase-js'

// These two values come from the .env file (never typed directly into code).
// Vite only lets the browser see settings whose names start with VITE_.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// true if the .env file is filled in. Pages use this to show a helpful
// message instead of crashing.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

if (!isSupabaseConfigured) {
  console.warn('Supabase is not set up yet: fill in frontend/.env (see .env.example), then restart "npm run dev".')
}

// If the settings are missing we use harmless placeholders so the app still opens.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
)

// Turns a stored photo path (like "abc-123/photo.jpg") into a web address
// that an <img> tag can show. Only for the public "case-photos" bucket.
export function casePhotoUrl(photoPath) {
  // No photo uploaded: show a plain grey "person" picture instead of a broken image
  if (!photoPath) return '/no-photo.svg'
  return supabase.storage.from('case-photos').getPublicUrl(photoPath).data.publicUrl
}
