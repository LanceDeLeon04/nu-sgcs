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
  // English (harsh / insulting)
  'damn', 'dammit', 'goddamn', 'crap', 'cock', 'dumbass', 'jackass', 'idiot', 'idiots', 'moron', 'morons',
  'stupid', 'scumbag', 'wtf', 'stfu',
  // Filipino / Tagalog
  'putangina', 'putanginamo', 'tangina', 'tanginamo', 'tanginang', 'puta', 'putang', 'pota', 'potah',
  'gago', 'gagu', 'tarantado', 'tarantada', 'ulol', 'bobo', 'tanga', 'siraulo', 'kupal',
  'punyeta', 'puneta', 'pucha', 'lintik', 'buwisit', 'bwisit', 'pakyu', 'pakshet', 'pakingshet',
  'hindot', 'kantot', 'kantutan', 'pekpek', 'burat', 'walanghiya', 'gunggong', 'engot',
  'tangna', 'putangna', 'potangina', 'potanginamo', 'pukingina', 'pukinangina', 'amputa', 'amputangina',
  'putragis', 'putcha', 'putsa', 'peste', 'pesteng', 'piste', 'pisti', 'leche', 'lecheng', 'shunga',
  'inutil', 'ungas', 'hinayupak', 'hayup', 'demonyo', 'ogag', 'gaga', 'puki', 'titi', 'jakol', 'yawa',
]

// Two-word spellings, matched by joining neighbouring words: "tang ina", "putang ina", "wala ng hiya"
const JOINED_LIST = ['tangina', 'putangina', 'tanginamo', 'putanginamo', 'walanghiya', 'pakyu', 'pakshet', 'pakingshet', 'potangina', 'amputangina', 'bwisit', 'buwisit']

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

const JOINED = new Set(JOINED_LIST.map(squash))

// Near-miss spellings ("putangna", "tanginaa", "tarantadoo"): allow ONE typo, but only for long banned words
// (8+ letters) so ordinary words such as "angina" are never caught.
const FUZZY = [...squashedWords].filter((w) => w.length >= 8)
function withinOneEdit(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) // substitution
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1) // insert / delete
}
const fuzzyHit = (t) => {
  const q = squash(t)
  if (q.length < 8 || !/^[a-z]+$/.test(q)) return null
  return FUZZY.find((w) => withinOneEdit(q, w)) || null
}

const TOKEN_RE = /[^\s/\\,;:?"()[\]{}<>=_~.\-]+/g
const norm = (raw) => normalizeToken(stripAccents(raw.toLowerCase()))

/**
 * Finds every offensive word with its position in the ORIGINAL text, so the UI can highlight it.
 * Returns [{ start, end, word }] sorted by start (end exclusive). Catches:
 *   plain words, repeated letters (fuuuck), leetspeak ($h1t), masks (f*ck), spaced/dotted letters (f u c k, f.u.c.k),
 *   two/three-word spellings (tang ina, putang ina, wala ng hiya) and one-typo variants of long words.
 */
export function findProfanitySpans(text) {
  if (!text) return []
  const src = String(text)
  const toks = []
  let m
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(src))) toks.push({ start: m.index, end: m.index + m[0].length, raw: m[0], n: norm(m[0]) })

  const spans = []
  const gap = (a, b) => src.slice(toks[a].end, toks[b].start)

  toks.forEach((t, i) => {
    const hit = matchesBanned(t.n) || fuzzyHit(t.n)
    if (hit) spans.push({ start: t.start, end: t.start + t.raw.replace(/[!|+,;:?"')\]]+$/, '').length, word: hit })

    // two- and three-word spellings, separated by spaces only: "tang ina", "wala ng hiya"
    for (const len of [2, 3]) {
      const j = i + len - 1
      if (j >= toks.length) break
      let ok = true
      for (let k = i; k < j; k++) if (!/^\s+$/.test(gap(k, k + 1))) { ok = false; break }
      if (!ok) continue
      const joined = toks.slice(i, j + 1).map((x) => x.n).join('')
      if (joined && (JOINED.has(squash(joined)) || squashedWords.has(squash(joined)) && len > 1)) {
        spans.push({ start: t.start, end: toks[j].end, word: joined })
      }
    }

    // letters split apart: "f u c k", "f.u.c.k", "p-u-t-a-n-g-i-n-a" (runs of single characters)
    if (t.raw.length === 1) {
      let j = i
      while (j + 1 < toks.length && j - i < 13 && toks[j + 1].raw.length === 1 && /^[\s.\-_]+$/.test(gap(j, j + 1))) j++
      for (let end = j; end >= i + 2; end--) {
        const joined = toks.slice(i, end + 1).map((x) => x.n).join('')
        const h = joined && (matchesBanned(joined) || (JOINED.has(squash(joined)) ? joined : null))
        if (h) { spans.push({ start: t.start, end: toks[end].end, word: h }); break }
      }
    }
  })

  // merge overlaps (e.g. "putang ina" is caught as both "putang" and "putangina")
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const out = []
  for (const sp of spans) {
    const last = out[out.length - 1]
    if (last && sp.start < last.end) { if (sp.end > last.end) { last.end = sp.end; last.word = sp.word } } else out.push({ ...sp })
  }
  return out
}

/** Returns the list of offensive words found (empty array = clean). Don't echo them to OTHER students. */
export function findProfanity(text) {
  return [...new Set(findProfanitySpans(text).map((s) => s.word))]
}

export const containsProfanity = (text) => findProfanitySpans(text).length > 0
export const hasProfanityIn = (...texts) => texts.some((t) => containsProfanity(t))
