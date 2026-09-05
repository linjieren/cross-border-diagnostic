import { useTranslation } from 'react-i18next'
import { MODULE_NAME_KEYS, scoreTier, type ReportModuleInsight } from './types'

interface ScoreHeroProps {
  overallScore: number | null
  modules: ReportModuleInsight[]
  onModuleSelect?: (moduleId: string) => void
}

const RING_RADIUS = 52
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export default function ScoreHero({ overallScore, modules, onModuleSelect }: ScoreHeroProps) {
  const { t } = useTranslation()
  const tier = scoreTier(overallScore)
  const progress = overallScore == null ? 0 : Math.min(100, Math.max(0, overallScore)) / 100

  return (
    <section className="score-hero print:border-none print:shadow-none">
      <div className={`score-hero-ring score-tier--${tier}`}>
        <svg viewBox="0 0 120 120" className="score-hero-ring-svg" aria-hidden="true">
          <circle className="score-hero-ring-track" cx="60" cy="60" r={RING_RADIUS} />
          <circle
            className="score-hero-ring-value"
            cx="60"
            cy="60"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="score-hero-ring-label">
          <span className="score-hero-ring-number">
            {overallScore ?? '–'}
          </span>
          <span className="score-hero-ring-caption">{t('report.scoreHero.title')}</span>
        </div>
      </div>

      {modules.length > 0 && (
        <div className="score-hero-modules">
          <p className="score-hero-modules-title">{t('report.scoreHero.moduleScores')}</p>
          {modules.map((module) => {
            const moduleTier = scoreTier(module.score)
            const nameKey = MODULE_NAME_KEYS[module.module]
            const name = nameKey ? t(nameKey) : module.module
            const width = module.score == null ? 0 : Math.min(100, Math.max(0, module.score))
            return (
              <button
                key={module.module}
                type="button"
                className="score-hero-module"
                onClick={() => onModuleSelect?.(module.module)}
              >
                <span className="score-hero-module-name">{name}</span>
                <span className="score-hero-module-bar" aria-hidden="true">
                  <span
                    className={`score-hero-module-bar-fill score-tier-fill--${moduleTier}`}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className={`score-hero-module-score score-tier-text--${moduleTier}`}>
                  {module.score ?? '–'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
