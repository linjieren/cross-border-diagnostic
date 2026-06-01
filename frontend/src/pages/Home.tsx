import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../components/Logo'

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
        throw new Error(data.error || t('home.errorCreateSession'))
      }
      const session = await res.json()
      navigate(`/thinking/${session.sessionId}`)
    } catch (err: any) {
      setError(err.message || t('home.errorNetwork'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-3">
            <Logo size="lg" />
          </div>
          <p className="text-gray-500">{t('home.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('home.urlLabel')}</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('home.urlPlaceholder')}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('home.marketLabel')}</label>
            <select
              value={targetMarket}
              onChange={(e) => setTargetMarket(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-white"
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
            <div className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-lg transition"
          >
            {loading ? t('common.loading') : t('home.startButton')}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t('home.platformsNote')}
        </p>
      </div>
    </div>
  )
}
