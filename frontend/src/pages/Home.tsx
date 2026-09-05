import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../components/Logo'

function toApiErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return toErrorMessage(value, fallback)

  const record = value as Record<string, unknown>
  const error = typeof record.error === 'string' ? record.error.trim() : ''
  const detail = typeof record.detail === 'string' ? record.detail.trim() : ''
  const message = typeof record.message === 'string' ? record.message.trim() : ''

  if (error && detail) return `${error} - ${detail}`
  if (error) return error
  if (message && detail) return `${message} - ${detail}`
  if (message) return message
  if (detail) return detail

  return fallback
}

function toErrorMessage(value: unknown, fallback: string): string {
  if (!value) return fallback
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message || fallback

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['error', 'message', 'detail']) {
      const nested = record[key]
      if (typeof nested === 'string' && nested.trim()) return nested
    }
  }

  return fallback
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [targetMarket, setTargetMarket] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const markets = [
    { value: 'us', label: t('market.us') },
    { value: 'eu', label: t('market.eu') },
    { value: 'uk', label: t('market.uk') },
    { value: 'jp', label: t('market.jp') },
    { value: 'kr', label: t('market.kr') },
    { value: 'sea', label: t('market.sea') },
    { value: 'au', label: t('market.au') },
    { value: 'ca', label: t('market.ca') },
    { value: 'br', label: t('market.br') },
    { value: 'mx', label: t('market.mx') },
    { value: 'in', label: t('market.in') },
    { value: 'mea', label: t('market.mea') },
  ]

  function normalizeUrl(input: string): string {
    let u = input.trim()
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u
    }
    return u
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!url.trim()) {
      setError(t('home.errorNoUrl'))
      return
    }
    if (!targetMarket) {
      setError(t('home.errorNoMarket'))
      return
    }

    const normalized = normalizeUrl(url)
    try {
      new URL(normalized)
    } catch {
      setError(t('home.errorInvalidUrl'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/agent/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized, targetMarket, language: i18n.language }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(toApiErrorMessage(data, t('home.errorCreateSession')))
      }
      const session = await res.json()
      navigate(`/thinking/${session.sessionId}`)
    } catch (err: any) {
      setError(toErrorMessage(err, t('home.errorNetwork')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="gm-shell flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-3">
            <Logo size="lg" />
          </div>
          <p className="gm-body-copy">{t('home.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="gm-panel p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">{t('home.urlLabel')}</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('home.urlPlaceholder')}
              className="gm-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('home.marketLabel')}</label>
            <select
              value={targetMarket}
              onChange={(e) => setTargetMarket(e.target.value)}
              className="gm-input"
            >
              <option value="">{t('home.marketPlaceholder')}</option>
              {markets.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div
              className="text-sm px-4 py-2"
              style={{
                color: '#b3261e',
                background: 'rgba(234, 67, 53, 0.08)',
                borderRadius: 'var(--gm-radius-sm)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="gm-btn gm-btn-primary w-full"
          >
            {loading ? t('common.loading') : t('home.startButton')}
          </button>
        </form>

        <p className="gm-meta-copy text-center mt-6">
          {t('home.platformsNote')}
        </p>
      </div>
    </div>
  )
}
