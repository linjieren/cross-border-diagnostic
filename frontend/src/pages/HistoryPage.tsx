import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAuth } from '../context/AuthContext'

interface HistoryItem {
  sessionId: string
  targetUrl: string
  targetMarket: string
  createdAt: string
  status: string
  overallScore: number | null
  pagesCount: number
  modulesSummary: Array<{
    module: string
    status: string
    score: number | null
  }>
  type?: 'legacy' | 'agent'
  reportSummary?: string
}

interface HistoryResponse {
  items: HistoryItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface HistoryGroup {
  url: string
  items: HistoryItem[]
}

const MODULE_ORDER = [
  'global_acceleration',
  'lead_page_check',
  'product_content_audit',
  'form_tracking',
]

const PAGE_SIZE = 50

function getScoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400'
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

function getScoreBg(score: number | null): string {
  if (score == null) return 'bg-gray-100'
  if (score >= 80) return 'bg-green-50'
  if (score >= 60) return 'bg-yellow-50'
  return 'bg-red-50'
}

function getScoreBorder(score: number | null): string {
  if (score == null) return 'border-gray-200'
  if (score >= 80) return 'border-green-200'
  if (score >= 60) return 'border-yellow-200'
  return 'border-red-200'
}

function getScoreLabel(t: (key: string) => string, score: number | null): string {
  if (score == null) return '-'
  if (score >= 80) return t('history.scoreExcellent')
  if (score >= 60) return t('history.scoreGood')
  return t('history.scoreNeedsImprovement')
}

function getStatusBadge(t: (key: string) => string, status: string): { label: string; className: string } {
  switch (status) {
    case 'completed':
      return { label: t('diagnosis.statusCompleted'), className: 'gm-chip gm-chip--success' }
    case 'in_progress':
      return { label: t('diagnosis.statusAnalyzing'), className: 'gm-chip gm-chip--info' }
    case 'failed':
      return { label: t('diagnosis.statusFailed'), className: 'gm-chip gm-chip--danger' }
    default:
      return { label: status, className: 'gm-chip gm-chip--neutral' }
  }
}

function getModuleName(t: (key: string) => string, module: string): string {
  const map: Record<string, string> = {
    global_acceleration: t('diagnosis.moduleGlobalAcceleration'),
    lead_page_check: t('diagnosis.moduleLeadPage'),
    product_content_audit: t('diagnosis.moduleProductContent'),
    form_tracking: t('diagnosis.moduleFormTracking'),
  }
  return map[module] || module
}

function getTypeBadge(t: (key: string) => string, type?: string): { label: string; className: string } {
  switch (type) {
    case 'agent':
      return { label: t('history.typeAgent'), className: 'gm-chip gm-chip--info' }
    case 'legacy':
      return { label: t('history.typeLegacy'), className: 'gm-chip gm-chip--neutral' }
    default:
      return { label: t('history.typeLegacy'), className: 'gm-chip gm-chip--neutral' }
  }
}

function scoreDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null
  return current - previous
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-xs text-gray-300">-</span>
  if (delta > 0) return <span className="gm-trend gm-trend--up">↑ +{delta}</span>
  if (delta < 0) return <span className="gm-trend gm-trend--down">↓ {delta}</span>
  return <span className="gm-trend gm-trend--flat">→ 0</span>
}

function getModuleScores(item: HistoryItem): Map<string, number> {
  const acc = new Map<string, { sum: number; count: number }>()
  for (const m of item.modulesSummary) {
    if (m.score == null) continue
    const entry = acc.get(m.module) || { sum: 0, count: 0 }
    entry.sum += m.score
    entry.count += 1
    acc.set(m.module, entry)
  }
  const out = new Map<string, number>()
  acc.forEach((v, k) => out.set(k, Math.round(v.sum / v.count)))
  return out
}

function SkeletonCard() {
  return (
    <div className="gm-history-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-48 rounded gm-skeleton" />
            <div className="h-5 w-16 rounded-full gm-skeleton" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-4 w-32 rounded gm-skeleton" />
            <div className="h-4 w-40 rounded gm-skeleton" />
          </div>
          <div className="h-4 w-24 rounded gm-skeleton" />
        </div>
        <div className="shrink-0 w-16 h-16 rounded-xl gm-skeleton" />
      </div>
    </div>
  )
}

