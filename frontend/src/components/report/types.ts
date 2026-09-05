export interface ReportIssue {
  module: string
  check: string
  status: 'fail' | 'warn'
  detail: string
  evidence?: string
}

export interface ReportModuleInsight {
  module: string
  score: number | null
  passCount: number
  warnCount: number
  failCount: number
}

export interface ReportInsights {
  overallScore: number | null
  modules: ReportModuleInsight[]
  issues: ReportIssue[]
  topIssues: ReportIssue[]
}

export const MODULE_NAME_KEYS: Record<string, string> = {
  global_acceleration: 'diagnosis.moduleGlobalAcceleration',
  lead_page_check: 'diagnosis.moduleLeadPage',
  product_content_audit: 'diagnosis.moduleProductContent',
  form_tracking: 'diagnosis.moduleFormTracking',
}

// Canonical module section titles written into generated reports
// (mirrors CANONICAL_MODULES in backend/src/agent/reportGenerator.ts).
export const MODULE_ANCHOR_TITLES: Record<string, string> = {
  global_acceleration: '访问与加载体验',
  lead_page_check: '落地页转化诊断',
  product_content_audit: '产品与合规内容诊断',
  form_tracking: '线索与表单追踪诊断',
}

export type ScoreTier = 'good' | 'warn' | 'bad' | 'empty'

export function scoreTier(score: number | null | undefined): ScoreTier {
  if (score == null) return 'empty'
  if (score >= 75) return 'good'
  if (score >= 45) return 'warn'
  return 'bad'
}
