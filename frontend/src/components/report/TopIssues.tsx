import { useTranslation } from 'react-i18next'
import { MODULE_NAME_KEYS, type ReportIssue } from './types'

interface TopIssuesProps {
  issues: ReportIssue[]
  onIssueSelect?: (issue: ReportIssue) => void
}

export default function TopIssues({ issues, onIssueSelect }: TopIssuesProps) {
  const { t } = useTranslation()
  if (!issues.length) return null

  return (
    <section className="top-issues">
      <h2 className="top-issues-title">{t('report.topIssuesThisWeek')}</h2>
      <div className="top-issues-list">
        {issues.map((issue, index) => {
          const nameKey = MODULE_NAME_KEYS[issue.module]
          const moduleName = nameKey ? t(nameKey) : issue.module
          return (
            <button
              key={`${issue.module}-${issue.check}-${index}`}
              type="button"
              className="top-issues-item"
              onClick={() => onIssueSelect?.(issue)}
            >
              <span className={`issue-dot issue-dot--${issue.status}`} aria-hidden="true" />
              <span className="top-issues-item-title">{issue.check}</span>
              <span className={`top-issues-item-severity issue-severity-text--${issue.status}`}>
                {t(`report.issueSeverity.${issue.status}`)}
              </span>
              <span className="top-issues-item-module">{moduleName}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
