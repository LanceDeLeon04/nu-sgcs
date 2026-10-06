import React, { useRef, useState } from 'react'
import Navbar from '../../components/Navbar.jsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../lib/auth.jsx'
import { Lock, KeyRound, Camera, Trash2, Loader2 } from 'lucide-react'
import Avatar, { AVATAR_BUCKET, clearAvatarCache } from '../../components/Avatar.jsx'


const MAX_INPUT_BYTES = 8 * 1024 * 1024 // raw pick limit; we shrink before upload
const AVATAR_SIZE = 256

// Center-crop to a square and downscale, so uploads stay tiny (~10-30 KB).
async function toSquareBlob(file) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_SIZE
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  bitmap.close?.()
  const toBlob = (type, q) => new Promise((res) => canvas.toBlob(res, type, q))
  let blob = await toBlob('image/webp', 0.85)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.88) // Safari fallback
  if (!blob) throw new Error('Could not process that image.')
  return blob
}

export default function Settings() {
  const { staff, session, refreshStaff } = useAuth()
  const fileRef = useRef(null)
  const [picBusy, setPicBusy] = useState(false)
  const [picMsg, setPicMsg] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  const removeOld = async (path) => {
    if (!path) return
    await supabase.storage.from(AVATAR_BUCKET).remove([path]) // best-effort
    clearAvatarCache(path)
  }

  const handlePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setPicMsg(null)
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setPicMsg({ type: 'error', text: 'Please choose a JPG, PNG or WebP image.' })
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      setPicMsg({ type: 'error', text: 'That image is over 8 MB. Please pick a smaller one.' })
      return
    }
    setPicBusy(true)
    try {
      const blob = await toSquareBlob(file)
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${session.user.id}/avatar-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
      if (upErr) throw upErr
      const previous = staff?.avatar_path
      const { error: rpcErr } = await supabase.rpc('gc_set_my_avatar', { p_path: path })
      if (rpcErr) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path])
        throw rpcErr
      }
      await removeOld(previous && previous !== path ? previous : null)
      await refreshStaff()
      setPicMsg({ type: 'success', text: 'Profile picture updated.' })
    } catch (err) {
      const hint = /gc_set_my_avatar|avatar_path|Bucket not found/i.test(err.message || '')
        ? ' (Run migration_staff_avatars.sql in the Supabase SQL Editor.)' : ''
      setPicMsg({ type: 'error', text: (err.message || 'Failed to update picture.') + hint })
    } finally {
      setPicBusy(false)
    }
  }

  const handleRemovePic = async () => {
    if (!staff?.avatar_path) return
    setPicMsg(null)
    setPicBusy(true)
    try {
      const previous = staff.avatar_path
      const { error } = await supabase.rpc('gc_set_my_avatar', { p_path: null })
      if (error) throw error
      await removeOld(previous)
      await refreshStaff()
      setPicMsg({ type: 'success', text: 'Profile picture removed.' })
    } catch (err) {
      setPicMsg({ type: 'error', text: err.message || 'Failed to remove picture.' })
    } finally {
      setPicBusy(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)

    if (password.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }
    if (password !== confirm) {
      setMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMsg({ type: 'success', text: 'Password updated successfully.' })
      setPassword('')
      setConfirm('')
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update password.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Navbar title="Account Settings" />
      <div className="p-8 max-w-md space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={18} className="text-nublue-600" />
            <h2 className="font-bold text-slate-800">Profile Picture</h2>
          </div>
          <div className="flex items-center gap-4">
            <Avatar path={staff?.avatar_path} name={staff?.full_name} size={72} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{staff?.full_name}</p>
              <p className="text-[11px] text-slate-400 mb-2">JPG, PNG or WebP. Cropped to a square. Visible to Council staff only.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePick} className="hidden" />
                <button type="button" disabled={picBusy} onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-nublue-600 hover:bg-nublue-700 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-60">
                  {picBusy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  {staff?.avatar_path ? 'Change' : 'Upload'}
                </button>
                {staff?.avatar_path && (
                  <button type="button" disabled={picBusy} onClick={handleRemovePic}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition disabled:opacity-60">
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          {picMsg && (
            <div className={`mt-4 text-xs rounded-lg px-3 py-2 border break-words ${picMsg.type === 'success' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
              {picMsg.text}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 card-glow p-6">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={18} className="text-nublue-600" />
            <h2 className="font-bold text-slate-800">Change Password</h2>
          </div>
          <p className="text-xs text-slate-400 mb-5">
            Signed in as {staff?.email || session?.user?.email}
          </p>
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            This is your account-wide password. If you use the same login for other council systems, it changes there too.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Password</label>
              <div className="mt-1 flex items-center border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-nublue-500">
                <Lock size={16} className="text-nublue-400 mr-2 shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  minLength={6}
                  required
                  className="w-full outline-none text-sm bg-transparent"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirm Password</label>
              <div className="mt-1 flex items-center border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-nublue-500">
                <Lock size={16} className="text-nublue-400 mr-2 shrink-0" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  minLength={6}
                  required
                  className="w-full outline-none text-sm bg-transparent"
                />
              </div>
            </div>

            {msg && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${msg.type === 'success' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-nublue-600 hover:bg-nublue-700 text-white font-semibold py-2.5 rounded-xl transition shadow-glow disabled:opacity-60"
            >
              {submitting ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
