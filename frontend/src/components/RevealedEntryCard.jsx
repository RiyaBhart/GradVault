import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../context/api'
import YouTubePlayer from './YouTubePlayer'
import GraduationCap from './GraduationCap'
import GlassPanel from './GlassPanel'

/**
 * RevealedEntryCard
 * Renders an entry whose BOTH gates have already passed (site date + user unlock).
 *
 * Props:
 *   entry          — EntryMetadata object (from the timeline)
 *   members        — array of MemberResponse (for author info)
 *   playAnimation  — bool: true only if THIS entry was just unlocked in this session.
 *                    If false the content renders statically (e.g. on page refresh).
 */
export default function RevealedEntryCard({ entry, members, playAnimation }) {
  // content shape:
  //   { type: 'letter', text, theme, song }
  //   { type: 'photo',  blobUrl, notes }
  //   { type: 'video',  blobUrl, notes }
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [songError, setSongError] = useState(false)
  // animState: 'playing' → animation running | 'done' → static reveal
  const [animState, setAnimState] = useState(playAnimation ? 'playing' : 'done')

  const blobUrlRef = useRef(null) // track blob URL for cleanup

  const author = members.find(m => m.user_id === entry.author_id)
  const authorName = author ? author.nickname : `User #${entry.author_id}`
  const authorSticker = author ? author.avatar_sticker : '👤'
  const formattedDate = new Date(entry.created_at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const formattedDate2 = new Date(entry.created_at).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Timer-based animation completion: more reliable than onAnimationEnd with child animations.
  // Letter total: envelope (1.6s) + fade-out (0.5s) + content appear (0.5s) ≈ 2.1s
  // Photo/Video:  polaroid develop (1.8s) + overlay dissolve (1.8s) ≈ 1.9s
  useEffect(() => {
    if (animState !== 'playing') return
    const isMedia = entry.entry_type === 'photo' || entry.entry_type === 'video'
    const duration = isMedia ? 2000 : 2200
    const timer = setTimeout(() => setAnimState('done'), duration)
    return () => clearTimeout(timer)
  }, [animState, entry.entry_type])

  // Fetch the real content from the gated endpoint
  useEffect(() => {
    let cancelled = false

    async function fetchContent() {
      try {
        const response = await apiFetch(`/entries/${entry.id}/content`)
        const contentType = response.headers.get('Content-Type') || ''
        // Read notes from the X-Entry-Notes response header (set by backend after both gates pass)
        const notes = response.headers.get('X-Entry-Notes') || ''

        if (contentType.startsWith('image/')) {
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          blobUrlRef.current = url
          if (!cancelled) setContent({ type: 'photo', blobUrl: url, notes })

        } else if (contentType.startsWith('video/')) {
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          blobUrlRef.current = url
          if (!cancelled) setContent({ type: 'video', blobUrl: url, notes })

        } else {
          const data = await response.json()
          if (!cancelled) setContent({ type: 'letter', text: data.text_content, theme: data.theme, song: data.song })
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load content.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchContent()
    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  }, [entry.id])

  // Entry type display label
  const entryTypeLabel = {
    letter: '✉️ Letter',
    photo: '📸 Photo',
    video: '📹 Video',
  }[entry.entry_type] ?? `📄 ${entry.entry_type}`

  return (
    <GlassPanel variant="solid" className="revealed-entry-card">
      {/* Card header — identical to LockedEntryCard */}
      <div className="entry-header">
        <div className="author-info">
          <span className="author-sticker">{authorSticker}</span>
          <div className="author-text">
            <span className="author-nickname">{authorName}</span>
          </div>
        </div>
        <div className="entry-tags">
          <span className="entry-unlocked-badge">🔓 Unlocked</span>
          <span className="entry-type-tag">{entryTypeLabel}</span>
        </div>
      </div>

      {/* Body */}
      <div className="revealed-entry-body">
        {loading && (
          <div className="reveal-loading">
            <span className="reveal-spinner"><GraduationCap /></span>
            <p>Unsealing...</p>
          </div>
        )}

        {error && (
          <div className="reveal-error">
            <p>⚠️ {error}</p>
          </div>
        )}

        {!loading && !error && content && (
          <>
            {/* ── Letter ─────────────────────────────────────────────────── */}
            {content.type === 'letter' && (
              <div className={`letter-reveal ${animState === 'playing' ? 'anim-envelope-open' : ''}`}>
                {animState === 'playing' && (
                  <div className="envelope-wrapper" aria-hidden="true">
                    <div className="envelope-body">
                      <div className="envelope-flap" />
                      <div className="envelope-face" />
                    </div>
                    <div className="letter-slide">
                      <div className="letter-paper-preview" />
                    </div>
                  </div>
                )}
                <div className={`letter-content-reveal ${animState === 'playing' ? 'content-hidden' : 'content-visible'}`}>
                  <div className={`letter-paper theme-${content.theme || 'classic'}`}>
                    <div className="letter-date-stamp">{formattedDate2}</div>
                    <p className="letter-text">{content.text}</p>
                    {songError && (
                      <p className="song-unavailable-note">
                        🎵 <em>original song unavailable</em>
                      </p>
                    )}
                  </div>
                  {content.song && animState === 'done' && (
                    <YouTubePlayer
                      videoId={content.song.youtube_video_id}
                      startSeconds={content.song.start_seconds}
                      volume={content.song.volume}
                      onErrorOccurred={() => setSongError(true)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── Photo ──────────────────────────────────────────────────── */}
            {content.type === 'photo' && (
              <div className={`photo-reveal ${animState === 'playing' ? 'anim-polaroid-develop' : ''}`}>
                <div className="polaroid-frame">
                  <div className="polaroid-image-wrapper">
                    <img
                      src={content.blobUrl}
                      alt={`Photo by ${authorName}`}
                      className="polaroid-image"
                    />
                    {animState === 'playing' && (
                      <div className="polaroid-overlay" aria-hidden="true" />
                    )}
                  </div>
                  <div className="polaroid-caption">{formattedDate2}</div>
                  {/* Notes caption — gated, only available after unlock */}
                  {content.notes && (
                    <p className="media-caption">💬 {content.notes}</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Video ──────────────────────────────────────────────────── */}
            {content.type === 'video' && (
              <div className={`photo-reveal ${animState === 'playing' ? 'anim-polaroid-develop' : ''}`}>
                <div className="polaroid-frame">
                  <div className="polaroid-image-wrapper polaroid-video-wrapper">
                    <video
                      src={content.blobUrl}
                      controls
                      className="polaroid-video"
                      preload="metadata"
                    />
                    {animState === 'playing' && (
                      <div className="polaroid-overlay" aria-hidden="true" />
                    )}
                  </div>
                  <div className="polaroid-caption">{formattedDate2}</div>
                  {/* Notes caption — gated, only available after unlock */}
                  {content.notes && (
                    <p className="media-caption">💬 {content.notes}</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="entry-footer">
        <span className="entry-date">{formattedDate}</span>
      </div>
    </GlassPanel>
  )
}
