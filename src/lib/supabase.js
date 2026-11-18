import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey,
)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not-configured' }
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`,
      {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    )

    await response.arrayBuffer()

    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, reason: 'http', status: response.status }
  } catch (error) {
    if (error instanceof TypeError) {
      return { ok: false, reason: 'network' }
    }

    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { ok: false, reason: 'timeout' }
    }

    throw error
  }
}
