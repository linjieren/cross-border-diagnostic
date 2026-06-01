import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Logo from '../components/Logo'
import LikeButton from '../components/LikeButton'

/* ---------- helpers ---------- */

function extractYouTubeID(href: string): string | null {
  const m = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

function YouTubeCard({ href, children }: { href: string; children: ReactNode }) {
  const id = extractYouTubeID(href)
  if (!id) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2">
        {children}
      </a>
    )
  }
  const thumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`
  const titleText = typeof children === 'string' ? children : 'YouTube Video'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block my-4 rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition group max-w-md"
    >
      <div className="relative aspect-video bg-gray-100">
        <img src={thumb} alt={titleText} className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-8 bg-red-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition">
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-sm font-medium text-gray-800 line-clamp-2">{titleText}</div>
        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
          youtube.com
        </div>
      </div>
    </a>
  )
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  quotedText?: string
}

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const reportRef = useRef<HTMLDivElement>(null)

  const [report, setReport] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [quotedText, setQuotedText] = useState('')
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Fetch report
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/agent/diagnose/${sessionId}/report`)
      .then((r) => {
        if (!r.ok) throw new Error(t('report.loadFailed'))
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setReport(data.reportMarkdown || '')
        if (data.url) setTargetUrl(data.url)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId, t])

  // Fetch chat history
  const loadHistory = useCallback(() => {
    if (!sessionId) return
    fetch(`/api/agent/consultant/${sessionId}/history`)
      .then((r) => r.json().catch(() => ({ messages: [] })))
      .then((data) => {
        if (Array.isArray(data.messages)) {
          setMessages(data.messages)
        }
      })
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (chatOpen) loadHistory()
  }, [chatOpen, loadHistory])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages])

  // Text selection handler
  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (text.length > 5 && text.length < 500) {
      setQuotedText(text)
    }
  }, [])

  // Send chat message
  const sendMessage = useCallback(async () => {
    if (!sessionId || !input.trim() || sending) return
    const body: Record<string, string> = { message: input.trim() }
    if (quotedText) body.quotedText = quotedText

    const userMsg: ChatMessage = {
      role: 'user',
      content: input.trim(),
      quotedText: quotedText || undefined,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch(`/api/agent/consultant/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('report.chatError'))

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply || data.message || t('report.chatEmptyReply'),
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: t('report.chatError') + ': ' + err.message,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setSending(false)
      setQuotedText('')
    }
  }, [sessionId, input, sending, quotedText, t])

  const handlePrint = () => {
    window.print()
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('report.loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{t('common.error')}</h2>
          <p className="text-gray-500">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            {t('report.backToHome')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col print:bg-white">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-20 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-gray-500 hover:text-gray-700 transition text-sm"
          >
            ← {t('report.backToHome')}
          </button>
          <Logo size="sm" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition"
          >
            {t('report.printPdf')}
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              chatOpen
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }`}
          >
            {chatOpen ? t('report.closeChat') : t('report.openChat')}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: iframe preview */}
        {targetUrl && (
          <div className="w-1/2 h-full border-r border-gray-200 bg-white hidden md:flex flex-col">
            <iframe
              src={targetUrl}
              title={t('report.preview')}
              className="w-full h-full"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        )}

        {/* Right: report content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div
            ref={reportRef}
            className={`flex-1 overflow-y-auto transition-all ${chatOpen ? 'mr-96' : ''}`}
            onMouseUp={handleTextSelection}
          >
            <div className="max-w-3xl mx-auto px-6 py-10 print:px-0">
              <div className="prose prose-indigo max-w-none print:prose-sm report-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      const codeString = String(children).replace(/\n$/, '')
                      if (!inline && match) {
                        return (
                          <div className="relative group my-4">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 text-gray-300 text-xs rounded-t-lg">
                              <span className="font-mono uppercase">{match[1]}</span>
                              <button
                                onClick={() => copyToClipboard(codeString)}
                                className="hover:text-white transition opacity-70 hover:opacity-100"
                                title="Copy"
                              >
                                Copy
                              </button>
                            </div>
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              className="rounded-b-lg !m-0 !text-sm"
                              {...props}
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          </div>
                        )
                      }
                      return (
                        <code className="text-gray-700 font-medium" {...props}>
                          {children}
                        </code>
                      )
                    },
                    a({ node, children, href, ...props }: any) {
                      if (href && (href.includes('youtube.com/watch') || href.includes('youtu.be/'))) {
                        return <YouTubeCard href={href}>{children}</YouTubeCard>
                      }
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                          {...props}
                        >
                          {children}
                        </a>
                      )
                    },
                    pre({ children }: any) {
                      return <>{children}</>
                    },
                  }}
                >
                  {report}
                </ReactMarkdown>
              </div>
              <style>{`
              .report-content h1 {
                font-size: 1.75rem;
                font-weight: 700;
                color: #1f2937;
                border-bottom: 2px solid #e5e7eb;
                padding-bottom: 0.5rem;
                margin-bottom: 1rem;
              }
              .report-content h2 {
                font-size: 1.25rem;
                font-weight: 600;
                color: #374151;
                margin-top: 2rem;
                margin-bottom: 0.75rem;
                border-left: 4px solid #6366f1;
                padding-left: 0.75rem;
              }
              .report-content h3 {
                font-size: 1.1rem;
                font-weight: 600;
                color: #4b5563;
                margin-top: 1.25rem;
                margin-bottom: 0.5rem;
              }
              .report-content table {
                width: 100%;
                border-collapse: collapse;
                margin: 1rem 0;
                font-size: 0.9rem;
              }
              .report-content th {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                padding: 0.5rem 0.75rem;
                text-align: left;
                font-weight: 600;
                color: #374151;
              }
              .report-content td {
                border: 1px solid #e5e7eb;
                padding: 0.5rem 0.75rem;
                color: #4b5563;
              }
              .report-content tr:nth-child(even) {
                background: #fafafa;
              }
              .report-content ul {
                margin: 0.5rem 0;
                padding-left: 1.25rem;
              }
              .report-content li {
                margin: 0.25rem 0;
                line-height: 1.6;
              }
              .report-content p {
                line-height: 1.7;
                margin: 0.5rem 0;
              }
              .report-content strong {
                color: #1f2937;
              }
              .report-content blockquote {
                border-left: 3px solid #6366f1;
                background: #f5f7ff;
                padding: 0.75rem 1rem;
                margin: 1rem 0;
                border-radius: 0 0.375rem 0.375rem 0;
                color: #4338ca;
              }
              .report-content ol {
                margin: 0.5rem 0;
                padding-left: 1.5rem;
                list-style-type: decimal;
              }
              .report-content ol li {
                margin: 0.35rem 0;
                line-height: 1.6;
                padding-left: 0.25rem;
              }
              .report-content ul li {
                margin: 0.35rem 0;
                line-height: 1.6;
              }
              .report-content li > ul,
              .report-content li > ol {
                margin: 0.25rem 0 0.25rem 0.5rem;
              }
              .report-content pre {
                margin: 1rem 0;
              }
              .report-content code {
                font-size: 0.875em;
              }
              .report-content a {
                word-break: break-all;
              }
              .report-content hr {
                border: none;
                border-top: 1px solid #e5e7eb;
                margin: 1.5rem 0;
              }
            `}</style>
          </div>
          <LikeButton pageId={`report-${sessionId}`} />
        </div>
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div className="fixed right-0 top-[57px] bottom-0 w-96 bg-white border-l border-gray-200 flex flex-col z-10 print:hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{t('report.consultantTitle')}</h3>
              <button
                onClick={() => setChatOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-8">
                  {t('report.chatEmpty')}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {m.quotedText && (
                      <div className="mb-1.5 pl-2 border-l-2 border-indigo-300 text-xs opacity-80 line-clamp-2">
                        "{m.quotedText}"
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse delay-100" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse delay-200" />
                  </div>
                </div>
              )}
            </div>

            {/* Quoted text indicator */}
            {quotedText && (
              <div className="mx-4 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-2">
                <span className="text-xs text-indigo-700 line-clamp-1 flex-1">
                  {t('report.quoting')}: "{quotedText}"
                </span>
                <button
                  onClick={() => setQuotedText('')}
                  className="text-indigo-400 hover:text-indigo-600 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={t('report.chatPlaceholder')}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition"
                >
                  {t('report.chatSend')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
