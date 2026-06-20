/**
 * Lightweight subsequence fuzzy matcher.
 * Returns a score (higher = better) and the matched character indices for
 * highlighting, or null if `query` is not a subsequence of `target`.
 *
 * Scoring rewards: consecutive matches, matches at word boundaries, and
 * matches near the start — enough to feel like VSCode's quick-open ordering
 * without pulling in a dependency.
 */
export interface FuzzyMatch {
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] }

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  const indices: number[] = []
  let score = 0
  let qi = 0
  let prevMatchIdx = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue

    indices.push(ti)

    // Base point per matched char
    let charScore = 1
    // Consecutive match bonus
    if (prevMatchIdx === ti - 1) charScore += 5
    // Start-of-string / word-boundary bonus
    if (ti === 0 || target[ti - 1] === ' ' || target[ti - 1] === ':' || target[ti - 1] === '.') {
      charScore += 8
    }
    // Earlier matches are slightly better
    charScore += Math.max(0, 3 - ti * 0.1)

    score += charScore
    prevMatchIdx = ti
    qi++
  }

  // All query characters must have matched
  return qi === q.length ? { score, indices } : null
}
