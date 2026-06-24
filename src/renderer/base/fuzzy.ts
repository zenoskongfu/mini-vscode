/**
 * 轻量级子序列模糊匹配器。
 * 返回分数（越高越好）和用于高亮的命中字符索引；
 * 如果 `query` 不是 `target` 的子序列，则返回 null。
 *
 * 评分会奖励连续匹配、单词边界匹配、以及更靠前的匹配，
 * 足以接近 VSCode quick-open 的排序手感，同时避免引入额外依赖。
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

    // 每个匹配字符的基础分
    let charScore = 1
    // 连续匹配加分
    if (prevMatchIdx === ti - 1) charScore += 5
    // 字符串开头/单词边界加分
    if (ti === 0 || target[ti - 1] === ' ' || target[ti - 1] === ':' || target[ti - 1] === '.') {
      charScore += 8
    }
    // 更靠前的匹配略微加分
    charScore += Math.max(0, 3 - ti * 0.1)

    score += charScore
    prevMatchIdx = ti
    qi++
  }

  // query 中所有字符都必须命中
  return qi === q.length ? { score, indices } : null
}
