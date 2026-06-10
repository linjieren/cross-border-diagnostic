import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { extractReportTitle } from '../utils/reportInsights'

type PhaseStatus = 'queued' | 'running' | 'done' | 'failed'

interface PhaseInfo {
  id: string
  title: string
  scope: string
  eta: string
  status: PhaseStatus
  summary: string
  details: string[]
  issueCount?: number
}

interface StreamEvent {
  type: string
  step?: number
  title?: string
  delta?: string
  content?: string
  sessionId?: string
  message?: string
  payload?: any
}

const PHASE_ORDER = [
  'positioning',
  'technical',
  'landing',
  'content',
  'tracking',
  'report',
]

const MODULE_TO_PHASE: Record<string, string> = {
  global_acceleration: 'technical',
  lead_page_check: 'landing',
  product_content_audit: 'content',
  form_tracking: 'tracking',
}

function createInitialPhases(): PhaseInfo[] {
  return [
    {
      id: 'positioning',
      title: '识别网站定位',
      scope: '读取页面标题、核心文案和产品表达',
      eta: '约 10-20 秒',
      status: 'queued',
      summary: '等待开始',
      details: ['会先判断网站卖什么、面向谁、当前价值主张是否清晰。'],
    },
    {
      id: 'technical',
      title: '检查访问速度与技术基础',
      scope: 'CDN、TTFB、HTTP/2/3、图片与缓存',
      eta: '约 20-40 秒',
      status: 'queued',
      summary: '等待开始',
      details: ['重点检查跨境访问速度和基础性能是否会影响广告流量承接。'],
    },
    {
      id: 'landing',
      title: '检查落地页信任与转化',
      scope: '表单安全、信任元素、跳转与留资体验',
      eta: '约 20-40 秒',
      status: 'queued',
      summary: '等待开始',
      details: ['重点判断用户进站后是否愿意继续了解、咨询或提交线索。'],
    },
    {
      id: 'content',
      title: '检查产品内容完整度',
      scope: '产品描述、图片、视频、参数、场景与本地化',
      eta: '约 20-40 秒',
      status: 'queued',
      summary: '等待开始',
      details: ['重点检查产品页是否足够支撑海外用户理解和信任。'],
    },
    {
      id: 'tracking',
      title: '检查表单和广告追踪',
      scope: 'GA4、广告像素、转化事件与 Cookie 合规',
      eta: '约 20-40 秒',
      status: 'queued',
      summary: '等待开始',
      details: ['重点检查投放效果是否可衡量，表单线索是否能被正确追踪。'],
    },
    {
      id: 'report',
      title: '生成诊断报告',
      scope: '整理问题、影响、修复步骤和验证方式',
      eta: '约 20-60 秒',
      status: 'queued',
      summary: '等待开始',
      details: ['报告会保留完整操作指南，方便你按步骤修改后重新检测。'],
    },
  ]
}

function statusLabel(status: PhaseStatus) {
  if (status === 'done') return '已完成'
  if (status === 'running') return '检查中'
  if (status === 'failed') return '需要处理'
  return '待开始'
}

function statusClass(status: PhaseStatus) {
  if (status === 'done') return 'gm-chip gm-chip--success'
  if (status === 'running') return 'gm-chip gm-chip--info'
  if (status === 'failed') return 'gm-chip gm-chip--danger'
  return 'gm-chip gm-chip--neutral'
}

function phaseProgressClass(status: PhaseStatus) {
  if (status === 'done') return 'gm-phase-indicator gm-phase-indicator--done'
  if (status === 'running') return 'gm-phase-indicator gm-phase-indicator--running'
  if (status === 'failed') return 'gm-phase-indicator gm-phase-indicator--failed'
  return 'gm-phase-indicator gm-phase-indicator--queued'
}

function findingStatusLabel(status?: string) {
  if (status === 'pass') return '通过'
  if (status === 'warn') return '需优化'
  if (status === 'fail') return '未通过'
  return '待确认'
}

function countIssues(result: any) {
  const findings = Array.isArray(result?.findings) ? result.findings : []
  return findings.filter((finding: any) => finding.status === 'warn' || finding.status === 'fail').length
}

function summarizeModule(result: any) {
  if (result?.error) return `检查遇到问题：${result.error}`
  const findings = Array.isArray(result?.findings) ? result.findings : []
  const issueCount = countIssues(result)
  if (!findings.length) return '检查完成，暂无可展示细节'
  if (issueCount === 0) return '检查完成，未发现关键阻碍'
  return `检查完成，发现 ${issueCount} 个需要关注的问题`
}

