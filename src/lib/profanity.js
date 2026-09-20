// Lightweight profanity filter (English + Filipino/Tagalog).
//
// This is the FRIENDLY layer: it lets the student fix their message before
// submitting. The database enforces the same rule again in gc_has_profanity()
// (see migration_categories_validation.sql) so it can't be bypassed.
//
// How it avoids false positives ("class", "assess", "Scunthorpe problem"):
// words are matched as WHOLE tokens only, never as substrings of other words.
//
// What it catches:  fuck / fuuuck / f*ck / f u c k / f.u.c.k / fvck / phuck / $h1t / put4ng ina ...

// Keep this list to clearly offensive words. Add or remove freely — lowercase, no spaces.
const WORDS = [
  // English
  'fuck', 'fucks', 'fucked', 'fucking', 'fucker', 'fuckers', 'motherfucker', 'fuk', 'fuq', 'fcuk',
  'shit', 'shits', 'shitty', 'bullshit', 'shet', 'bitch', 'bitches', 'bitchy', 'bastard', 'bastards',
  'asshole', 'assholes', 'dickhead', 'cunt', 'pussy', 'slut', 'whore', 'douche', 'douchebag',
  'nigger', 'nigga', 'faggot', 'retard', 'retarded',
  // Filipino / Tagalog
  'putangina', 'putanginamo', 'tangina', 'tanginamo', 'tanginang', 'puta', 'putang', 'pota', 'potah',
  'gago', 'gagu', 'tarantado', 'tarantada', 'ulol', 'bobo', 'tanga', 'siraulo', 'kupal',
  'punyeta', 'puneta', 'pucha', 'lintik', 'buwisit', 'bwisit', 'pakyu', 'pakshet', 'pakingshet',
  'hindot', 'kantot', 'kantutan', 'pekpek', 'burat', 'walanghiya', 'gunggong', 'engot',
]

// Two-word spellings, matched by joining neighbouring words: "tang ina", "putang ina", "wala ng hiya"
const JOINED = new Set(['tangina', 'putangina', 'tanginamo', 'putanginamo', 'walanghiya', 'pakyu', 'pakshet'])

const LEET = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '¡': 'i' }
// Common phonetic/visual swaps people use to dodge filters
const PHONETIC = [[/fvck/g, 'fuck'], [/ph/g, 'f'], [/^fck$/, 'fuck'], [/^fk$/, 'fuck']]

const squash = (w) => w.replace(/(.)\1+/g, '$1') // "fuuuck" -> "fuck"
const squashedWords = new Set(WORDS.map(squash))
const wordsByLength = new Map()
WORDS.forEach((w) => { const a = wordsByLength.get(w.length) || []; a.push(w); wordsByLength.set(w.length, a) })

const stripAccents = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')

// Turn "f u c k", "f.u.c.k", "f-u-c-k" into "fuck" (only runs of 3+ single characters)
// NOTE: no lookbehind here on purpose, older iPhones (Safari < 16.4) would fail to load the whole app.
const collapseSpaced = (s) =>
  s.replace(/(^|\s)((?:[a-z0-9@$!|+*#%][ .\-_]+){2,}[a-z0-9@$!|+*#%])(?=\s|$|[,.;:?!])/g,
    (m, pre, run) => pre + run.replace(/[\s.\-_]/g, ''))

function normalizeToken(tok) {
  let t = tok.replace(/[!|+.,;:?"')(\]\[]+$/g, '').replace(/^["'(\[]+/g, '') // trailing/leading punctuation
  if (!/[a-z]/.test(t)) return '' // pure numbers (student IDs, dates) are never profanity
  t = t.replace(/[@4310!|$5789+¡]/g, (c) => LEET[c] || c)
  PHONETIC.forEach(([re, to]) => { t = t.replace(re, to) })
  return t
}

function matchesBanned(t) {
  if (!t) return null
  if (squashedWords.has(squash(t))) return t
  // masked words: f*ck, sh#t, put*ngina -> wildcard match against banned words of the same length
  if (/[*#%]/.test(t)) {
    const pattern = [...t].map((ch) => (/[*#%]/.test(ch) ? '[a-z]' : /[a-z]/.test(ch) ? ch : '')).join('')
    const re = new RegExp('^' + pattern + '$')
    const hit = (wordsByLength.get(t.length) || []).find((w) => re.test(w))
    if (hit) return hit
  }
  return null
}

/**
 * Returns the list of offensive words found (empty array = clean).
 * Words are returned in their normalized form; don't echo them back to other students.
 */
export function findProfanity(text) {
  if (!text) return []
  const lower = collapseSpaced(stripAccents(String(text).toLowerCase()))
  const tokens = lower.split(/[\s/\\,;:?"()\[\]{}<>=_~.\-]+/).filter(Boolean)
  const cleaned = tokens.map((t) => normalizeToken(t))
  const found = new Set()

  cleaned.forEach((t, i) => {
    const hit = matchesBanned(t)
    if (hit) found.add(hit)
    // two-word spellings: "tang ina", "putang ina"
    if (i + 1 < cleaned.length && cleaned[i + 1]) {
      const joined = t + cleaned[i + 1]
      if (JOINED.has(squash(joined)) || JOINED.has(joined)) found.add(joined)
    }
  })
  return [...found]
}

export const containsProfanity = (text) => findProfanity(text).length > 0
export const hasProfanityIn = (...texts) => texts.some((t) => containsProfanity(t))
