import { useTranslation } from 'react-i18next'

interface LogoProps {
  variant?: 'default' | 'light' | 'mono'
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

export default function Logo({ variant = 'default', size = 'md', showText = true }: LogoProps) {
  const { t } = useTranslation()
  const isLight = variant === 'light'
  const isMono = variant === 'mono'

  const color = isLight ? '#FFFFFF' : isMono ? '#3C4043' : '#1a73e8'
  const textColor = isLight ? '#FFFFFF' : isMono ? '#3C4043' : '#202124'

  const sizeMap = {
    sm: { icon: 24, text: 16, gap: 8 },
    md: { icon: 32, text: 20, gap: 10 },
    lg: { icon: 40, text: 26, gap: 12 },
  }
  const s = sizeMap[size]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }}>
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer circle */}
        <circle cx="24" cy="24" r="20" stroke={color} strokeWidth="3" fill="none" />
        {/* Horizontal arc */}
        <ellipse cx="24" cy="24" rx="20" ry="8" stroke={color} strokeWidth="2" fill="none" />
        {/* Vertical arc */}
        <ellipse cx="24" cy="24" rx="8" ry="20" stroke={color} strokeWidth="2" fill="none" />
        {/* Arrow crossing */}
        <path
          d="M12 24 L36 24 M28 18 L36 24 L28 30"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {showText && (
        <span
          style={{
            fontSize: s.text,
            fontWeight: 700,
            color: textColor,
            letterSpacing: -0.5,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {t('report.platformName')}
        </span>
      )}
    </div>
  )
}
