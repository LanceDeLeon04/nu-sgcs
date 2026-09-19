// =========================================================
// Create a login + complaints-system staff record in one step.
//
//   npm run create-staff -- <email> <password> "<Full Name>" "<Position>" [admin|handler]
//
// Example:
//   npm run create-staff -- juan@scs-sc.edu.ph "TempPass#2026" "Juan Dela Cruz" "Grievance Officer" handler
//
// If the email already has an account (e.g. an SCS officer), the password is
// left untouched and only the gc_staff record is created/updated.
// Needs SUPABASE_SERVICE_ROLE_KEY in .env (local only, never in the browser).
// =========================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim()
  }
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || key.startsWith('PASTE-') || key.startsWith('YOUR-')) {
  console.error('❌ Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.')
  process.exit(1)
}

const [email, password, fullName, position = 'Staff', role = 'handler'] = process.argv.slice(2)
if (!email || !password || !fullName || !['admin', 'handler'].includes(role)) {
  console.error('Usage: npm run create-staff -- <email> <password> "<Full Name>" "<Position>" [admin|handler]')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function findUser(em) {
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find(u => u.email?.toLowerCase() === em.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) return null
    page++
  }
}

let user = await findUser(email)
if (user) {
  console.log(`ℹ️  Account exists for ${email} — keeping its current password.`)
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: fullName },
  })
  if (error) { console.error('❌ Could not create login:', error.message); process.exit(1) }
  user = data.user
  console.log(`✅ Created login for ${email}`)
}

const { error } = await supabase.from('gc_staff').upsert({
  user_id: user.id, full_name: fullName, email: email.toLowerCase(), position, role, is_active: true,
})
if (error) { console.error('❌ Could not create gc_staff record (did you run schema.sql?):', error.message); process.exit(1) }
console.log(`✅ ${fullName} can now sign in to the complaints system as ${role}.`)
