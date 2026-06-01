import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
      return { label: t('diagnosis.statusCompleted'), className: 'bg-green-100 text-green-700' }
    case 'in_progress':
      return { label: t('diagnosis.statusAnalyzing'), className: 'bg-blue-100 text-blue-700' }
    case 'failed':
      return { label: t('diagnosis.statusFailed'), className: 'bg-red-100 text-red-700' }
    default:
      return { label: status, className: 'bg-gray-100 text-gray-700' }
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
      return { label: t('history.typeAgent'), className: 'bg-purple-100 text-purple-700' }
    case 'legacy':
      return { label: t('history.typeLegacy'), className: 'bg-gray-100 text-gray-600' }
    default:
      return { label: t('history.typeLegacy'), className: 'bg-gray-100 text-gray-600' }
  }
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-48 bg-gray-200 rounded" />
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-40 bg-gray-200 rounded" />
          </div>
          <div className="h-4 w-24 bg-gray-200 rounded" />
        </div>
        <div className="shrink-0 w-16 h-16 bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const { isLoggedIn, isLoading } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { t, i18n } = useTranslation()

  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<HistoryItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchHistory = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/diagnostic/history?page=${page}`, { credentials: 'include' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || t('history.fetchError'))
        }
        const resData: HistoryResponse = await res.json()
        setData(resData)
        setError('')
      } catch (err: any) {
        setError(err.message || t('common.error'))
      } finally {
        setLoading(false)
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
      await fetchHistory(data?.pagination.page || 1)
    } catch (err: any) {
      setToast({ message: err.message || t('history.deleteFailed'), type: 'error' })
    } finally {
      setDeleteLoading(null)
    }
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="h-7 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={() => fetchHistory()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  const items = data?.items || []

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('history.emptyTitle')}</h2>
          <p className="text-gray-500 mb-8">{t('history.emptyDesc')}</p>
          <Link
            to="/"
            className="inline-block px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            {t('history.emptyCta')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t('history.title')}</h1>
          <span className="text-sm text-gray-500">{t('history.total', { total: data?.pagination.total || 0 })}</span>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const statusBadge = getStatusBadge(t, item.status)
            const typeBadge = getTypeBadge(t, item.type)
            const scoreColor = getScoreColor(item.overallScore)
            const scoreBg = getScoreBg(item.overallScore)
            const scoreBorder = getScoreBorder(item.overallScore)
            const scoreLabel = getScoreLabel(t, item.overallScore)

            const moduleStatusMap = new Map<string, string>()
            item.modulesSummary.forEach((m) => {
              const existing = moduleStatusMap.get(m.module)
              if (!existing || existing !== 'completed') {
                moduleStatusMap.set(m.module, m.status)
              }
            })
            const completedModules = Array.from(moduleStatusMap.values()).filter((s) => s === 'completed').length
            const totalModules = moduleStatusMap.size || 4

            const isAgent = item.type === 'agent'

            return (
              <div
                key={item.sessionId}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <button
                        onClick={() => setDetailItem(item)}
                        className="font-medium text-gray-900 truncate hover:text-indigo-600 transition text-left"
                      >
                        {item.targetUrl}
                      </button>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.className}`}>
                        {statusBadge.label}
                      </span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge.className}`}>
                        {typeBadge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                      <span>{t('history.targetMarket')}{t(`market.${item.targetMarket}`) || item.targetMarket}</span>
                      <span>{t('history.diagnosisTime')}{new Date(item.createdAt).toLocaleString(i18n.language)}</span>
                      {!isAgent && item.pagesCount > 0 && (
                        <span>{t('history.pagesDetected')}: {item.pagesCount}</span>
                      )}
                    </div>

                    {/* Legacy: module completion */}
                    {!isAgent && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                        <span>{t('history.modulesCompleted', { completed: completedModules, total: totalModules })}</span>
                      </div>
                    )}

                    {/* Agent: report summary */}
                    {isAgent && item.reportSummary && (
                      <div className="mt-2 text-xs text-gray-500 line-clamp-2">
                        <span className="font-medium text-gray-600">{t('history.reportSummary')}:</span>{' '}
                        {item.reportSummary}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className={`shrink-0 w-16 h-16 rounded-xl ${scoreBg} ${scoreBorder} border-2 flex flex-col items-center justify-center`}>
                      <span className={`text-lg font-bold ${scoreColor}`}>{item.overallScore ?? '-'}</span>
                      <span className="text-[10px] text-gray-400">/100</span>
                    </div>
                    {item.overallScore != null && (
                      <span className={`text-xs font-medium ${scoreColor}`}>{scoreLabel}</span>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-3">
                  <Link
                    to={`/report/${item.sessionId}`}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition"
                  >
                    {t('deepResearch.viewFullReport')} →
                  </Link>
                  <button
                    onClick={() => setDetailItem(item)}
                    className="text-sm text-gray-500 hover:text-gray-700 transition"
                  >
                    {t('history.detailTitle')}
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

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => fetchHistory(page)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                  page === data.pagination.page
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailItem(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto">
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
                  className="block w-full text-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteItem(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
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
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleDelete(deleteItem)}
                  disabled={deleteLoading === deleteItem.sessionId}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
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
            className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition ${
              toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}
