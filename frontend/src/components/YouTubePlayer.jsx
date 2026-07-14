import { useEffect, useRef, useState } from 'react'

let apiLoaded = false
let apiCallbacks = []

function loadYoutubeAPI(callback) {
  if (window.YT && window.YT.Player) {
    callback()
    return
  }
  apiCallbacks.push(callback)
  if (apiLoaded) return
  apiLoaded = true

  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  const firstScriptTag = document.getElementsByTagName('script')[0]
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)

  window.onYouTubeIframeAPIReady = () => {
    apiCallbacks.forEach((cb) => cb())
    apiCallbacks = []
  }
}

export default function YouTubePlayer({ videoId, startSeconds = 0, volume = 100, onErrorOccurred }) {
  const playerRef = useRef(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    let active = true

    loadYoutubeAPI(() => {
      if (!active) return

      const elementId = `yt-player-${videoId}`
      if (playerRef.current) return

      try {
        playerRef.current = new window.YT.Player(elementId, {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            start: startSeconds,
            autoplay: 1,
            controls: 1,
            disablekb: 0,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: (event) => {
              if (!active) return
              setPlayerReady(true)
              event.target.setVolume(volume)
              
              // Standard browsers require user interaction to play audio.
              // Since the user just clicked "unlock" or interacted with the card,
              // playVideo() should succeed.
              event.target.playVideo()
            },
            onStateChange: (event) => {
              if (!active) return
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true)
              } else if (
                event.data === window.YT.PlayerState.PAUSED ||
                event.data === window.YT.PlayerState.ENDED
              ) {
                setIsPlaying(false)
              }
            },
            onError: (event) => {
              if (!active) return
              console.error('YouTube Player Error:', event.data)
              setHasError(true)
              if (onErrorOccurred) {
                onErrorOccurred()
              }
            },
          },
        })
      } catch (err) {
        console.error('Failed to initialize YouTube player:', err)
        setHasError(true)
        if (onErrorOccurred) {
          onErrorOccurred()
        }
      }
    })

    return () => {
      active = false
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [videoId, startSeconds, volume, onErrorOccurred])

  if (hasError) {
    return null
  }

  return (
    <div className={`yt-player-container ${isPlaying ? 'playing' : ''}`}>
      <div className="yt-player-badge">
        <span className="music-icon">🎵</span>
      </div>
      <div className="yt-player-iframe-wrapper">
        <div id={`yt-player-${videoId}`} style={{ width: '100%', height: '100%' }}></div>
      </div>
    </div>
  )
}
