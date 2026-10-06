import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export const AVATAR_BUCKET = 'gc-avatars'

// path -> { url, expires }. Signed URLs last 1h; we reuse them for 50 min.
const cache = new Map()
const TTL_SECONDS = 3600

export function clearAvatarCache(path) {
  if (path) cache.delete(path); else cache.clear()
}

async function getSignedUrl(path) {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, TTL_SECONDS)
  if (error || !data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL_SECONDS - 600) * 1000 })
  return data.signedUrl
}

const initialsOf = (name) => (name || '?').split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase()

// <Avatar path={staff.avatar_path} name={staff.full_name} size={36} />
export default function Avatar({ path, name, size = 36, className = '' }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    if (path) getSignedUrl(path).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path])

  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }

  if (url) {
    return <img src={url} alt={name || 'Profile picture'} style={style}
      onError={() => { clearAvatarCache(path); setUrl(null) }}
      className={`rounded-full object-cover shrink-0 bg-slate-100 ${className}`} />
  }
  return (
    <div style={style} className={`rounded-full bg-nublue-600 text-white flex items-center justify-center font-bold shrink-0 ${className}`}>
      {initialsOf(name)}
    </div>
  )
}
