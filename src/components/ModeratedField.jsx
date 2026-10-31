import React, { useMemo, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { findProfanitySpans } from '../lib/profanity.js'

// Text input / textarea that detects foul or harsh words WHILE the person types:
//   - the offending words are highlighted in red right inside the field
//   - a notice appears under the field (role="alert") explaining what to do
//
//   mode="block" -> the words are not allowed (used for feedback); the notice says to rephrase
//   mode="warn"  -> the words are allowed but flagged for staff (concerns, replies)
//
// The parent can listen with onFlag(hasProfanity) if it needs to react (e.g. disable a button).
// Technique: a transparent "mirror" <div> with identical text metrics sits behind the real field;
// only the <mark> backgrounds are visible, so highlights line up exactly with what is typed.

const WARN_TEXT = 'Strong language detected. You can still send this, but please keep it respectful. Staff will review it with care.'
const BLOCK_TEXT = 'Foul or harsh language is not allowed here. Please rephrase the highlighted words respectfully before sending.'

export function splitByProfanity(text) {
  const spans = findProfanitySpans(text)
  const parts = []
  let pos = 0
  for (const s of spans) {
    if (s.start > pos) parts.push({ text: text.slice(pos, s.start), bad: false })
    parts.push({ text: text.slice(s.start, s.end), bad: true })
    pos = s.end
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), bad: false })
  return { parts, count: spans.length }
}

export function ProfanityNotice({ count, mode = 'warn', className = '' }) {
  if (!count) return null
  const block = mode === 'block'
  return (
    <div role="alert" aria-live="polite"
      className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 animate-fade-in ${block ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-800'} ${className}`}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span><strong className="font-semibold">{count} word{count > 1 ? 's' : ''} highlighted.</strong> {block ? BLOCK_TEXT : WARN_TEXT}</span>
    </div>
  )
}

export default function ModeratedField({ as = 'input', value = '', onChange, mode = 'warn', className = '', showNotice = true, noticeClassName = 'mt-2', ...rest }) {
  const mirror = useRef(null)
  const multiline = as === 'textarea'
  const { parts, count } = useMemo(() => splitByProfanity(String(value)), [value])
  const Tag = multiline ? 'textarea' : 'input'

  const syncScroll = (e) => {
    if (!mirror.current) return
    mirror.current.scrollTop = e.target.scrollTop
    mirror.current.scrollLeft = e.target.scrollLeft
  }

  // `className` carries border/padding/font from the page; the mirror copies it minus colours so the text lines up exactly.
  const classes = className.split(/\s+/).filter(Boolean)
  const wrapClass = classes.filter((c) => /^(m|mt|mb|my)-/.test(c)).join(' ') // margins belong on the wrapper
  const fieldClass = classes.filter((c) => !/^(m|mt|mb|my)-/.test(c)).join(' ')
  const mirrorClass = classes.filter((c) => /^(w-|px-|py-|p-|text-(xs|sm|base|lg)|font-|leading-|tracking-|rounded)/.test(c)).join(' ')
  const bad = count > 0

  return (
    <>
      <div className={`relative bg-white rounded-xl ${wrapClass}`}>
        <div ref={mirror} aria-hidden="true"
          className={`${mirrorClass} absolute inset-0 border border-transparent overflow-hidden pointer-events-none ${multiline ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} text-transparent`}>
          {parts.map((p, i) => p.bad
            ? <mark key={i} className="text-transparent rounded-sm" style={{ background: 'rgba(252,165,165,.55)', boxShadow: '0 2px 0 #ef4444' }}>{p.text}</mark>
            : <React.Fragment key={i}>{p.text}</React.Fragment>)}
          {multiline && '\u200b'}
        </div>
        <Tag {...rest} value={value} onChange={onChange} onScroll={syncScroll}
          aria-invalid={bad || undefined}
          className={`${fieldClass} relative !bg-transparent ${bad ? (mode === 'block' ? '!border-red-400' : '!border-amber-400') : ''}`}
          style={{ ...(rest.style || {}), backgroundColor: 'transparent' }} />
      </div>
      {showNotice && <ProfanityNotice count={count} mode={mode} className={noticeClassName} />}
    </>
  )
}
