import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../components/Logo'

interface StepInfo {
  step: number
  title: string
  status: 'pending' | 'active' | 'completed'
  thoughts: string[]
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

export default function AgentThinkingPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [steps, setSteps] = useState<StepInfo[]>([
    { step: 1, title: t('agentThinking.step1Title'), status: 'pending', thoughts: [] },
    { step: 2, title: t('agentThinking.step2Title'), status: 'pending', thoughts: [] },
    { step: 3, title: t('agentThinking.step3Title'), status: 'pending', thoughts: [] },
  ])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const esRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch session info (url for iframe)
  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/agent/diagnose/${sessionId}/report`)
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data.url) setTargetUrl(data.url)
      })
      .catch(() => {})
  }, [sessionId])

  const connect = useCallback(() => {
    if (!sessionId) return
    setError('')
    setConnected(false)

    const es = new EventSource(`/api/agent/diagnose/${sessionId}/stream`)
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
    }

    es.onmessage = (e) => {
      try {
        const data: StreamEvent = JSON.parse(e.data)
        handleEvent(data)
      } catch {
        // ignore non-JSON messages
      }
    }

    es.onerror = () => {
      setConnected(false)
      es.close()
      if (!finished) {
        setError(t('agentThinking.streamError'))
      }
    }

    return () => {
      es.close()
    }
  }, [sessionId, finished, t])

  const handleEvent = useCallback((data: StreamEvent) => {
    switch (data.type) {
      case 'step-start':
        setSteps((prev) =>
          prev.map((s) =>
            s.step === data.step
              ? { ...s, status: 'active', title: data.title || data.payload?.name || s.title }
              : s.step < (data.step || 0)
                ? { ...s, status: 'completed' }
                : s
          )
        )
        break
      case 'thinking':
      case 'step-think':
        setSteps((prev) =>
          prev.map((s) =>
            s.step === data.step
              ? {
                  ...s,
                  status: 'active',
                  // Step 3 (report generation): don't show stream chunks, only static hint
                  thoughts:
                    s.step === 3
                      ? []
                      : data.delta
                        ? [...s.thoughts, data.delta]
                        : data.content
                          ? [...s.thoughts, data.content]
                          : data.payload?.message
                            ? [...s.thoughts, data.payload.message]
                            : s.thoughts,
                }
              : s
          )
        )
        break
      case 'step-complete':
        setSteps((prev) =>
          prev.map((s) =>
            s.step === data.step ? { ...s, status: 'completed' } : s
          )
        )
        break
      case 'report-complete':
        setFinished(true)
        esRef.current?.close()
        navigate(`/report/${data.sessionId || sessionId}`)
        break
      case 'error':
        setError(data.message || data.payload?.message || t('agentThinking.unknownError'))
        esRef.current?.close()
        break
    }
  }, [navigate, sessionId, t])

  useEffect(() => {
    const cleanup = connect()
    return () => {
      cleanup?.()
      esRef.current?.close()
    }
  }, [connect])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steps])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <h1 className="text-sm font-semibold text-gray-800">{t('agentThinking.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}
          />
          <span className="text-xs text-gray-500">
            {connected ? t('agentThinking.connected') : t('agentThinking.disconnected')}
          </span>
        </div>
      </header>

      <div className={`flex-1 flex ${targetUrl ? 'flex-row' : 'flex-col'} overflow-hidden`}>
        {/* Left: iframe preview */}
        {targetUrl && (
          <div className="w-1/2 h-full border-r border-gray-200 bg-white hidden md:block">
            <iframe
              src={targetUrl}
              title={t('agentThinking.preview')}
              className="w-full h-full"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        )}

        {/* Right: progress + thinking */}
        <div className={`flex flex-col ${targetUrl ? 'w-1/2' : 'w-full'} h-full`}>
          {/* Progress bar */}
          <div className="bg-white border-b border-gray-200 px-4 py-4 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between">
                {steps.map((s, i) => (
                  <div key={s.step} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                          s.status === 'completed'
                            ? 'bg-indigo-600 text-white'
                            : s.status === 'active'
                              ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600'
                              : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {s.status === 'completed' ? '✓' : s.step}
                      </div>
                      <span
                        className={`text-xs mt-1.5 font-medium ${
                          s.status === 'pending' ? 'text-gray-400' : 'text-gray-700'
                        }`}
                      >
                        {s.title}
                      </span>
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 transition ${
                          s.status === 'completed' ? 'bg-indigo-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Thinking blocks */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {steps.map((s) => (
                <div
                  key={s.step}
                  className={`rounded-xl border transition ${
                    s.status === 'active'
                      ? 'border-indigo-200 bg-white shadow-sm'
                      : s.status === 'completed'
                        ? 'border-green-200 bg-green-50/30'
                        : 'border-gray-100 bg-gray-50/50'
                  }`}
                >
                  <div className="px-4 py-3 flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        s.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : s.status === 'active'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {s.status === 'completed'
                        ? t('agentThinking.stepCompleted')
                        : s.status === 'active'
                          ? t('agentThinking.stepInProgress')
                          : t('agentThinking.stepPending')}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{s.title}</span>
                  </div>
                  {s.thoughts.length > 0 && (
                    <div className="px-4 pb-4 space-y-2">
                      {s.thoughts.map((thought, idx) => (
                        <div
                          key={idx}
                          className="text-sm text-gray-600 leading-relaxed animate-fadeIn"
                        >
                          {thought}
                        </div>
                      ))}
                      {s.status === 'active' && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-500 mt-1">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                          {t('agentThinking.thinking')}
                        </div>
                      )}
                    </div>
                  )}
                  {s.step === 3 && s.status === 'active' && s.thoughts.length === 0 && (
                    <div className="px-4 pb-4 flex items-center gap-1.5 text-xs text-indigo-500">
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                      {t('agentThinking.generating')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Error / Retry */}
          {error && (
            <div className="shrink-0 bg-red-50 border-t border-red-100 px-4 py-4">
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <span className="text-sm text-red-700">{error}</span>
                <button
                  onClick={connect}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
                >
                  {t('common.retry')}
                </button>
              </div>
            </div>
          )}

          {/* Finished overlay */}
          {finished && (
            <div className="shrink-0 bg-green-50 border-t border-green-100 px-4 py-4">
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <span className="text-sm text-green-700">{t('agentThinking.redirecting')}</span>
                <div className="w-5 h-5 border-2 border-green-200 border-t-green-600 rounded-full animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
