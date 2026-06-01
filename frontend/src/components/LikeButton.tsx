import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface LikeButtonProps {
  pageId: string
}

export default function LikeButton({ pageId }: LikeButtonProps) {
  const storageKey = `liked-${pageId}`
  const [liked, setLiked] = useState(false)
  const [animating, setAnimating] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === '1') setLiked(true)
    } catch {}
  }, [storageKey])

  const handleClick = () => {
    const next = !liked
    setLiked(next)
    setAnimating(true)
    setTimeout(() => setAnimating(false), 400)
    try {
      localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {}
  }

  return (
    <button
      onClick={handleClick}
      title={liked ? t('like.liked') : t('like.like')}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: 'none',
        background: liked
          ? 'linear-gradient(135deg, #EA4335 0%, #ff6b6b 100%)'
          : '#fff',
        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
        cursor: 'pointer',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.2s, box-shadow 0.2s',
        transform: animating ? 'scale(1.25)' : 'scale(1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = animating ? 'scale(1.25)' : 'scale(1)'
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)'
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={liked ? '#fff' : 'none'}
        stroke={liked ? '#fff' : '#EA4335'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transition: 'all 0.2s',
          filter: liked ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' : 'none',
        }}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  )
}
