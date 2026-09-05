import { useTranslation } from 'react-i18next'
import { MODULE_NAME_KEYS, type ReportIssue } from './types'

interface IssueCardProps {
  issue: ReportIssue
  onAskConsultant?: (issue: ReportIssue) => void
}

export default function IssueCard({ issue, onAskConsultant }: IssueCardProps) {
  const { t } = useTranslation()
  const nameKey = MODULE_NAME_KEYS[issue.module]
  const moduleName = nameKey ? t(nameKey) : issue.module

  return (
    <article className={`issue-card issue-card--${issue.status}`}>
      <div className="issue-card-header">
        <span className={`issue-card-badge issue-card-badge--${issue.status}`}>
          {t(`report.issueSeverity.${issue.status}`)}
        </span>
        <span className="issue-card-title">{issue.check}</span>
        <span className="issue-card-module">{moduleName}</span>
      </div>
      {issue.detail && (
        <p className="issue-card-body">
          <span className="issue-card-label">{t('report.issueCard.problemLabel')}</span>
          {issue.detail}
        </p>
      )}
      {issue.evidence && (
        <p className="issue-card-evidence">
          <span className="issue-card-label">{t('report.issueCard.evidenceLabel')}</span>
          {issue.evidence}
        </p>
      )}
      {onAskConsultant && (
        <div className="issue-card-actions">
          <button
            type="button"
            className="gm-link issue-card-action"
            onClick={() => onAskConsultant(issue)}
          >
            {t('report.issueCard.askConsultant')} →
          </button>
        </div>
      )}
    </article>
  )
}
