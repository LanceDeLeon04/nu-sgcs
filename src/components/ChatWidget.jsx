import React, { useMemo, useState } from 'react'
import {
  MessageCircleQuestion, X, Search, ChevronRight, ChevronLeft, BookOpenCheck,
  FolderOpen, FileText,
} from 'lucide-react'
import { CATEGORIES } from '../data/handbookIndex.js'
import { chunksForCategory, chunksForSubtopic, searchChunks, searchAll } from '../lib/handbookSearch.js'

// Public "Handbook Assistant": category -> subtopic -> keyword search over the
// Student Handbook. Fully client-side, no API/AI calls, so there's no usage
// cost and nothing that can "run out" — it's just search over bundled text.
export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [categoryId, setCategoryId] = useState(null)
  const [subtopic, setSubtopic] = useState(null) // { label, page, end } | null
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = not searched yet
  const [usedFallback, setUsedFallback] = useState(false)

  const category = useMemo(() => CATEGORIES.find(c => c.id === categoryId) || null, [categoryId])

  function reset() {
    setCategoryId(null)
    setSubtopic(null)
    setQuery('')
    setResults(null)
    setUsedFallback(false)
  }

  function pickCategory(cat) {
    setCategoryId(cat.id)
    setSubtopic(null)
    setQuery('')
    setResults(null)
    setUsedFallback(false)
  }

  function pickSubtopic(sub) {
    setSubtopic(sub)
    setQuery('')
    setResults(null)
    setUsedFallback(false)
  }

  function runSearch(e) {
    e?.preventDefault()
    const q = query.trim()
    if (!q) return
    const pool = subtopic && !subtopic.whole
      ? chunksForSubtopic(categoryId, subtopic.label)
      : chunksForCategory(categoryId)
    let hits = searchChunks(pool, q, 4)
    let fellBack = false
    if (hits.length === 0) {
      hits = searchAll(q, 4)
      fellBack = true
    }
    setResults(hits)
    setUsedFallback(fellBack)
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-nublue-600 hover:bg-nublue-700 text-white font-semibold text-sm rounded-full pl-4 pr-5 py-3 shadow-[0_10px_30px_-8px_rgba(30,58,138,0.6)] transition"
          aria-label="Ask about school policy"
        >
          <MessageCircleQuestion size={19} />
          <span className="hidden sm:inline">Ask about school policy</span>
          <span className="sm:hidden">Ask</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[calc(100vw-2.5rem)] max-w-sm h-[34rem] max-h-[78vh] bg-white rounded-2xl border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-nublue-900 text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <BookOpenCheck size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">Handbook Assistant</p>
                <p className="text-[10px] text-white/60 truncate">
                  {category ? category.label + (subtopic ? ` › ${subtopic.label}` : '') : 'Pick a topic to start'}
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 shrink-0" aria-label="Close">
              <X size={17} />
            </button>
          </div>

          {/* Breadcrumb / back bar */}
          {category && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 bg-white shrink-0 text-xs">
              <button onClick={reset} className="text-nublue-600 font-semibold hover:underline">Topics</button>
              <ChevronRight size={12} className="text-slate-300" />
              {subtopic ? (
                <>
                  <button onClick={() => setSubtopic(null)} className="text-nublue-600 font-semibold hover:underline">
                    {category.label}
                  </button>
                  <ChevronRight size={12} className="text-slate-300" />
                  <span className="text-slate-500 truncate">{subtopic.label}</span>
                </>
              ) : (
                <span className="text-slate-500 truncate">{category.label}</span>
              )}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-3 py-3 bg-[#f5f8ff]">
            {/* Step 1: category grid */}
            {!category && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 px-1 mb-1">What's your concern about?</p>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => pickCategory(cat)}
                    className="w-full flex items-start gap-2.5 text-left bg-white border border-slate-100 rounded-xl px-3 py-2.5 hover:border-nublue-300 hover:bg-nublue-50 transition"
                  >
                    <FolderOpen size={16} className="text-nublue-500 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-700">{cat.label}</span>
                      <span className="block text-[11px] text-slate-500 leading-snug">{cat.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: subtopic list */}
            {category && !subtopic && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 px-1 mb-1">Narrow it down:</p>
                {category.subtopics.map(sub => (
                  <button
                    key={sub.label}
                    onClick={() => pickSubtopic(sub)}
                    className="w-full flex items-center justify-between gap-2 text-left bg-white border border-slate-100 rounded-xl px-3 py-2 hover:border-nublue-300 hover:bg-nublue-50 transition"
                  >
                    <span className="text-sm font-medium text-slate-700">{sub.label}</span>
                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  </button>
                ))}
                <button
                  onClick={() => pickSubtopic({ label: 'the whole section', page: 0, end: 999, whole: true })}
                  className="w-full text-center text-xs font-semibold text-nublue-600 hover:underline pt-1 pb-1"
                >
                  Search all of "{category.label}" instead →
                </button>
              </div>
            )}

            {/* Step 3: search within the narrowed scope */}
            {category && subtopic && (
              <div className="space-y-3">
                <form onSubmit={runSearch} className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={`Type a specific question…`}
                    maxLength={200}
                    className="flex-1 text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-nublue-400"
                  />
                  <button
                    type="submit"
                    disabled={!query.trim()}
                    className="shrink-0 w-9 h-9 rounded-xl bg-nublue-600 hover:bg-nublue-700 disabled:opacity-40 text-white flex items-center justify-center transition"
                    aria-label="Search"
                  >
                    <Search size={15} />
                  </button>
                </form>

                {results === null && (
                  <p className="text-[11px] text-slate-400 px-1">
                    Searching within <span className="font-semibold">{subtopic.whole ? category.label : subtopic.label}</span>.
                    Try a few keywords, e.g. "how many days", "required documents", "who do I email".
                  </p>
                )}

                {results !== null && results.length === 0 && (
                  <div className="bg-white border border-slate-100 rounded-xl px-3 py-3 text-sm text-slate-500">
                    No matching text found for "<span className="font-medium">{query}</span>" anywhere in the handbook.
                    Try different keywords, or use <span className="font-semibold text-nublue-600">Give Feedback</span> / <span className="font-semibold text-nublue-600">File a Complaint</span> to ask the Council directly.
                  </div>
                )}

                {results !== null && results.length > 0 && (
                  <div className="space-y-2">
                    {usedFallback && (
                      <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                        No match in "{subtopic.whole ? category.label : subtopic.label}" — showing the closest matches from the whole handbook instead.
                      </p>
                    )}
                    {results.map(r => (
                      <div key={r.id} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <FileText size={12} className="text-nublue-400" />
                          <span className="text-[10px] font-bold text-nublue-500 uppercase tracking-wide">
                            {r.section} · p.{r.page}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => { setSubtopic(null); setResults(null); setQuery('') }}
                  className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-nublue-600 pt-1"
                >
                  <ChevronLeft size={13} /> Choose a different subtopic
                </button>
              </div>
            )}
          </div>

          <p className="px-3 py-2 text-[9px] text-slate-400 text-center bg-white border-t border-slate-100 shrink-0">
            Shows handbook text directly — not a generated answer. For a specific case, use File a Complaint / Give Feedback.
          </p>
        </div>
      )}
    </>
  )
}
