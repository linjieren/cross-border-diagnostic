export interface PriorityAction {
  title: string
  reason: string
  tone: 'critical' | 'warning' | 'info'
}

const ACTION_PATTERNS = [
  /未部署|未检测到|未启用|缺失|无法分析|不完整|失败|未通过/,
  /建议|需优化|应当|需要|优先|检查|补充/,
]

function cleanMarkdownText(value: string): string {
  return value
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/\[|\]\([^)]+\)/g, ''))
    .replace(/[#>*_`|]/g, '')
    .replace(/✅|❌|⚠️|📺/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getTone(line: string): PriorityAction['tone'] {
  if (/❌|未通过|未部署|未检测到|缺失|无法分析|失败/.test(line)) return 'critical'
  if (/⚠️|需优化|建议|应当|需要/.test(line)) return 'warning'
  return 'info'
}

function scoreLine(line: string): number {
  let score = 0
  ACTION_PATTERNS.forEach((pattern) => {
    if (pattern.test(line)) score += 2
  })
  if (/解决方案|下一步|操作指南|预期效果/.test(line)) score += 1
  if (/视频教程|目录|评分|综合评分|诊断日期/.test(line)) score -= 3
  if (line.length < 16 || line.length > 180) score -= 1
  return score
}

export function extractReportTitle(markdown: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)
  return cleanMarkdownText(h1?.[1] || '诊断报告')
}

export function extractPriorityActions(markdown: string, limit = 5): PriorityAction[] {
  const seen = new Set<string>()
  const candidates = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+|^\d+\.\s+/.test(line))
    .map((line) => ({
      raw: line,
      text: cleanMarkdownText(line.replace(/^[-*]\s+|^\d+\.\s+/, '')),
      score: scoreLine(line),
    }))
    .filter((item) => item.score > 0 && item.text)
    .sort((a, b) => b.score - a.score)

  const actions: PriorityAction[] = []
  for (const item of candidates) {
    const key = item.text.slice(0, 40)
    if (seen.has(key)) continue
    seen.add(key)

    const [titlePart, ...rest] = item.text.split(/[:：。]/)
    const title = titlePart.length >= 4 ? titlePart : item.text.slice(0, 32)
    const reason = rest.join('。').trim() || item.text

    actions.push({
      title: title.slice(0, 42),
      reason: reason.slice(0, 96),
      tone: getTone(item.raw),
    })

    if (actions.length >= limit) break
  }

  return actions
}
