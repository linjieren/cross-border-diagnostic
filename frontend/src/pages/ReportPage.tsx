import { useEffect, useState, useRef, useCallback, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Logo from '../components/Logo'

/* ---------- helpers ---------- */

function extractYouTubeID(href: string): string | null {
  const m = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

function buildYouTubeSearchUrl(title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} tutorial`)}`
}

interface YouTubeCardMetadata {
  videoId: string
  watchUrl: string
  title: string
  channelName: string
  channelAvatarUrl?: string
  thumbnailUrl: string
  duration?: string
}

interface CachedReportPayload {
  reportMarkdown: string
  url?: string
  savedAt: string
}

function getReportCacheKey(sessionId: string) {
  return `diagnostic-report:${sessionId}`
}

function loadCachedReport(sessionId: string): CachedReportPayload | null {
  try {
    const raw = window.localStorage.getItem(getReportCacheKey(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedReportPayload>
    if (typeof parsed.reportMarkdown !== 'string' || !parsed.reportMarkdown.trim()) return null
    return {
      reportMarkdown: parsed.reportMarkdown,
      url: typeof parsed.url === 'string' ? parsed.url : '',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    }
  } catch {
    return null
  }
}

function saveCachedReport(sessionId: string, payload: CachedReportPayload) {
  try {
    window.localStorage.setItem(getReportCacheKey(sessionId), JSON.stringify(payload))
  } catch {
    // Ignore localStorage failures so report rendering still works in strict/private contexts.
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

const REPORT_META_HEADING = '诊断日期 / 目标市场 / 产品类型 / 综合评分'
const REPORT_ROADMAP_HEADING = '30/60/90 天路线图'

function toBrandName(value: string): string {
  const cleaned = value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split('?')[0]
    .trim()
  const rawName = (cleaned.includes('.') ? cleaned.split('.')[0] : cleaned) || cleaned
  return rawName
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function getLegacyReportTitleBrand(text: string): string | null {
  const match = text.match(/^跨境出海诊断报告\s*[·•\-–—:：]\s*(.+)$/)
  if (!match?.[1]) return null
  return toBrandName(match[1])
}

function normalizeReportTitleBlock(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const heading = getHeadingText(line)
      if (heading?.level !== 1) return line
      const brandName = getLegacyReportTitleBrand(heading.text)
      return brandName ? `# ${brandName} 跨境出海诊断报告` : line
    })
    .join('\n')
}

function getHeadingText(line: string): { level: number; text: string } | null {
  const heading = line.match(/^(#{1,6})\s+(.+)$/)
  if (!heading) return null
  return {
    level: heading[1].length,
    text: heading[2].trim(),
  }
}

function sanitizeReportBody(markdown: string): { body: string; metaLine: string } {
  const lines = markdown.split('\n')
  const bodyLines: string[] = []
  const metaLines: string[] = []
  let capturingMeta = false
  let metaFound = false

  for (const line of lines) {
    const heading = getHeadingText(line)

    if (capturingMeta) {
      if (heading) {
        capturingMeta = false
        bodyLines.push(line)
        continue
      }

      if (line.trim() === '') {
        if (metaLines.length) {
          capturingMeta = false
          metaFound = true
        }
        continue
      }

      metaLines.push(line.trim())
      continue
    }

    if (getLegacyReportTitleBrand(heading?.text || '')) {
      continue
    }

    if (heading?.text === REPORT_META_HEADING && heading.level === 2) {
      capturingMeta = true
      continue
    }

    bodyLines.push(line)
  }

  const metaLine = metaLines.join(' ').replace(/\s+/g, ' ').trim()
  const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  return {
    body,
    metaLine: metaFound ? metaLine : '',
  }
}

function flattenText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return flattenText((node as any).props?.children)
  }
  return ''
}

async function copyPlainText(text: string) {
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

function getCodeLanguage(children: ReactNode): string {
  const firstChild = Array.isArray(children) ? children[0] : children
  const props = firstChild && typeof firstChild === 'object' && 'props' in firstChild
    ? (firstChild as any).props
    : {}
  const className = props?.className || ''
  const language = props?.['data-language'] || /language-(\w+)/.exec(className)?.[1]
  return language || 'code'
}

function ChatCodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const language = getCodeLanguage(children)
  const codeString = flattenText(children).replace(/\n$/, '')

  const handleCopy = async () => {
    await copyPlainText(codeString)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="report-chat-codeblock-shell">
      <div className="report-chat-codeblock-toolbar">
        <div className="report-chat-codeblock-language">
          <span>{language}</span>
          <span aria-hidden="true" className="report-chat-codeblock-caret" />
        </div>
        <button
          type="button"
          className="report-chat-codeblock-copy"
          onClick={handleCopy}
          aria-label="Copy code"
          title="Copy code"
        >
          <span aria-hidden="true" className="report-chat-copy-icon">
            <span />
            <span />
          </span>
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="report-chat-codeblock">{children}</pre>
    </div>
  )
}

function splitReportMarkdown(markdown: string): { title: string; toc: string; body: string; metaLine: string } {
  const normalized = normalizeReportTitleBlock(markdown.trim())
  const tocMarker = '\n## 目录\n'
  const tocIndex = normalized.indexOf(tocMarker)

  const generateToc = (body: string): string => {
    const lines = body.split('\n')
    const tocLines: string[] = ['## 目录']
    let currentSection = ''
    let hasEntries = false

    for (const line of lines) {
      const heading = getHeadingText(line)
      if (!heading) continue

      if (heading.level === 2) {
        currentSection = heading.text

        if (
          heading.text === '目录' ||
          getLegacyReportTitleBrand(heading.text) ||
          heading.text === REPORT_META_HEADING
        ) {
          continue
        }

        hasEntries = true
        tocLines.push(`- [${heading.text}](#${slugify(heading.text)})`)
        continue
      }

      if (heading.level === 3) {
        if (currentSection === REPORT_ROADMAP_HEADING) {
          continue
        }

        hasEntries = true
        tocLines.push(`  - [${heading.text}](#${slugify(heading.text)})`)
      }
    }

    return hasEntries ? tocLines.join('\n') : ''
  }

  const sanitizeBody = (rawBody: string): { body: string; metaLine: string } => {
    const cleaned = sanitizeReportBody(rawBody)
    return cleaned
  }

  if (tocIndex === -1) {
    const firstSectionIndex = normalized.indexOf('\n## ')
    if (firstSectionIndex === -1) {
      return { title: normalized, toc: '', body: '', metaLine: '' }
    }

    const title = normalized.slice(0, firstSectionIndex).trim()
    const body = normalized.slice(firstSectionIndex + 1).trim()
    const cleaned = sanitizeBody(body)
    return { title, toc: generateToc(cleaned.body), body: cleaned.body, metaLine: cleaned.metaLine }
  }

  const title = normalized.slice(0, tocIndex).trim()
  const tocAndBody = normalized.slice(tocIndex + 1)
  const nextSectionIndex = tocAndBody.indexOf('\n## ', 1)

  if (nextSectionIndex === -1) {
    const cleaned = sanitizeBody('')
    return { title, toc: tocAndBody.trim(), body: cleaned.body, metaLine: cleaned.metaLine }
  }

  const body = tocAndBody.slice(nextSectionIndex + 1).trim()
  const cleaned = sanitizeBody(body)
  return { title, toc: generateToc(cleaned.body), body: cleaned.body, metaLine: cleaned.metaLine }
}

function normalizeReportMarkdown(markdown: string): string {
  return markdown
    .replace(/📺\s*视频教程[:：]?\s*/g, '参考视频：')
    .replace(/-\s*YouTube:\s*\[([^\]]+)\]\(([^)]+)\)/g, '- [$1]($2)')
    .replace(/(^|\n)YouTube:\s*\n/g, '$1')
    .replace(/✅\s*通过/g, '通过')
    .replace(/❌\s*未通过/g, '未通过')
    .replace(/⚠️\s*需优化/g, '需优化')
    .replace(/⚠\s*需优化/g, '需优化')
}

function YouTubeCard({ href, children }: { href: string; children: ReactNode }) {
  const id = extractYouTubeID(href)
  const titleText = flattenText(children).trim() || 'YouTube Video'
  const searchHref = buildYouTubeSearchUrl(titleText)
  const [metadata, setMetadata] = useState<YouTubeCardMetadata | null>(null)
  const [metadataFailed, setMetadataFailed] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const fallbackThumb = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
  const displayTitle = metadata?.title || titleText
  const displayHref = metadata?.watchUrl || (metadataFailed ? searchHref : (id ? href : searchHref))
  const thumbnailUrl = metadata?.thumbnailUrl || fallbackThumb
  const channelName = metadata?.channelName || 'YouTube'
  const channelInitial = channelName.trim().slice(0, 1).toUpperCase() || 'Y'

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ url: href, title: titleText })

    setMetadataFailed(false)
    fetch(`/api/agent/youtube/metadata?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('metadata unavailable')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setMetadata(data)
          setMetadataFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMetadata(null)
          setMetadataFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [href, titleText])

  return (
    <a
      href={displayHref}
      target="_blank"
      rel="noopener noreferrer"
      className="report-video-card block my-5 transition"
    >
      <div className="report-video-panel">
        {!thumbFailed && thumbnailUrl ? (
          <div className="report-video-thumb">
            <img
              src={thumbnailUrl}
              alt={displayTitle}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
            <div className="report-video-play">
              <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        ) : (
          <div className="report-video-thumb report-video-thumb-fallback">
            <div className="report-video-fallback-brand">YouTube</div>
            <div className="report-video-fallback-title">{displayTitle}</div>
            <div className="report-video-play">
              <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        )}
        <div className="report-video-card-body">
          <div className="report-video-title">{displayTitle}</div>
          <div className="report-video-source-row">
            <span className="report-video-avatar" aria-hidden="true">
              {metadata?.channelAvatarUrl && !avatarFailed ? (
                <img src={metadata.channelAvatarUrl} alt="" loading="lazy" onError={() => setAvatarFailed(true)} />
              ) : (
                <span>{channelInitial}</span>
              )}
            </span>
            <span className="report-video-channel">{channelName}</span>
          </div>
        </div>
        <div className="report-video-panel-footer">
          <span>{metadata?.duration || (metadataFailed ? 'Search' : 'YouTube')}</span>
          <span className="report-video-footer-action">{metadataFailed ? '在 YouTube 搜索' : '在 YouTube 查看'}</span>
          <div className="report-video-footer-play" aria-hidden="true">
            <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>
    </a>
  )
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  quotedText?: string
}

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const reportRef = useRef<HTMLDivElement>(null)
  const splitPaneRef = useRef<HTMLDivElement>(null)
  const downloadMenuRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLButtonElement>(null)
  const dragStateRef = useRef({
    pointerId: -1,
    startX: 0,
    startWidth: 50,
    pendingWidth: 50,
    frame: 0 as number | 0,
  })
  const chatDragStateRef = useRef({
    pointerId: -1,
    pendingWidth: 392,
    frame: 0 as number | 0,
  })

  const [report, setReport] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cacheNotice, setCacheNotice] = useState('')
  const [previewOpen, setPreviewOpen] = useState(() => {
    const stored = window.localStorage.getItem('report-preview-open')
    return stored === '1'
  })
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    const stored = window.localStorage.getItem('report-left-pane-width')
    const parsed = stored ? Number.parseFloat(stored) : NaN
    return Number.isFinite(parsed) ? Math.min(72, Math.max(28, parsed)) : 50
  })
  const [chatDrawerWidth, setChatDrawerWidth] = useState(() => {
    const stored = window.localStorage.getItem('report-chat-drawer-width')
    const parsed = stored ? Number.parseFloat(stored) : NaN
    return Number.isFinite(parsed) ? Math.min(720, Math.max(320, parsed)) : 392
  })
  const [isDraggingDivider, setIsDraggingDivider] = useState(false)
  const [isDraggingChatDivider, setIsDraggingChatDivider] = useState(false)
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false)
  const [downloadingFormat, setDownloadingFormat] = useState<'pdf' | 'html' | ''>('')

  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [quotedText, setQuotedText] = useState('')
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const reportParts = splitReportMarkdown(report)
  const quickQuestions = quotedText
    ? [
        { label: '解释这段', message: '请解释我选中的这段报告内容，重点说清楚它为什么重要。' },
        { label: '怎么修', message: '针对我选中的这段问题，请给出具体修复步骤。' },
        { label: '怎么验证', message: '针对我选中的这段内容，请告诉我修改后怎么验证是否修好。' },
      ]
    : [
        { label: '先改哪三项', message: '这份报告里我应该优先处理哪三项？请按影响和实施难度排序。' },
        { label: '怎么验证修好', message: '如果我按报告修改网站，应该怎么重新验证这些问题是否已经解决？' },
        { label: '技术执行顺序', message: '请把这份报告整理成技术侧优先执行顺序，越具体越好。' },
      ]

  // Fetch report
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setLoading(true)
    setCacheNotice('')
    fetch(`/api/agent/diagnose/${sessionId}/report`)
      .then((r) => {
        if (!r.ok) throw new Error(t('report.loadFailed'))
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setReport(normalizeReportMarkdown(data.reportMarkdown || ''))
        if (data.url) setTargetUrl(data.url)
        saveCachedReport(sessionId, {
          reportMarkdown: data.reportMarkdown || '',
          url: data.url || '',
          savedAt: new Date().toISOString(),
        })
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        const cached = loadCachedReport(sessionId)
        if (cached) {
          setReport(normalizeReportMarkdown(cached.reportMarkdown))
          if (cached.url) setTargetUrl(cached.url)
          setError('')
          setCacheNotice('当前正在显示本机缓存的报告快照。后端恢复后刷新页面即可同步最新版本。')
          setLoading(false)
          return
        }
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
        const rows = Array.isArray(data.history)
          ? data.history
          : Array.isArray(data.messages)
            ? data.messages
            : []
        if (rows.length) {
          setMessages(rows)
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

  useEffect(() => {
    if (!isDraggingDivider && !isDraggingChatDivider) return
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDraggingDivider, isDraggingChatDivider])

  useEffect(() => {
    window.localStorage.setItem('report-left-pane-width', String(leftPaneWidth))
  }, [leftPaneWidth])

  useEffect(() => {
    window.localStorage.setItem('report-chat-drawer-width', String(chatDrawerWidth))
  }, [chatDrawerWidth])

  useEffect(() => {
    window.localStorage.setItem('report-preview-open', previewOpen ? '1' : '0')
  }, [previewOpen])

  useEffect(() => {
    if (!isDownloadMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!downloadMenuRef.current?.contains(event.target as Node)) {
        setIsDownloadMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isDownloadMenuOpen])

  // Text selection handler
  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (text.length > 5 && text.length < 500) {
      setQuotedText(text)
    }
  }, [])

  const handleReportTocClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest('a')
    const href = anchor?.getAttribute('href')
    if (!href || !href.startsWith('#')) return

    const rawId = href.slice(1)
    let targetId = rawId
    try {
      targetId = decodeURIComponent(rawId)
    } catch {
      targetId = rawId
    }

    const target =
      Array.from(reportRef.current?.querySelectorAll<HTMLElement>('[id]') || [])
        .find((node) => node.id === targetId) || null
    if (!target) return

    event.preventDefault()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', `#${encodeURIComponent(targetId)}`)
  }, [])

  // Send chat message
  const sendMessage = useCallback(async (overrideMessage?: string) => {
    const messageText = (overrideMessage || input).trim()
    if (!sessionId || !messageText || sending) return
    const body: Record<string, string> = { message: messageText }
    if (quotedText) body.quotedText = quotedText

    const userMsg: ChatMessage = {
      role: 'user',
      content: messageText,
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

  const downloadReportFile = useCallback(async (format: 'pdf' | 'html') => {
    if (!sessionId || downloadingFormat) return

    setDownloadingFormat(format)
    try {
      const res = await fetch(`/api/agent/diagnose/${sessionId}/report/${format}`)
      if (!res.ok) throw new Error(format === 'pdf' ? 'PDF 下载失败' : 'HTML 下载失败')

      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1]
      const fallbackTitle = flattenText(reportParts.title).trim() || 'cross-border-diagnostic-report'
      const fallbackName = `${slugify(fallbackTitle) || 'cross-border-diagnostic-report'}.${format}`
      const fileName = encodedName ? decodeURIComponent(encodedName) : (quotedName || fallbackName)

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setIsDownloadMenuOpen(false)
    } finally {
      setDownloadingFormat('')
    }
  }, [sessionId, downloadingFormat, reportParts.title])

  const handleDownloadPdf = () => {
    void downloadReportFile('pdf')
  }

  const handleDownloadHtml = () => {
    void downloadReportFile('html')
  }

  const schedulePaneWidth = (width: number) => {
    dragStateRef.current.pendingWidth = width
    if (dragStateRef.current.frame) return

    dragStateRef.current.frame = window.requestAnimationFrame(() => {
      dragStateRef.current.frame = 0
      setLeftPaneWidth(dragStateRef.current.pendingWidth)
    })
  }

  const finishDragging = useCallback(() => {
    if (dragStateRef.current.frame) {
      window.cancelAnimationFrame(dragStateRef.current.frame)
      dragStateRef.current.frame = 0
      setLeftPaneWidth(dragStateRef.current.pendingWidth)
    }
    dragStateRef.current.pointerId = -1
    setIsDraggingDivider(false)
  }, [])

  const updatePaneWidthFromClientX = useCallback((clientX: number) => {
    if (!splitPaneRef.current) return
    const rect = splitPaneRef.current.getBoundingClientRect()
    const next = ((clientX - rect.left) / rect.width) * 100
    schedulePaneWidth(Math.min(72, Math.max(28, next)))
  }, [])

  const handleDividerPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!targetUrl) return
    dragStateRef.current.pointerId = event.pointerId
    dragStateRef.current.startX = event.clientX
    dragStateRef.current.startWidth = leftPaneWidth
    dragStateRef.current.pendingWidth = leftPaneWidth
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDraggingDivider(true)
  }, [leftPaneWidth, targetUrl])

  const handleDividerPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return
    updatePaneWidthFromClientX(event.clientX)
  }, [updatePaneWidthFromClientX])

  const handleDividerPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return
    updatePaneWidthFromClientX(event.clientX)
    event.currentTarget.releasePointerCapture(event.pointerId)
    finishDragging()
  }, [finishDragging, updatePaneWidthFromClientX])

  const handleDividerLostCapture = useCallback(() => {
    if (isDraggingDivider) finishDragging()
  }, [finishDragging, isDraggingDivider])

  const clampChatDrawerWidth = useCallback((width: number) => {
    const viewportMax = Math.max(320, window.innerWidth - 520)
    return Math.min(Math.min(720, viewportMax), Math.max(320, width))
  }, [])

  const scheduleChatDrawerWidth = useCallback((width: number) => {
    chatDragStateRef.current.pendingWidth = clampChatDrawerWidth(width)
    if (chatDragStateRef.current.frame) return

    chatDragStateRef.current.frame = window.requestAnimationFrame(() => {
      chatDragStateRef.current.frame = 0
      setChatDrawerWidth(chatDragStateRef.current.pendingWidth)
    })
  }, [clampChatDrawerWidth])

  const updateChatDrawerWidthFromClientX = useCallback((clientX: number) => {
    scheduleChatDrawerWidth(window.innerWidth - clientX)
  }, [scheduleChatDrawerWidth])

  const finishChatDragging = useCallback(() => {
    if (chatDragStateRef.current.frame) {
      window.cancelAnimationFrame(chatDragStateRef.current.frame)
      chatDragStateRef.current.frame = 0
      setChatDrawerWidth(chatDragStateRef.current.pendingWidth)
    }
    chatDragStateRef.current.pointerId = -1
    setIsDraggingChatDivider(false)
  }, [])

  const handleChatDividerPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    chatDragStateRef.current.pointerId = event.pointerId
    chatDragStateRef.current.pendingWidth = chatDrawerWidth
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDraggingChatDivider(true)
  }, [chatDrawerWidth])

  const handleChatDividerPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (chatDragStateRef.current.pointerId !== event.pointerId) return
    updateChatDrawerWidthFromClientX(event.clientX)
  }, [updateChatDrawerWidthFromClientX])

  const handleChatDividerPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (chatDragStateRef.current.pointerId !== event.pointerId) return
    updateChatDrawerWidthFromClientX(event.clientX)
    event.currentTarget.releasePointerCapture(event.pointerId)
    finishChatDragging()
  }, [finishChatDragging, updateChatDrawerWidthFromClientX])

  const handleChatDividerLostCapture = useCallback(() => {
    if (isDraggingChatDivider) finishChatDragging()
  }, [finishChatDragging, isDraggingChatDivider])

  const copyToClipboard = async (text: string) => {
    await copyPlainText(text)
  }

  const markdownComponents = {
    h1({ children }: any) {
      return (
        <header className="report-hero">
          <p className="report-eyebrow">Cross-border diagnostic</p>
          <h1 id={slugify(flattenText(children))}>{children}</h1>
        </header>
      )
    },
    h2({ children }: any) {
      return <h2 id={slugify(flattenText(children))}>{children}</h2>
    },
    h3({ children }: any) {
      return <h3 id={slugify(flattenText(children))}>{children}</h3>
    },
    p({ children }: any) {
      const text = flattenText(children).trim()
      const isMetaLine =
        text.includes('诊断日期') &&
        text.includes('目标市场') &&
        text.includes('产品类型') &&
        text.includes('综合评分')

      if (isMetaLine) {
        return <p className="report-meta-bar">{children}</p>
      }

      return <p>{children}</p>
    },
    blockquote({ children }: any) {
      return <blockquote>{children}</blockquote>
    },
    ul({ children }: any) {
      return <ul>{children}</ul>
    },
    ol({ children }: any) {
      return <ol>{children}</ol>
    },
    li({ children }: any) {
      return <li>{children}</li>
    },
    table({ children }: any) {
      return (
        <div className="report-table-wrap">
          <table>{children}</table>
        </div>
      )
    },
    strong({ children }: any) {
      return <strong>{children}</strong>
    },
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
      if (href?.startsWith('#')) {
        return (
          <a href={href} className="gm-link" {...props}>
            {children}
          </a>
        )
      }

      if (href && (href.includes('youtube.com/watch') || href.includes('youtu.be/') || href.includes('youtube.com/results?search_query='))) {
        return <YouTubeCard href={href}>{children}</YouTubeCard>
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="gm-link underline underline-offset-2"
          {...props}
        >
          {children}
        </a>
      )
    },
    pre({ children }: any) {
      return <>{children}</>
    },
  }

  const chatMarkdownComponents = {
    a({ children, href, ...props }: any) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="report-chat-link"
          {...props}
        >
          {children}
        </a>
      )
    },
    pre({ children }: any) {
      return <ChatCodeBlock>{children}</ChatCodeBlock>
    },
    code({ inline, className, children, ...props }: any) {
      if (inline) {
        return (
          <code className="report-chat-inline-code" {...props}>
            {children}
          </code>
        )
      }

      const language = /language-(\w+)/.exec(className || '')?.[1]
      return (
        <code className={language ? `language-${language}` : undefined} data-language={language} {...props}>
          {children}
        </code>
      )
    },
    ul({ children }: any) {
      return <ul>{children}</ul>
    },
    ol({ children }: any) {
      return <ol>{children}</ol>
    },
    table({ children }: any) {
      return (
        <div className="report-chat-table-wrap">
          <table>{children}</table>
        </div>
      )
    },
    thead({ children }: any) {
      return <thead>{children}</thead>
    },
    tbody({ children }: any) {
      return <tbody>{children}</tbody>
    },
    tr({ children }: any) {
      return <tr>{children}</tr>
    },
    th({ children }: any) {
      return <th>{children}</th>
    },
    td({ children }: any) {
      return <td>{children}</td>
    },
  }

  if (loading) {
    return (
      <div className="gm-shell min-h-screen flex items-center justify-center">
        <div className="text-center gm-panel px-8 py-8">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'rgba(66,133,244,0.18)', borderTopColor: '#4285F4' }} />
          <p className="text-sm text-gray-500">{t('report.loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="gm-shell min-h-screen flex items-center justify-center px-4">
        <div className="gm-panel p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-gray-900 mb-2">{t('common.error')}</h2>
          <p className="text-gray-500">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="gm-btn gm-btn-primary mt-6"
          >
            {t('report.backToHome')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="gm-shell h-screen flex flex-col print:bg-white">
      {/* Top bar */}
      <header className="gm-topbar shrink-0 z-20 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="gm-link text-sm"
          >
            ← {t('report.backToHome')}
          </button>
          <Logo size="sm" />
        </div>
        <div className="flex items-center gap-2">
          {targetUrl && (
            <button
              onClick={() => setPreviewOpen((open) => !open)}
              className="gm-btn gm-btn-secondary"
            >
              {previewOpen ? '收起网站' : '查看网站'}
            </button>
          )}
          <div ref={downloadMenuRef} className="relative">
            <button
              onClick={() => setIsDownloadMenuOpen((open) => !open)}
              className="gm-btn gm-btn-secondary"
            >
              下载
              <svg className={`w-4 h-4 transition ${isDownloadMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            {isDownloadMenuOpen && (
              <div className="report-download-menu">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="report-download-option"
                  disabled={!!downloadingFormat}
                >
                  <span className="report-download-option-title">{downloadingFormat === 'pdf' ? '正在生成 PDF' : '下载 PDF'}</span>
                  <span className="report-download-option-meta">导出完整报告，不包含网站预览和页面工具栏</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  className="report-download-option"
                  disabled={!!downloadingFormat}
                >
                  <span className="report-download-option-title">{downloadingFormat === 'html' ? '正在生成 HTML' : '下载 HTML'}</span>
                  <span className="report-download-option-meta">导出同一份报告正文的独立网页文件</span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`gm-btn ${
              chatOpen
                ? 'gm-btn-primary'
                : 'gm-btn-tonal'
            }`}
          >
            {chatOpen ? t('report.closeChat') : t('report.openChat')}
          </button>
        </div>
      </header>

      <div ref={splitPaneRef} className="flex-1 flex overflow-hidden">
        {/* Left: iframe preview */}
        {targetUrl && previewOpen && (
          <div
            className="h-full border-r border-gray-200 bg-white hidden md:flex flex-col shrink-0"
            style={{ width: `${leftPaneWidth}%` }}
          >
            <iframe
              src={targetUrl}
              title={t('report.preview')}
              className="w-full h-full"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        )}

        {targetUrl && previewOpen && (
          <button
            ref={dividerRef}
            type="button"
            aria-label="Resize layout"
            onPointerDown={handleDividerPointerDown}
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerUp}
            onLostPointerCapture={handleDividerLostCapture}
            className={`hidden md:flex report-divider shrink-0 items-center justify-center ${isDraggingDivider ? 'is-dragging' : ''}`}
          >
            <span className="report-divider-handle" />
          </button>
        )}

        {/* Right: report content */}
        <div
          className="flex-1 flex flex-col h-full overflow-hidden min-w-0"
          style={targetUrl && previewOpen ? { width: `${100 - leftPaneWidth}%` } : undefined}
        >
          <div
            ref={reportRef}
            className="flex-1 overflow-y-auto transition-all report-scroll-area"
            style={chatOpen ? { marginRight: `${chatDrawerWidth}px` } : undefined}
            onMouseUp={handleTextSelection}
          >
            <div className={`${previewOpen ? 'max-w-[1180px]' : 'max-w-[1380px]'} mx-auto px-8 py-10 print:px-0`}>
              {cacheNotice && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {cacheNotice}
                </div>
              )}
              <div className="report-content report-markdown-root">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {reportParts.title}
                </ReactMarkdown>

                {reportParts.metaLine && (
                  <p className="report-meta-bar">{reportParts.metaLine}</p>
                )}

                {reportParts.toc && (
                  <section className="report-inline-toc" onClick={handleReportTocClick}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {reportParts.toc}
                    </ReactMarkdown>
                  </section>
                )}

                <div className="report-doc-main">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {reportParts.body}
                  </ReactMarkdown>
                </div>
              </div>
          </div>
        </div>
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div
            className="gm-chat-drawer print:hidden"
            style={{ width: `${chatDrawerWidth}px` }}
          >
            <button
              type="button"
              aria-label="Resize consultant chat"
              onPointerDown={handleChatDividerPointerDown}
              onPointerMove={handleChatDividerPointerMove}
              onPointerUp={handleChatDividerPointerUp}
              onLostPointerCapture={handleChatDividerLostCapture}
              className={`gm-chat-resizer ${isDraggingChatDivider ? 'is-dragging' : ''}`}
            >
              <span />
            </button>
            <div className="gm-chat-header px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{t('report.consultantTitle')}</h3>
              <button
                onClick={() => setChatOpen(false)}
                className="gm-link text-sm"
              >
                ✕
              </button>
            </div>

            <div ref={chatScrollRef} className="gm-chat-scroll">
              {messages.length === 0 && (
                <div className="text-sm py-4">
                  <div className="gm-panel-muted px-3 py-3 text-gray-600 leading-6">
                    {t('report.chatEmpty')}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickQuestions.map((question) => (
                      <button
                        key={question.label}
                        type="button"
                        onClick={() => sendMessage(question.message)}
                        className="report-chat-suggestion"
                      >
                        {question.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`gm-chat-message ${m.role === 'user' ? 'gm-chat-message--user' : 'gm-chat-message--assistant'}`}>
                  <div
                    className={`gm-chat-card ${
                      m.role === 'user'
                        ? 'gm-chat-card--user'
                        : 'gm-chat-card--assistant'
                    }`}
                  >
                    {m.quotedText && (
                      <div className="gm-quote-pill mb-1.5 line-clamp-2">
                        "{m.quotedText}"
                      </div>
                    )}
                    {m.role === 'assistant' ? (
                      <div className="report-chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="gm-chat-message gm-chat-message--assistant">
                  <div className="gm-chat-card gm-chat-card--assistant flex items-center gap-1.5 text-gray-500">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse delay-100" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse delay-200" />
                  </div>
                </div>
              )}
            </div>

            {/* Quoted text indicator */}
            {quotedText && (
              <div className="mx-4 mb-2 px-3 py-2 gm-panel-muted">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-700 line-clamp-1 flex-1">
                    {t('report.quoting')}: "{quotedText}"
                  </span>
                  <button
                    onClick={() => setQuotedText('')}
                    className="gm-link text-xs"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickQuestions.map((question) => (
                    <button
                      key={question.label}
                      type="button"
                      onClick={() => sendMessage(question.message)}
                      className="report-chat-suggestion"
                    >
                      {question.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="gm-chat-input-area p-4 border-t">
              {!quotedText && messages.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {quickQuestions.map((question) => (
                    <button
                      key={question.label}
                      type="button"
                      onClick={() => sendMessage(question.message)}
                      className="report-chat-suggestion"
                    >
                      {question.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={t('report.chatPlaceholder')}
                  className="gm-input flex-1 text-sm"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={sending || !input.trim()}
                  className="gm-btn gm-btn-primary"
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
