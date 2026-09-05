import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

function createInitialPhases(t: TFunction): PhaseInfo[] {
  return PHASE_ORDER.map((id) => ({
    id,
    title: t(`thinking.phases.${id}.title`),
    scope: t(`thinking.phases.${id}.scope`),
    eta: t(`thinking.phases.${id}.eta`),
    status: 'queued',
    summary: t('thinking.waiting'),
    details: [t(`thinking.phases.${id}.detail`)],
  }))
}

function statusLabel(status: PhaseStatus, t: TFunction) {
  if (status === 'done') return t('thinking.phaseStatus.done')
  if (status === 'running') return t('thinking.phaseStatus.running')
  if (status === 'failed') return t('thinking.phaseStatus.failed')
  return t('thinking.phaseStatus.queued')
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

function findingStatusLabel(status: string | undefined, t: TFunction) {
  if (status === 'pass') return t('thinking.findingStatus.pass')
  if (status === 'warn') return t('thinking.findingStatus.warn')
  if (status === 'fail') return t('thinking.findingStatus.fail')
  return t('thinking.findingStatus.pending')
}

function countIssues(result: any) {
  const findings = Array.isArray(result?.findings) ? result.findings : []
  return findings.filter((finding: any) => finding.status === 'warn' || finding.status === 'fail').length
}

function summarizeModule(result: any, t: TFunction) {
  if (result?.error) return t('thinking.moduleError', { error: result.error })
  const findings = Array.isArray(result?.findings) ? result.findings : []
  const issueCount = countIssues(result)
  if (!findings.length) return t('thinking.moduleDoneNoDetails')
  if (issueCount === 0) return t('thinking.moduleDoneNoIssues')
  return t('thinking.moduleDoneIssues', { count: issueCount })
}

function moduleDetails(result: any, t: TFunction) {
  if (result?.error) return [t('thinking.moduleErrorDetail')]
  const findings = Array.isArray(result?.findings) ? result.findings : []
  return findings.slice(0, 6).map((finding: any) =>
    t('thinking.findingLine', {
      label: findingStatusLabel(finding.status, t),
      check: finding.check || t('thinking.checkItem'),
      detail: finding.detail || t('thinking.noDetail'),
    }),
  )
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

function PhaseBody({
  details,
  isRunning,
  isExpanded,
}: {
  details: string[]
  isRunning: boolean
  isExpanded: boolean
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const { t } = useTranslation()

  useEffect(() => {
    const el = bodyRef.current
    if (el && isExpanded && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [details, isExpanded])

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
  }

  return (
    <div ref={bodyRef} onScroll={handleScroll} className="gm-phase-details-scroll">
      <div className="gm-phase-details">
        {details.map((detail, index) => (
          <p key={`detail-${index}`} className="gm-body-copy">
            {detail}
          </p>
        ))}
        {isRunning && (
          <p className="gm-phase-running">{t('thinking.runningHint')}</p>
        )}
      </div>
    </div>
  )
}

export default function AgentThinkingPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const [phases, setPhases] = useState<PhaseInfo[]>(() => createInitialPhases(t))
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({})
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [reportTitle, setReportTitle] = useState(() => t('thinking.defaultReportTitle'))
  const esRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})
  const finishedRef = useRef(false)
  const reconnectTimerRef = useRef<number | null>(null)
  const activePhaseRef = useRef<string>('report')

  const completedCount = phases.filter((phase) => phase.status === 'done').length
  const activePhase = phases.find((phase) => phase.status === 'running')
  const progress = Math.round((completedCount / phases.length) * 100)

  const isAutoExpanded = (phase: PhaseInfo) =>
    phase.status === 'running' || phase.status === 'failed'

  const isPhaseExpanded = (phase: PhaseInfo) =>
    phase.id in manualOverrides ? manualOverrides[phase.id] : isAutoExpanded(phase)

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
    const t = tRef.current
    if (step === 1) {
      setPhases((prev) =>
        updatePhases(prev, ['positioning'], {
          status: 'running',
          summary: t('thinking.runningPositioning'),
        }),
      )
    }

    if (step === 2) {
      setPhases((prev) => {
        let next = updatePhases(prev, ['positioning'], { status: 'done', summary: t('thinking.positioningDone') })
        next = updatePhases(next, ['technical', 'landing', 'content', 'tracking'], {
          status: 'running',
          summary: t('thinking.syncChecking'),
        })
        return next
      })
    }

    if (step === 3) {
      setPhases((prev) => {
        let next = updatePhases(prev, ['technical', 'landing', 'content', 'tracking'], (phase) => ({
          status: phase.status === 'failed' ? 'failed' : 'done',
          summary: phase.status === 'running' ? t('thinking.modulesDone') : phase.summary,
        }))
        next = updatePhases(next, ['report'], {
          status: 'running',
          summary: t('thinking.preparingReport'),
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
        const t = tRef.current
        if (data.step === 1) {
          const result = data.payload?.result || {}
          const productType = result.productType || result.raw || t('thinking.basicUnderstanding')
          setPhases((prev) =>
            updatePhases(prev, ['positioning'], {
              summary: t('thinking.initialVerdict', { productType }),
              details: [
                t('thinking.productType', { productType }),
                result.targetAudience
                  ? t('thinking.targetAudience', { value: result.targetAudience })
                  : t('thinking.targetAudienceUnknown'),
                result.keyValueProposition
                  ? t('thinking.valueProposition', { value: result.keyValueProposition })
                  : t('thinking.valuePropositionPending'),
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
                summary: summarizeModule(result, t),
                details: moduleDetails(result, t),
                issueCount: issues,
              })
            })
            return next
          })
        }

        if (data.step === 3) {
          setPhases((prev) =>
            updatePhases(prev, ['report'], {
              summary: t('thinking.reportContentReady'),
              details: [t('thinking.reportGeneratedDetail')],
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
          const t = tRef.current
          setPhases((prev) =>
            updatePhases(prev, ['technical', 'landing', 'content', 'tracking'], (phase) => ({
              status: phase.status === 'failed' ? 'failed' : 'done',
              summary: phase.status === 'running' ? t('thinking.modulesDone') : phase.summary,
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
        setError(data.message || data.payload?.message || tRef.current('thinking.streamError'))
        setConnected(false)
        setPhases((prev) =>
          updatePhases(prev, [activePhaseRef.current || 'report'], {
            status: 'failed',
            summary: tRef.current('thinking.phaseFailed'),
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
      setPhases(createInitialPhases(tRef.current))
      setManualOverrides({})
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
              summary: phase.status === 'queued' ? tRef.current('thinking.phaseStatus.done') : phase.summary,
            })))
          }
          if (data.status === 'failed') {
            setError(tRef.current('thinking.backgroundFailed'))
          }
        })
        .catch(() => {})
    }, 4000)

    return () => window.clearInterval(timer)
  }, [finished, sessionId])

  const prevActivePhaseRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const id = activePhase?.id
    if (id && id !== prevActivePhaseRef.current) {
      cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    prevActivePhaseRef.current = id
  }, [activePhase?.id])

  useEffect(() => {
    if (finished && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [finished])

  const togglePhase = (phase: PhaseInfo) => {
    setManualOverrides((prev) => ({
      ...prev,
      [phase.id]: !isPhaseExpanded(phase),
    }))
  }

  return (
    <div className="gm-shell h-screen flex flex-col">
      <header className="gm-topbar shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <div>
            <h1 className="gm-topbar-title">{t('thinking.workbenchTitle')}</h1>
            <p className="gm-topbar-subtitle">{t('thinking.workbenchSubtitle')}</p>
          </div>
        </div>
        <div className="gm-inline-meta">
          <span className={`gm-live-dot ${finished ? 'is-done' : error ? 'is-error' : 'is-live'}`} />
          {finished
            ? t('thinking.statusDone')
            : error
              ? t('thinking.statusRetry')
              : connected
                ? t('thinking.statusDiagnosing')
                : t('thinking.statusGenerating')}
        </div>
      </header>

      <div className="gm-workspace-layout">
        {targetUrl && (
          <aside className="gm-preview-pane hidden lg:flex w-[42%] min-w-[420px] max-w-[760px] flex-col">
            <div className="gm-preview-toolbar">
              <span>{t('thinking.preview')}</span>
              <span className="truncate max-w-[280px]">{targetUrl}</span>
            </div>
            <iframe
              src={targetUrl}
              title={t('thinking.preview')}
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
                  <h2 className="text-[22px] font-semibold text-[#202124] mt-1">{t('thinking.heroTitle')}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="gm-btn gm-btn-secondary"
                >
                  {t('thinking.backHome')}
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
                {activePhase
                  ? `${activePhase.title} · ${activePhase.eta}`
                  : finished
                    ? t('thinking.reportReady')
                    : t('thinking.etaTotal')}
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
                    {t('thinking.introBubble')}
                  </div>
                </div>
              </div>

              {phases.map((phase) => {
                const isExpanded = isPhaseExpanded(phase)
                const isRunning = phase.status === 'running'

                return (
                  <div key={phase.id} className="gm-message-row">
                    <div className="gm-phase-index shrink-0">
                      <span className={phaseProgressClass(phase.status)}>
                        <span>{phase.status === 'done' ? '' : PHASE_ORDER.indexOf(phase.id) + 1}</span>
                      </span>
                    </div>
                    <article
                      ref={(el) => {
                        cardRefs.current[phase.id] = el
                      }}
                      className="gm-collapse-card w-full"
                    >
                      <button
                        type="button"
                        onClick={() => togglePhase(phase)}
                        className="gm-collapse-header"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900">{phase.title}</h3>
                              <span className={statusClass(phase.status)}>
                                {statusLabel(phase.status, t)}
                              </span>
                              {typeof phase.issueCount === 'number' && phase.issueCount > 0 && (
                                <span className="gm-chip gm-chip--warning">
                                  {t('thinking.issueCount', { count: phase.issueCount })}
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
                            <span className="gm-meta-copy">{isExpanded ? t('thinking.collapse') : t('thinking.expand')}</span>
                          </div>
                        </div>
                      </button>

                      <div className={`gm-collapse-anim ${isExpanded ? 'is-open' : ''}`}>
                        <div className="gm-collapse-anim-inner">
                          <div className="gm-collapse-body">
                            <PhaseBody
                              details={phase.details}
                              isRunning={isRunning}
                              isExpanded={isExpanded}
                            />
                          </div>
                        </div>
                      </div>
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
                    <p className="text-sm font-semibold text-gray-900">{t('thinking.reportGeneratedTitle')}</p>
                    <p className="text-base font-semibold text-gray-900 mt-1">{reportTitle}</p>
                    <p className="gm-body-copy mt-1">
                      {t('thinking.reportGeneratedBody')}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(`/report/${sessionId}`)}
                      className="gm-btn gm-btn-primary mt-3"
                    >
                      {t('thinking.viewReport')}
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
                  {t('thinking.retry')}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