function CompareModal({
  group,
  onClose,
  t,
  i18n,
}: {
  group: HistoryGroup
  onClose: () => void
  t: TFunction
  i18n: { language: string }
}) {
  const scored = group.items.filter((i) => i.overallScore != null)
  const [currentId, setCurrentId] = useState(scored[0]?.sessionId)
  const [baselineId, setBaselineId] = useState(scored[1]?.sessionId ?? scored[0]?.sessionId)

  const current = scored.find((s) => s.sessionId === currentId)
  const baseline = scored.find((s) => s.sessionId === baselineId)

  const currentModules = current ? getModuleScores(current) : new Map<string, number>()
  const baselineModules = baseline ? getModuleScores(baseline) : new Map<string, number>()

  const moduleKeys = Array.from(new Set([...baselineModules.keys(), ...currentModules.keys()])).sort(
    (a, b) => {
      const ia = MODULE_ORDER.indexOf(a)
      const ib = MODULE_ORDER.indexOf(b)
      return (ia === -1 ? MODULE_ORDER.length : ia) - (ib === -1 ? MODULE_ORDER.length : ib)
    }
  )

  function formatSessionLabel(item: HistoryItem): string {
    return `${new Date(item.createdAt).toLocaleString(i18n.language)} · ${item.overallScore ?? '-'}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="gm-modal-backdrop" onClick={onClose} />
      <div className="gm-modal max-w-xl w-full max-h-[85vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('history.compareTitle')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="text-sm text-gray-500 truncate">{group.url}</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {t('history.compareBaseline')}
              </label>
              <select
                value={baselineId}
                onChange={(e) => setBaselineId(e.target.value)}
                className="gm-compare-select"
              >
                {scored.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {formatSessionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {t('history.compareCurrent')}
              </label>
              <select
                value={currentId}
                onChange={(e) => setCurrentId(e.target.value)}
                className="gm-compare-select"
              >
                {scored.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {formatSessionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <table className="gm-compare-table">
            <thead>
              <tr>
                <th></th>
                <th>{t('history.compareBaseline')}</th>
                <th>{t('history.compareCurrent')}</th>
                <th>{t('history.compareDelta')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium text-gray-900">{t('history.compareOverall')}</td>
                <td className={`font-bold ${getScoreColor(baseline?.overallScore ?? null)}`}>
                  {baseline?.overallScore ?? '-'}
                </td>
                <td className={`font-bold ${getScoreColor(current?.overallScore ?? null)}`}>
                  {current?.overallScore ?? '-'}
                </td>
                <td>
                  <DeltaBadge
                    delta={scoreDelta(current?.overallScore ?? null, baseline?.overallScore ?? null)}
                  />
                </td>
              </tr>
              {moduleKeys.map((key) => {
                const b = baselineModules.get(key) ?? null
                const c = currentModules.get(key) ?? null
                return (
                  <tr key={key}>
                    <td className="text-gray-600">{getModuleName(t, key)}</td>
                    <td className={getScoreColor(b)}>{b ?? '-'}</td>
                    <td className={getScoreColor(c)}>{c ?? '-'}</td>
                    <td>
                      <DeltaBadge delta={scoreDelta(c, b)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const { isLoggedIn, isLoading } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [pagination, setPagination] = useState<HistoryResponse['pagination'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const { t, i18n } = useTranslation()

  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<HistoryItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [compareGroup, setCompareGroup] = useState<HistoryGroup | null>(null)
  const [retestLoading, setRetestLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchHistory = useCallback(
    async (page = 1, append = false) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      try {
        const res = await fetch(`/api/diagnostic/history?page=${page}&limit=${PAGE_SIZE}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || t('history.fetchError'))
        }
        const resData: HistoryResponse = await res.json()
        setItems((prev) => {
          if (!append) return resData.items
          const known = new Set(prev.map((i) => i.sessionId))
          return [...prev, ...resData.items.filter((i) => !known.has(i.sessionId))]
        })
        setPagination(resData.pagination)
        setError('')
      } catch (err: any) {
        setError(err.message || t('common.error'))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [t]
  )

  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      navigate('/')
      return
    }
    fetchHistory()
  }, [isLoggedIn, isLoading, navigate, fetchHistory])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const groups = useMemo<HistoryGroup[]>(() => {
    const map = new Map<string, HistoryItem[]>()
    for (const item of items) {
      const list = map.get(item.targetUrl)
      if (list) list.push(item)
      else map.set(item.targetUrl, [item])
    }
    return Array.from(map.entries()).map(([url, groupItems]) => ({
      url,
      items: [...groupItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    }))
  }, [items])

  async function handleDelete(item: HistoryItem) {
    setDeleteLoading(item.sessionId)
    try {
      const res = await fetch(`/api/diagnostic/session/${item.sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('history.deleteFailed'))
      }
      setToast({ message: t('history.deleteSuccess'), type: 'success' })
      setDeleteItem(null)
      await fetchHistory(1)
    } catch (err: any) {
      setToast({ message: err.message || t('history.deleteFailed'), type: 'error' })
    } finally {
      setDeleteLoading(null)
    }
  }

  async function handleRetest(item: HistoryItem) {
    setRetestLoading(item.sessionId)
    try {
      const res = await fetch('/api/agent/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: item.targetUrl,
          targetMarket: item.targetMarket,
          language: i18n.language,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('history.retestFailed'))
      }
      const session = await res.json()
      navigate(`/thinking/${session.sessionId}`)
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error && err.message ? err.message : t('history.retestFailed'),
        type: 'error',
      })
    } finally {
      setRetestLoading(null)
    }
  }

  if (isLoading || loading) {
    return (
      <div className="gm-history-shell">
        <div className="max-w-4xl mx-auto">
          <div className="gm-history-header">
            <div className="h-7 w-24 rounded gm-skeleton" />
            <div className="h-5 w-20 rounded gm-skeleton" />
          </div>
          <div className="gm-history-grid">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="gm-shell min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={() => fetchHistory()}
            className="gm-btn gm-btn-primary"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="gm-shell min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(66,133,244,0.1)' }}>
            <svg className="w-10 h-10 text-[#4285F4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('history.emptyTitle')}</h2>
          <p className="text-gray-500 mb-8">{t('history.emptyDesc')}</p>
          <Link
            to="/"
            className="gm-btn gm-btn-primary"
          >
            {t('history.emptyCta')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="gm-history-shell">
      <div className="max-w-4xl mx-auto">
        <div className="gm-history-header">
          <h1 className="text-xl font-bold text-gray-900">{t('history.title')}</h1>
          <span className="gm-meta-copy">{t('history.total', { total: pagination?.total || 0 })}</span>
        </div>

        <div className="gm-history-grid">
          {groups.map((group) => {
            const latest = group.items[0]
            const previous = group.items[1]
            const groupDelta = scoreDelta(latest?.overallScore ?? null, previous?.overallScore ?? null)
            const scoredCount = group.items.filter((i) => i.overallScore != null).length

            return (
              <div key={group.url} className="gm-history-card overflow-hidden">
                {/* Group header */}
                <div className="gm-history-group-header">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{group.url}</div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                      <span>
                        {t('history.targetMarket')}
                        {t(`market.${latest.targetMarket}`) || latest.targetMarket}
                      </span>
                      <span>{t('history.groupDiagnosisCount', { count: group.items.length })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {groupDelta != null && (
                      <div className="flex flex-col items-center gap-0.5">
                        <DeltaBadge delta={groupDelta} />
                        <span className="text-[10px] text-gray-400">{t('history.vsPrevious')}</span>
                      </div>
                    )}
                    <div
                      className={`gm-score-card w-14! h-14! ${
                        latest.overallScore == null
                          ? 'gm-score-card--empty'
                          : latest.overallScore >= 80
                            ? 'gm-score-card--good'
                            : latest.overallScore >= 60
                              ? 'gm-score-card--warn'
                              : 'gm-score-card--bad'
                      }`}
                    >
                      <span className={`text-base font-bold ${getScoreColor(latest.overallScore)}`}>
                        {latest.overallScore ?? '-'}
                      </span>
                      <span className="text-[10px] text-gray-400">/100</span>
                    </div>
                    {scoredCount >= 2 && (
                      <button
                        onClick={() => setCompareGroup(group)}
                        className="gm-btn gm-btn-tonal text-sm !py-1.5 !px-3"
                      >
                        {t('history.compare')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sessions */}
                <div className="gm-history-group-body">
                  {group.items.map((item, idx) => {
                    const statusBadge = getStatusBadge(t, item.status)
                    const typeBadge = getTypeBadge(t, item.type)
                    const older = group.items[idx + 1]
                    const itemDelta = scoreDelta(item.overallScore, older?.overallScore ?? null)
                    const isAgent = item.type === 'agent'

                    return (
                      <div key={item.sessionId} className="gm-history-session">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <button
                                onClick={() => setDetailItem(item)}
                                className="text-sm font-medium text-gray-700 hover:text-[#4285F4] transition"
                              >
                                {new Date(item.createdAt).toLocaleString(i18n.language)}
                              </button>
                              <span className={`shrink-0 ${statusBadge.className}`}>
                                {statusBadge.label}
                              </span>
                              <span className={`shrink-0 ${typeBadge.className}`}>
                                {typeBadge.label}
                              </span>
                            </div>
                            {!isAgent && item.pagesCount > 0 && (
                              <div className="text-xs text-gray-400">
                                {t('history.pagesDetected')}: {item.pagesCount}
                              </div>
                            )}
                            {isAgent && item.reportSummary && (
                              <div className="text-xs text-gray-500 line-clamp-2">
                                {item.reportSummary}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <DeltaBadge delta={itemDelta} />
                            <span className={`text-lg font-bold ${getScoreColor(item.overallScore)}`}>
                              {item.overallScore ?? '-'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <Link to={`/report/${item.sessionId}`} className="gm-link text-sm">
                            {t('deepResearch.viewFullReport')} →
                          </Link>
                          <button
                            onClick={() => setDetailItem(item)}
                            className="text-sm text-gray-500 hover:text-gray-700 transition"
                          >
                            {t('history.detailTitle')}
                          </button>
                          <button
                            onClick={() => handleRetest(item)}
                            disabled={retestLoading === item.sessionId}
                            className="text-sm text-[#4285F4] hover:text-[#3367d6] transition disabled:opacity-50"
                          >
                            {retestLoading === item.sessionId ? '...' : t('history.retest')}
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            disabled={deleteLoading === item.sessionId}
                            className="text-sm text-red-500 hover:text-red-700 transition ml-auto disabled:opacity-50"
                          >
                            {deleteLoading === item.sessionId ? '...' : t('history.delete')}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {pagination && pagination.page < pagination.totalPages && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => fetchHistory(pagination.page + 1, true)}
              disabled={loadingMore}
              className="gm-btn gm-btn-secondary"
            >
              {loadingMore ? t('common.loading') : t('history.loadMore')}
            </button>
          </div>
        )}
      </div>

      {/* Compare Modal */}
      {compareGroup && (
        <CompareModal
          group={compareGroup}
          onClose={() => setCompareGroup(null)}
          t={t}
          i18n={i18n}
        />
      )}

      {/* Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="gm-modal-backdrop" onClick={() => setDetailItem(null)} />
          <div className="gm-modal max-w-lg w-full max-h-[80vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t('history.detailTitle')}</h3>
              <button
                onClick={() => setDetailItem(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500">{detailItem.targetUrl}</div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{t('history.targetMarket')}{t(`market.${detailItem.targetMarket}`) || detailItem.targetMarket}</span>
                <span>{t('history.diagnosisTime')}{new Date(detailItem.createdAt).toLocaleString(i18n.language)}</span>
              </div>

              {/* Type badge */}
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(t, detailItem.type).className}`}>
                  {getTypeBadge(t, detailItem.type).label}
                </span>
              </div>

              {/* Report summary for agent */}
              {detailItem.type === 'agent' && detailItem.reportSummary && (
                <div className="pt-2">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">{t('history.reportSummary')}</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{detailItem.reportSummary}</p>
                </div>
              )}

              {/* Modules grid for legacy */}
              {detailItem.type !== 'agent' && detailItem.modulesSummary.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">{t('history.detailModules')}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from(new Map(detailItem.modulesSummary.map((m) => [m.module, m])).entries()).map(
                      ([module, m]) => {
                        const modScoreColor = getScoreColor(m.score)
                        const modScoreBg = getScoreBg(m.score)
                        const modScoreLabel = getScoreLabel(t, m.score)
                        const modName = getModuleName(t, module)
                        return (
                          <div
                            key={module}
                            className={`rounded-lg border ${getScoreBorder(m.score)} ${modScoreBg} p-3`}
                          >
                            <div className="text-xs text-gray-500 mb-1">{modName}</div>
                            <div className="flex items-baseline gap-1">
                              <span className={`text-xl font-bold ${modScoreColor}`}>
                                {m.score ?? '-'}
                              </span>
                              {m.score != null && <span className="text-xs text-gray-400">/100</span>}
                            </div>
                            {m.score != null && (
                              <div className={`text-xs font-medium mt-1 ${modScoreColor}`}>{modScoreLabel}</div>
                            )}
                          </div>
                        )
                      }
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Link
                  to={`/report/${detailItem.sessionId}`}
                  onClick={() => setDetailItem(null)}
                  className="gm-btn gm-btn-primary w-full"
                >
                  {t('deepResearch.viewFullReport')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="gm-modal-backdrop" onClick={() => setDeleteItem(null)} />
          <div className="gm-modal max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('history.deleteConfirmTitle')}</h3>
              <p className="text-sm text-gray-500 mb-6">{t('history.deleteConfirmDesc')}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDeleteItem(null)}
                  className="gm-btn gm-btn-secondary flex-1"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleDelete(deleteItem)}
                  disabled={deleteLoading === deleteItem.sessionId}
                  className="gm-btn gm-btn-danger flex-1"
                >
                  {deleteLoading === deleteItem.sessionId ? '...' : t('history.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`gm-toast transition ${
              toast.type === 'success' ? 'gm-toast--success' : 'gm-toast--danger'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}
