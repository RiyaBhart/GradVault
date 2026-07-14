import { useState, useImperativeHandle, forwardRef } from 'react'

const SongPicker = forwardRef(function SongPicker(_, ref) {
  const [urlInput, setUrlInput] = useState('')
  const [videoId, setVideoId] = useState(null)
  const [error, setError] = useState('')

  function extractVideoId(url) {
    const trimmed = url.trim()
    if (!trimmed) return null
    // Match exactly the same logic as backend
    if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
      return trimmed
    }
    const match = trimmed.match(/(?:v=|\/v\/|embed\/|shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    return match ? match[1] : null
  }

  function handleInputChange(val) {
    setUrlInput(val)
    if (!val.trim()) {
      setVideoId(null)
      setError('')
      return
    }
    const vid = extractVideoId(val)
    if (vid) {
      setVideoId(vid)
      setError('')
    } else {
      setVideoId(null)
      setError("Doesn't look like a valid YouTube link.")
    }
  }

  useImperativeHandle(ref, () => ({
    getYouTubeUrl() {
      return urlInput.trim() ? urlInput.trim() : null
    },
    isValid() {
      if (!urlInput.trim()) return true
      return !!extractVideoId(urlInput)
    },
    reset() {
      setUrlInput('')
      setVideoId(null)
      setError('')
    }
  }))

  return (
    <div className="song-picker">
      <div className="song-picker-header">
        <span className="song-picker-icon">🎵</span>
        <span className="song-picker-title">
          Attach a YouTube Song <span className="optional-tag">optional</span>
        </span>
      </div>

      <div className="song-picker-body">
        <input
          type="text"
          className="song-input"
          placeholder="Paste YouTube video link (e.g. https://youtube.com/watch?v=...)"
          value={urlInput}
          onChange={(e) => handleInputChange(e.target.value)}
        />
        
        {error && <p className="song-error-hint">{error}</p>}

        {videoId && (
          <div className="song-preview-box">
            <div className="song-preview-thumb-wrapper">
              <img
                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                alt="YouTube Video Preview"
                className="song-preview-thumb"
              />
              <div className="play-overlay">▶</div>
            </div>
            <div className="song-preview-info">
              <p className="song-preview-title">Video reference detected</p>
              <p className="song-preview-id">ID: {videoId}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

export default SongPicker
