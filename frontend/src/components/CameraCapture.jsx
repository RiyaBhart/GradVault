import { useState, useEffect, useRef, useCallback } from 'react'
import { apiCall } from '../context/api'
import LockPicker from './LockPicker'

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_RECORDING_SECONDS = 45          // named constant — auto-stops at this limit
const COUNTDOWN_WARNING_SECONDS = 10     // show red countdown in last N seconds
const MAX_PHOTO_BYTES = 8 * 1024 * 1024   // 8 MB — must match backend MAX_PHOTO_SIZE
const MAX_VIDEO_BYTES = 50 * 1024 * 1024  // 50 MB — must match backend MAX_VIDEO_SIZE
const EMOJI_STICKERS = ['💖', '✨', '🌟', '🌸', '🔥', '👑', '🎉', '💡']

/** Return the best supported MediaRecorder MIME type for this browser. */
function getBestVideoMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return 'video/webm' // last resort
}

/** Format seconds as MM:SS */
function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function CameraCapture({ threadId, onPost }) {
  // ── Camera stream state ────────────────────────────────────────────────────
  const [stream, setStream] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' | 'environment'
  const [videoInputCount, setVideoInputCount] = useState(2)   // assume ≥2 until enumerated
  const [cameraError, setCameraError] = useState('')
  const [cameraReady, setCameraReady] = useState(false)

  // ── Capture mode ───────────────────────────────────────────────────────────
  const [captureMode, setCaptureMode] = useState('photo') // 'photo' | 'video'

  // ── Photo state ────────────────────────────────────────────────────────────
  const [capturedBlob, setCapturedBlob] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [placedStickers, setPlacedStickers] = useState([])

  // ── Video recording state ─────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [videoBlob, setVideoBlob] = useState(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null)

  // ── Shared post-capture state ──────────────────────────────────────────────
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [galleryError, setGalleryError] = useState('')

  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const lockPickerRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordingChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const galleryInputRef = useRef(null)

  // ─── Enumerate devices on mount to detect camera count ──────────────────
  useEffect(() => {
    async function countCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setVideoInputCount(videoInputs.length)
      } catch {
        setVideoInputCount(1) // safe fallback — hide flip button
      }
    }
    if (navigator.mediaDevices?.enumerateDevices) {
      countCameras()
    }
  }, [])

  // ─── Start/stop camera stream ────────────────────────────────────────────
  const hasPreview = capturedBlob !== null || videoBlob !== null

  useEffect(() => {
    if (hasPreview) return // preview mode — no stream needed

    let activeStream = null

    async function startCamera() {
      setCameraError('')
      setCameraReady(false)
      try {
        const constraints = {
          video: {
            facingMode,
            width: { ideal: 720 },
            height: { ideal: 720 },
            aspectRatio: { ideal: 1 },
          },
          audio: captureMode === 'video',
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
        activeStream = mediaStream
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
        setCameraReady(true)
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCameraError('Camera access denied. If on iOS/Safari, please go to Settings > Safari > Camera and set it to "Ask" or "Allow".')
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setCameraError('No camera device detected.')
        } else {
          setCameraError(`Camera error: ${err.message || 'Unable to open camera.'}`)
        }
      }
    }

    startCamera()
    return () => {
      if (activeStream) activeStream.getTracks().forEach(t => t.stop())
    }
  }, [facingMode, hasPreview, captureMode])

  // ─── Cleanup blob URLs ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    }
  }, [videoPreviewUrl])

  // ─── Cleanup recording timer on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    }
  }, [])

  // ─── Camera flip ────────────────────────────────────────────────────────
  function toggleCamera() {
    if (isRecording) return // don't flip while recording
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  // ─── Capture mode switch ─────────────────────────────────────────────────
  function switchCaptureMode(mode) {
    if (isRecording) stopRecording()
    setCaptureMode(mode)
  }

  // ─── Photo capture ────────────────────────────────────────────────────────
  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current || !stream) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const width = video.videoWidth
    const height = video.videoHeight
    canvas.width = width
    canvas.height = height

    if (facingMode === 'user') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, width, height)

    stream.getTracks().forEach(t => t.stop())
    setStream(null)
    setCameraReady(false)

    canvas.toBlob(blob => {
      if (blob) {
        setCapturedBlob(blob)
        setPreviewUrl(URL.createObjectURL(blob))
      }
    }, 'image/jpeg', 0.9)
  }

  // ─── Video recording ──────────────────────────────────────────────────────
  function startRecording() {
    if (!stream) return
    recordingChunksRef.current = []
    const mimeType = getBestVideoMime()

    try {
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          recordingChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: mimeType })
        setVideoBlob(blob)
        setVideoPreviewUrl(URL.createObjectURL(blob))
        setIsRecording(false)
        setRecordingSeconds(0)
        clearInterval(recordingTimerRef.current)
        // Stop camera tracks
        stream.getTracks().forEach(t => t.stop())
        setStream(null)
        setCameraReady(false)
      }

      recorder.start(250) // collect chunks every 250ms
      setIsRecording(true)
      setRecordingSeconds(0)

      // Auto-stop at limit
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          const next = prev + 1
          if (next >= MAX_RECORDING_SECONDS) {
            stopRecording()
          }
          return next
        })
      }, 1000)
    } catch (err) {
      setCameraError(`Recording failed: ${err.message}`)
    }
  }

  function stopRecording() {
    clearInterval(recordingTimerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  // ─── Retake ───────────────────────────────────────────────────────────────
  function handleRetake() {
    setCapturedBlob(null)
    setPreviewUrl(null)
    setVideoBlob(null)
    setVideoPreviewUrl(null)
    setPlacedStickers([])
    setNotes('')
    setUploadError('')
    setGalleryError('')
  }

  // ─── Gallery upload ───────────────────────────────────────────────────────
  function handleGalleryClick() {
    setGalleryError('')
    galleryInputRef.current?.click()
  }

  function handleGalleryChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ''

    setGalleryError('')

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      setGalleryError('Unsupported file type. Please choose an image or video.')
      return
    }

    if (isImage && file.size > MAX_PHOTO_BYTES) {
      setGalleryError(`Image is too large. Maximum size is ${MAX_PHOTO_BYTES / 1024 / 1024}MB.`)
      return
    }
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      setGalleryError(`Video is too large. Maximum size is ${MAX_VIDEO_BYTES / 1024 / 1024}MB.`)
      return
    }

    // Stop any live stream
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
      setCameraReady(false)
    }

    const url = URL.createObjectURL(file)
    if (isImage) {
      setCapturedBlob(file)
      setPreviewUrl(url)
      setVideoBlob(null)
      setVideoPreviewUrl(null)
      setCaptureMode('photo')
    } else {
      setVideoBlob(file)
      setVideoPreviewUrl(url)
      setCapturedBlob(null)
      setPreviewUrl(null)
      setCaptureMode('video')
    }
  }

  // ─── Confirm & upload ─────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!capturedBlob && !videoBlob) return

    if (lockPickerRef.current && !lockPickerRef.current.isValid()) {
      setUploadError('Please complete the lock fields or choose "No Lock".')
      return
    }

    setUploading(true)
    setUploadError('')

    try {
      const lock = lockPickerRef.current?.getLockPayload() ?? null
      const formData = new FormData()

      if (capturedBlob) {
        // ── Photo path ────────────────────────────────────────────────────
        // Composite image + stickers onto offscreen canvas
        const offCanvas = document.createElement('canvas')
        offCanvas.width = 720
        offCanvas.height = 720
        const ctx = offCanvas.getContext('2d')

        const img = new Image()
        img.src = previewUrl
        await new Promise(resolve => { img.onload = resolve })
        ctx.drawImage(img, 0, 0, 720, 720)

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        placedStickers.forEach(st => {
          ctx.font = `${st.size}px Arial`
          ctx.shadowColor = 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = 10
          ctx.fillText(st.emoji, st.x, st.y)
        })

        const finalBlob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/jpeg', 0.9))
        formData.append('file', finalBlob, 'photo.jpg')
        if (notes.trim()) formData.append('notes', notes.trim())
        if (lock) {
          formData.append('lock_type', lock.lock_type)
          if (lock.passcode) formData.append('lock_passcode', lock.passcode)
          if (lock.riddle_question) formData.append('lock_riddle_question', lock.riddle_question)
          if (lock.riddle_answer) formData.append('lock_riddle_answer', lock.riddle_answer)
        }
        await apiCall(`/threads/${threadId}/entries/photo`, { method: 'POST', body: formData })

      } else {
        // ── Video path ────────────────────────────────────────────────────
        const ext = videoBlob.type.includes('mp4') ? '.mp4' : '.webm'
        formData.append('file', videoBlob, `video${ext}`)
        if (notes.trim()) formData.append('notes', notes.trim())
        if (lock) {
          formData.append('lock_type', lock.lock_type)
          if (lock.passcode) formData.append('lock_passcode', lock.passcode)
          if (lock.riddle_question) formData.append('lock_riddle_question', lock.riddle_question)
          if (lock.riddle_answer) formData.append('lock_riddle_answer', lock.riddle_answer)
        }
        await apiCall(`/threads/${threadId}/entries/video`, { method: 'POST', body: formData })
      }

      // Reset all state
      setCapturedBlob(null)
      setPreviewUrl(null)
      setVideoBlob(null)
      setVideoPreviewUrl(null)
      setPlacedStickers([])
      setNotes('')
      if (onPost) onPost()

    } catch (err) {
      setUploadError(err.message || 'Failed to upload entry.')
    } finally {
      setUploading(false)
    }
  }

  // ─── Derived flags ────────────────────────────────────────────────────────
  const inPreview = capturedBlob !== null
  const inVideoPreview = videoBlob !== null
  const showFlip = videoInputCount > 1 && !inPreview && !inVideoPreview
  const remainingSeconds = MAX_RECORDING_SECONDS - recordingSeconds
  const showCountdownWarning = isRecording && remainingSeconds <= COUNTDOWN_WARNING_SECONDS

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="camera-capture-container">
      <h3>Drop a New Memory</h3>
      <p className="composer-tip">
        Capture a live photo or video, or pick from your gallery — stored securely locked.
      </p>

      {/* Hidden gallery file input */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleGalleryChange}
      />

      {/* Gallery error */}
      {galleryError && (
        <div className="capture-error-banner">
          <span>⚠️</span>
          <p>{galleryError}</p>
          <button className="btn-ghost" onClick={() => setGalleryError('')}>✕</button>
        </div>
      )}

      {/* Camera error */}
      {cameraError && !inPreview && !inVideoPreview && (
        <div className="camera-error-banner">
          <span>⚠️</span>
          <p>{cameraError}</p>
          <button
            className="btn-secondary btn-retry"
            onClick={() => { setCameraError(''); setFacingMode(prev => prev) }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="capture-error-banner">
          <span>⚠️</span>
          <p>{uploadError}</p>
        </div>
      )}

      {/* Hidden canvas for photo compositing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── Capture mode switcher (only when not in preview) ──────────────── */}
      {!inPreview && !inVideoPreview && (
        <div className="capture-mode-toggle">
          <button
            className={`mode-btn ${captureMode === 'photo' ? 'active' : ''}`}
            onClick={() => switchCaptureMode('photo')}
          >
            📸 Photo
          </button>
          <button
            className={`mode-btn ${captureMode === 'video' ? 'active' : ''}`}
            onClick={() => switchCaptureMode('video')}
          >
            🎥 Video
          </button>
        </div>
      )}

      {/* ── Viewfinder ───────────────────────────────────────────────────── */}
      <div className="camera-viewfinder-wrapper">
        {inPreview ? (
          /* Photo preview + sticker overlay */
          <div className="viewfinder preview-mode" style={{ position: 'relative' }}>
            <img src={previewUrl} alt="Captured preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {placedStickers.map((st, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${(st.x / 720) * 100}%`,
                top: `${(st.y / 720) * 100}%`,
                fontSize: `${(st.size / 720) * 100}cqw`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                lineHeight: 1,
              }}>
                {st.emoji}
              </div>
            ))}
          </div>
        ) : inVideoPreview ? (
          /* Video preview */
          <div className="viewfinder preview-mode">
            <video
              src={videoPreviewUrl}
              controls
              className="video-preview"
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
            />
          </div>
        ) : (
          /* Live camera feed */
          <div className="viewfinder">
            {stream ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={facingMode === 'user' ? 'mirror-feed' : ''}
                />
                {/* Recording indicator overlay */}
                {isRecording && (
                  <div className="recording-indicator">
                    <span className="recording-dot" />
                    <span className={`recording-timer ${showCountdownWarning ? 'countdown-warning' : ''}`}>
                      {showCountdownWarning
                        ? `${remainingSeconds}s`
                        : formatTime(recordingSeconds)}
                    </span>
                    <span className="recording-label">REC</span>
                  </div>
                )}
              </>
            ) : (
              <div className="viewfinder-placeholder">
                <span className="camera-spinner">📸</span>
                <p>Initializing lens...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action controls ───────────────────────────────────────────────── */}
      <div className="camera-actions-panel">
        {!inPreview && !inVideoPreview ? (
          <div className="stream-controls">
            {/* Flip — hidden if only 1 camera */}
            {showFlip ? (
              <button
                className="btn-circle btn-camera-toggle"
                onClick={toggleCamera}
                disabled={!cameraReady || isRecording}
                title="Switch Camera"
              >
                🔄
              </button>
            ) : (
              <div className="spacer-control" />
            )}

            {/* Main action button */}
            {captureMode === 'photo' ? (
              <button
                className="btn-shutter"
                onClick={capturePhoto}
                disabled={!cameraReady}
                title="Capture Photo"
              >
                <div className="shutter-inner" />
              </button>
            ) : isRecording ? (
              <button
                className="btn-record btn-record-stop"
                onClick={stopRecording}
                title="Stop Recording"
              >
                <div className="record-stop-icon" />
              </button>
            ) : (
              <button
                className="btn-record"
                onClick={startRecording}
                disabled={!cameraReady}
                title={`Record Video (max ${MAX_RECORDING_SECONDS}s)`}
              >
                <div className="record-dot" />
              </button>
            )}

            {/* Gallery button */}
            <button
              className="btn-circle btn-gallery"
              onClick={handleGalleryClick}
              disabled={isRecording}
              title="Choose from Gallery"
            >
              🖼️
            </button>
          </div>
        ) : (
          <div className="confirm-controls">
            <button
              className="btn-secondary"
              onClick={handleRetake}
              disabled={uploading}
            >
              ↩️ Retake
            </button>
            <button
              className="btn-primary btn-confirm-upload"
              onClick={handleConfirm}
              disabled={uploading}
            >
              {uploading ? 'Locking...' : '🔒 Confirm & Lock'}
            </button>
          </div>
        )}
      </div>

      {/* ── Sticker picker (photo preview only) ──────────────────────────── */}
      {inPreview && (
        <div className="sticker-picker">
          <span className="sticker-picker-title">Add Stickers</span>
          <div className="sticker-options">
            {EMOJI_STICKERS.map(emoji => (
              <button
                key={emoji}
                type="button"
                className="sticker-btn"
                onClick={() => {
                  const x = Math.floor(Math.random() * (720 - 150)) + 75
                  const y = Math.floor(Math.random() * (720 - 150)) + 75
                  setPlacedStickers(prev => [...prev, { emoji, x, y, size: 100 }])
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          {placedStickers.length > 0 && (
            <button type="button" className="btn-secondary btn-clear-stickers" onClick={() => setPlacedStickers([])}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Notes / caption field (shown after capture) ───────────────────── */}
      {(inPreview || inVideoPreview) && (
        <div className="notes-field">
          <label htmlFor="entry-notes" className="notes-label">
            💬 Add a note about this moment…
          </label>
          <textarea
            id="entry-notes"
            className="notes-textarea"
            placeholder="Optional caption or memory (max 500 chars)"
            maxLength={500}
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <span className="notes-char-count">{notes.length}/500</span>
        </div>
      )}

      {/* ── Lock picker (shown after capture) ─────────────────────────────── */}
      {(inPreview || inVideoPreview) && (
        <LockPicker ref={lockPickerRef} />
      )}
    </div>
  )
}
