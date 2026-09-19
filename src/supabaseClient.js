import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// True only when real values were provided (not empty / not the YOUR-... placeholders).
export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url) && !url.includes('YOUR-') && key.length > 20 && !key.includes('YOUR-')

export const supabase = createClient(
  isConfigured ? url : 'https://placeholder.supabase.co',
  isConfigured ? key : 'placeholder-key',
  {
    // Send the key explicitly on every request (REST, auth, storage, RPC).
    global: { headers: { apikey: isConfigured ? key : 'placeholder-key' } },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'gc-council-auth',
    },
  },
)

export const EVIDENCE_BUCKET = 'gc-evidence'

export const connectionInfo = {
  host: url ? url.replace(/^https?:\/\//, '') : '(not set)',
  keyPreview: key ? `${key.slice(0, 14)}… (${key.length} chars)` : '(not set)',
  isConfigured,
}

// Step-by-step connectivity test, shown on the staff login page.
export async function runDiagnostics() {
  const out = []
  if (!isConfigured) {
    out.push({ ok: false, label: 'Environment variables', detail: 'VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing or still placeholders in .env (restart the dev server / redeploy after editing).' })
    return out
  }
  out.push({ ok: true, label: 'Environment variables', detail: `${connectionInfo.host} · key ${connectionInfo.keyPreview}` })

  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    const body = await r.text()
    out.push({ ok: r.ok, label: 'API key accepted by Supabase', detail: r.ok ? 'Yes' : `HTTP ${r.status}: ${body.slice(0, 200)}` })
  } catch (e) {
    out.push({ ok: false, label: 'Reach Supabase', detail: e.message })
    return out
  }

  const { error } = await supabase.rpc('gc_track_complaint', { p_code: 'GC-0000-0000-0000' })
  out.push({
    ok: !error,
    label: 'Complaints database installed (schema.sql)',
    detail: error ? `${error.message} — run schema.sql in the Supabase SQL Editor.` : 'Yes',
  })
  return out
}