function moduleDetails(result: any) {
  if (result?.error) return ['自动检查未能完成。建议先查看完整报告中的人工复核建议，或重新发起一次诊断。']
  const findings = Array.isArray(result?.findings) ? result.findings : []
  return findings.slice(0, 6).map((finding: any) => {
    const label = findingStatusLabel(finding.status)
    const check = finding.check || '检测项'
    const detail = finding.detail || '暂无详情'
    return `${label}：${check}。${detail}`
  })
}

function updatePhases(
  phases: PhaseInfo[],
  phaseIds: string[],
  update: Partial<PhaseInfo> | ((phase: PhaseInfo) => Partial<PhaseInfo>),
) {
  const target = new Set(phaseIds)
  return phases.map((phase) => {
    if (!target.has(phase.id)) return phase
    const patch = typeof update === 'function' ? update(phase) : update
    return { ...phase, ...patch }
  })
}

export default function AgentThinkingPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [phases, setPhases] = useState<PhaseInfo[]>(createInitialPhases)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [reportTitle, setReportTitle] = useState('诊断报告')
  const esRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const finishedRef = useRef(false)
  const reconnectTimerRef = useRef<number | null>(null)
  const activePhaseRef = useRef<string>('report')

  const completedCount = phases.filter((phase) => phase.status === 'done').length
  const activePhase = phases.find((phase) => phase.status === 'running')
  const progress = Math.round((completedCount / phases.length) * 100)

  useEffect(() => {
    if (activePhase?.id) {
      activePhaseRef.current = activePhase.id
    }
  }, [activePhase?.id])

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/agent/diagnose/${sessionId}/report`)
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data.url) setTargetUrl(data.url)
        if (data.reportMarkdown) {
          setReportTitle(extractReportTitle(data.reportMarkdown))
        }
      })
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (!finished || !sessionId) return

    fetch(`/api/agent/diagnose/${sessionId}/report`)
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (!data.reportMarkdown) return
        setReportTitle(extractReportTitle(data.reportMarkdown))
      })
      .catch(() => {})
  }, [finished, sessionId])

  const setRunningStep = useCallback((step?: number) => {
    if (step === 1) {
      setPhases((prev) =>
        updatePhases(prev, ['positioning'], {
          status: 'running',
          summary: '正在识别网站定位和产品表达',
        }),
      )
    }

    if (step === 2) {
      setPhases((prev) => {
        let next = updatePhases(prev, ['positioning'], { status: 'done', summary: '网站定位识别完成' })
        next = updatePhases(next, ['technical', 'landing', 'content', 'tracking'], {
          status: 'running',
          summary: '正在同步检查',
        })
        return next
      })
    }

    if (step === 3) {
      setPhases((prev) => {
        let next = updatePhases(prev, ['technical', 'landing', 'content', 'tracking'], (phase) => ({
          status: phase.status === 'failed' ? 'failed' : 'done',
          summary: phase.summary === '正在同步检查' ? '模块检查完成' : phase.summary,
        }))
        next = updatePhases(next, ['report'], {
          status: 'running',
          summary: '正在整理完整诊断报告',
        })
        return next
      })
    }
  }, [])

  const handleEvent = useCallback((data: StreamEvent) => {
    switch (data.type) {
      case 'step-start':
        setRunningStep(data.step)
        break
      case 'thinking':
      case 'step-think': {
        const message = data.delta || data.content || data.payload?.message
        if (!message) break
        const targetPhase = data.step === 1 ? 'positioning' : data.step === 3 ? 'report' : undefined
        if (!targetPhase) break
        setPhases((prev) =>
          updatePhases(prev, [targetPhase], (phase) => ({
            details: [...phase.details, message],
          })),
        )
        break
      }
      case 'step-result': {
        if (data.step === 1) {
          const result = data.payload?.result || {}
          const productType = result.productType || result.raw || '已完成网站基础理解'
          setPhases((prev) =>
            updatePhases(prev, ['positioning'], {
              summary: `初步判断：${productType}`,
              details: [
                `产品类型：${productType}`,
                result.targetAudience ? `目标受众：${result.targetAudience}` : '目标受众：需要结合报告进一步确认',
                result.keyValueProposition ? `价值主张：${result.keyValueProposition}` : '价值主张：已进入报告生成阶段综合判断',
              ],
            }),
          )
        }

        if (data.step === 2) {
          const results = Array.isArray(data.payload?.result) ? data.payload.result : []
          setPhases((prev) => {
            let next = prev
            results.forEach((result: any) => {
              const phaseId = MODULE_TO_PHASE[result?.module]
              if (!phaseId) return
              const issues = countIssues(result)
              next = updatePhases(next, [phaseId], {
                status: result?.error ? 'failed' : 'done',
                summary: summarizeModule(result),
                details: moduleDetails(result),
                issueCount: issues,
              })
            })
            return next
          })
        }

        if (data.step === 3) {
          setPhases((prev) =>
            updatePhases(prev, ['report'], {
              summary: '报告内容已整理完成',
              details: ['已生成完整诊断报告，包含问题影响、修复步骤、验证方式和参考资料。'],
            }),
          )
        }
        break
      }
      case 'step-complete':
        if (data.step === 1) {
          setPhases((prev) => updatePhases(prev, ['positioning'], { status: 'done' }))
        }
        if (data.step === 2) {
          setPhases((prev) =>
            updatePhases(prev, ['technical', 'landing', 'content', 'tracking'], (phase) => ({
              status: phase.status === 'failed' ? 'failed' : 'done',
              summary: phase.summary === '正在同步检查' ? '模块检查完成' : phase.summary,
            })),
          )
        }
        if (data.step === 3) {
          setPhases((prev) => updatePhases(prev, ['report'], { status: 'done' }))
        }
        break
      case 'report-complete':
        finishedRef.current = true
        setFinished(true)
        esRef.current?.close()
        setConnected(false)
        setPhases((prev) => updatePhases(prev, PHASE_ORDER, (phase) => ({
          status: phase.status === 'failed' ? 'failed' : 'done',
        })))
        break
      case 'error':
        setError(data.message || data.payload?.message || '诊断过程中遇到问题，请重试')
        setConnected(false)
        setPhases((prev) =>
          updatePhases(prev, [activePhaseRef.current || 'report'], {
            status: 'failed',
            summary: '当前阶段未能完成',
          }),
        )
        esRef.current?.close()
        break
    }
  }, [setRunningStep])

  const connect = useCallback((reset = false) => {
    if (!sessionId) return
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    setConnected(false)

    if (reset) {
      setError('')
      finishedRef.current = false
      setFinished(false)
      setPhases(createInitialPhases())
    }

    const es = new EventSource(`/api/agent/diagnose/${sessionId}/stream`)
    esRef.current = es

    es.onopen = () => setConnected(true)
    es.onmessage = (event) => {
      try {
        handleEvent(JSON.parse(event.data))
      } catch {
        // Ignore malformed stream events from the transport layer.
      }
    }
    es.onerror = () => {
      setConnected(false)
      es.close()
      if (!finishedRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => connect(false), 2500)
      }
    }

    return () => es.close()
  }, [handleEvent, sessionId])

  useEffect(() => {
    const cleanup = connect(true)
    return () => {
      cleanup?.()
      esRef.current?.close()
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [connect])

  useEffect(() => {
    if (!sessionId || finished) return

    const timer = window.setInterval(() => {
      fetch(`/api/agent/diagnose/${sessionId}/report`)
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          if (data.status === 'completed' && data.reportMarkdown) {
            finishedRef.current = true
            setFinished(true)
            setConnected(false)
            esRef.current?.close()
            setReportTitle(extractReportTitle(data.reportMarkdown))
            setPhases((prev) => updatePhases(prev, PHASE_ORDER, (phase) => ({
              status: phase.status === 'failed' ? 'failed' : 'done',
              summary: phase.summary === '等待开始' ? '已完成' : phase.summary,
            })))
          }
          if (data.status === 'failed') {
            setError('后台诊断未能完成，请重试')
          }
        })
        .catch(() => {})
    }, 4000)

    return () => window.clearInterval(timer)
  }, [finished, sessionId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [phases, finished])

  const togglePhase = (phaseId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  return (
    <div className="gm-shell h-screen flex flex-col">
      <header className="gm-topbar shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <div>
            <h1 className="gm-topbar-title">诊断工作台</h1>
            <p className="gm-topbar-subtitle">全方位检查网站技术基础、转化体验和追踪能力</p>
          </div>
        </div>
        <div className="gm-inline-meta">
          <span className={`gm-live-dot ${finished ? 'is-done' : error ? 'is-error' : 'is-live'}`} />
          {finished ? '报告已生成' : error ? '需要重试' : connected ? '后台诊断中' : '后台生成中'}
        </div>
      </header>

      <div className="gm-workspace-layout">
        {targetUrl && (
          <aside className="gm-preview-pane hidden lg:flex w-[42%] min-w-[420px] max-w-[760px] flex-col">
            <div className="gm-preview-toolbar">
              <span>网站预览</span>
              <span className="truncate max-w-[280px]">{targetUrl}</span>
            </div>
            <iframe
              src={targetUrl}
              title="网站预览"
              className="w-full flex-1"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </aside>
        )}

        <main className="gm-workspace-main">
          <section className="gm-workspace-hero shrink-0">
            <div className="gm-workspace-hero-inner">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="gm-section-kicker">Diagnosis workspace</p>
                  <h2 className="text-[22px] font-semibold text-[#202124] mt-1">正在生成网站诊断报告</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="gm-btn gm-btn-secondary"
                >
                  返回首页
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="gm-progress flex-1">
                  <div
                    className="gm-progress-bar"
                    style={{ width: `${finished ? 100 : progress}%` }}
                  />
                </div>
                <span className="gm-meta-copy w-20 text-right">{finished ? 100 : progress}%</span>
              </div>
              <p className="gm-meta-copy mt-2">
                {activePhase ? `${activePhase.title} · ${activePhase.eta}` : finished ? '完整报告已准备好' : '预计 1-3 分钟完成'}
              </p>
            </div>
          </section>

          <div ref={scrollRef} className="gm-workspace-scroll">
            <div className="gm-workspace-column">
              <div className="gm-message-row">
                <div className="gm-avatar gm-avatar--bot shrink-0">
                  Bot
                </div>
                <div className="gm-bubble">
                  <div className="gm-bubble-content">
                    我会按阶段检查这个网站，并把结论整理成一份可执行的诊断报告。阶段默认折叠，你可以点开查看当前检查内容和初步发现。
                  </div>
                </div>
              </div>

              {phases.map((phase) => {
                const isExpanded = expanded.has(phase.id)
                const isRunning = phase.status === 'running'

                return (
                  <div key={phase.id} className="gm-message-row">
                    <div className="gm-phase-index shrink-0">
                      <span className={phaseProgressClass(phase.status)}>
                        <span>{phase.status === 'done' ? '' : PHASE_ORDER.indexOf(phase.id) + 1}</span>
                      </span>
                    </div>
                    <article className="gm-collapse-card w-full">
                      <button
                        type="button"
                        onClick={() => togglePhase(phase.id)}
                        className="gm-collapse-header"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900">{phase.title}</h3>
                              <span className={statusClass(phase.status)}>
                                {statusLabel(phase.status)}
                              </span>
                              {typeof phase.issueCount === 'number' && phase.issueCount > 0 && (
                                <span className="gm-chip gm-chip--warning">
                                  {phase.issueCount} 个关注项
                                </span>
                              )}
                            </div>
                            <p className="gm-meta-copy mt-1">{phase.scope}</p>
                            <p className={`gm-phase-summary ${phase.status === 'queued' ? 'is-muted' : ''}`}>
                              {phase.summary}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="hidden sm:inline gm-meta-copy">{phase.eta}</span>
                            <span className="gm-meta-copy">{isExpanded ? '收起' : '展开'}</span>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="gm-collapse-body">
                          <div className="gm-phase-details">
                            {phase.details.map((detail, index) => (
                              <p key={`${phase.id}-${index}`} className="gm-body-copy">
                                {detail}
                              </p>
                            ))}
                            {isRunning && (
                              <p className="gm-phase-running">正在检查，完成后会自动更新结论。</p>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  </div>
                )
              })}

              {finished && (
                <div className="gm-message-row">
                  <div className="gm-avatar shrink-0" style={{ background: '#34A853', color: '#fff' }}>
                    OK
                  </div>
                  <div className="gm-panel gm-workspace-success w-full px-4 py-4">
                    <p className="text-sm font-semibold text-gray-900">诊断报告已生成</p>
                    <p className="text-base font-semibold text-gray-900 mt-1">{reportTitle}</p>
                    <p className="gm-body-copy mt-1">
                      完整报告已准备好，进入报告页查看问题、影响、修复步骤和验证方式。
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(`/report/${sessionId}`)}
                      className="gm-btn gm-btn-primary mt-3"
                    >
                      查看完整报告
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="gm-workspace-footer shrink-0">
              <div className="gm-workspace-hero-inner flex items-center justify-between gap-3">
                <p className="text-sm text-[#b3261e]">{error}</p>
                <button
                  type="button"
                  onClick={() => connect(true)}
                  className="gm-btn gm-btn-danger"
                >
                  重试
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
