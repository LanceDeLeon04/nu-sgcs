import chunks from '../data/handbook_chunks.json'
import { CATEGORIES } from '../data/handbookIndex.js'

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on', 'for',
  'and', 'or', 'if', 'then', 'so', 'but', 'as', 'at', 'by', 'with', 'from', 'about', 'into', 'over',
  'after', 'before', 'how', 'what', 'when', 'where', 'who', 'whom', 'which', 'why', 'can', 'could',
  'should', 'would', 'will', 'shall', 'do', 'does', 'did', 'my', 'your', 'their', 'our', 'its', 'it',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'they', 'we', 'me', 'him', 'her', 'them',
  'us', 'not', 'no', 'yes', 'have', 'has', 'had', 'am', 'nu', 'national', 'university',
])

function tokenize(str) {
  return (str.toLowerCase().match(/[a-z0-9']+/g) || []).filter(t => t.length > 1 && !STOPWORDS.has(t))
}

// Attach a computed page-range end to each subtopic (next subtopic's page - 1,
// or the section's last chunk page for the last subtopic in a section).
function buildRanges() {
  const withEnds = []
  CATEGORIES.forEach((cat) => {
    const sectionChunks = chunks.filter(c => c.section === cat.section)
    const sectionEnd = sectionChunks.length ? Math.max(...sectionChunks.map(c => c.page)) : cat.subtopics[0]?.page
    cat.subtopics.forEach((sub, si) => {
      const next = cat.subtopics[si + 1]
      const end = next ? next.page - 1 : sectionEnd
      withEnds.push({ categoryId: cat.id, ...sub, end: Math.max(end, sub.page) })
    })
  })
  return withEnds
}
export const SUBTOPIC_RANGES = buildRanges()

export function getCategory(categoryId) {
  return CATEGORIES.find(c => c.id === categoryId)
}

export function getSubtopicRange(categoryId, label) {
  return SUBTOPIC_RANGES.find(s => s.categoryId === categoryId && s.label === label)
}

// All chunks belonging to a whole category/section.
export function chunksForCategory(categoryId) {
  const cat = getCategory(categoryId)
  if (!cat) return []
  return chunks.filter(c => c.section === cat.section)
}

// Chunks within a specific subtopic's page range.
export function chunksForSubtopic(categoryId, label) {
  const range = getSubtopicRange(categoryId, label)
  if (!range) return chunksForCategory(categoryId)
  return chunks.filter(c => c.page >= range.page && c.page <= range.end)
}

// Rank a pool of chunks against a free-text query using weighted keyword overlap.
// No embeddings/API needed — good enough once the pool is already narrowed to a subtopic.
export function searchChunks(pool, query, k = 4) {
  const qTerms = tokenize(query)
  if (qTerms.length === 0) return []
  const scored = pool.map(chunk => {
    const cTerms = tokenize(chunk.text)
    const freq = {}
    for (const t of cTerms) freq[t] = (freq[t] || 0) + 1
    let score = 0
    for (const t of qTerms) if (freq[t]) score += 1 + Math.log(freq[t])
    return { ...chunk, score }
  })
  scored.sort((a, b) => b.score - a.score || a.page - b.page)
  return scored.filter(c => c.score > 0).slice(0, k)
}

// Fallback: search the entire handbook (used when a narrowed subtopic has no hits).
export function searchAll(query, k = 4) {
  return searchChunks(chunks, query, k)
}
