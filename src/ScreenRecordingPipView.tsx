import { useLayoutEffect, useRef, useState, type RefCallback } from 'react'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import type { DisplayCaptureSurfaceKind } from './displayCaptureLabel'
import './ScreenRecordingPipView.css'

/** Prototype tab title for the PiP capture ticker when the track label is not readable. */
const PIP_CAPTURE_TAB_NAME =
  "Earth's Finest Water | FIJI WATER | Actually bottled at the source and is always fresh"

const PIP_CAPTURE_THUMB_SRC = '/images/capture%20thumb.png'

function CaptureSourceTicker({
  text,
  marqueePaused = false,
}: {
  text: string
  marqueePaused?: boolean
}) {
  const viewportRef = useRef<HTMLSpanElement>(null)
  const sizerRef = useRef<HTMLSpanElement>(null)
  const [marquee, setMarquee] = useState(false)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const sizer = sizerRef.current
    if (!viewport || !sizer) return

    const update = () => {
      setMarquee(sizer.offsetWidth > viewport.clientWidth + 0.5)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [text])

  return (
    <p
      className={
        'screen-recording-pip__capture-ticker' +
        (marquee ? ' screen-recording-pip__capture-ticker--marquee' : '') +
        (marquee && marqueePaused ? ' screen-recording-pip__capture-ticker--marquee-paused' : '')
      }
      title={text}
      aria-label={`Recording source: ${text}`}
    >
      <span ref={sizerRef} className="screen-recording-pip__capture-ticker-sizer" aria-hidden>
        {text}
      </span>
      <span ref={viewportRef} className="screen-recording-pip__capture-ticker-viewport">
        {marquee ? (
          <span className="screen-recording-pip__capture-ticker-marquee">
            <span className="screen-recording-pip__capture-ticker-chunk">{text}</span>
            <span className="screen-recording-pip__capture-ticker-chunk" aria-hidden>
              {text}
            </span>
          </span>
        ) : (
          <span className="screen-recording-pip__capture-ticker-static">{text}</span>
        )}
      </span>
    </p>
  )
}

function CaptureStatusCard({
  captureStatusLine,
  tickerText,
  showCaptureThumbnail,
  marqueePaused = false,
}: {
  captureStatusLine: string
  tickerText: string
  showCaptureThumbnail: boolean
  marqueePaused?: boolean
}) {
  return (
    <div
      className={
        'screen-recording-pip__capture-card' +
        (showCaptureThumbnail ? '' : ' screen-recording-pip__capture-card--no-thumb')
      }
    >
      {showCaptureThumbnail ? (
        <img
          src={PIP_CAPTURE_THUMB_SRC}
          alt=""
          className="screen-recording-pip__capture-thumb"
          draggable={false}
        />
      ) : null}
      <div className="screen-recording-pip__capture-card-copy">
        <p className="screen-recording-pip__capture-status">{captureStatusLine}</p>
        <CaptureSourceTicker text={tickerText} marqueePaused={marqueePaused} />
      </div>
    </div>
  )
}

export type ScreenRecordingPipViewProps = {
  showAvatar: boolean
  cameraVideoOff: boolean
  hasCameraStream: boolean
  bindAvatarVideoRef: RefCallback<HTMLVideoElement>
  countdownHexSrc: string
  countdown: number | null
  countdownFinalAnimate: boolean
  sessionRecording: boolean
  /** What was chosen in the share dialog (from `getDisplayMedia` video track settings). */
  captureSurfaceKind: DisplayCaptureSurfaceKind | undefined
  /** Tab title, window title, or screen name when the browser exposes it via the track label. */
  captureSourceLabel: string
  elapsedLabel: string
  recordingPaused: boolean
  onFinish: () => void
  onPauseToggle: () => void
  onDelete: () => void
  /** Tab thumbnail in the capture pill — Document PiP only. */
  showCaptureThumbnail: boolean
}

export function ScreenRecordingPipView({
  showAvatar,
  cameraVideoOff,
  hasCameraStream,
  bindAvatarVideoRef,
  countdownHexSrc,
  countdown,
  countdownFinalAnimate,
  sessionRecording,
  captureSurfaceKind,
  captureSourceLabel: _captureSourceLabel,
  elapsedLabel,
  recordingPaused,
  onFinish,
  onPauseToggle,
  onDelete,
  showCaptureThumbnail,
}: ScreenRecordingPipViewProps) {
  const showCountdown = countdown !== null
  const showSessionChrome = showCountdown || sessionRecording
  const lockNonDeleteControls = showCountdown

  const captureStatusLine =
    captureSurfaceKind === 'browser'
      ? 'Now capturing your tab'
      : captureSurfaceKind === 'window'
        ? 'Now capturing your window'
        : captureSurfaceKind === 'monitor'
          ? 'Now capturing your screen'
          : 'Now capturing shared content'

  const captureTickerText = PIP_CAPTURE_TAB_NAME

  return (
    <div
      className={
        'screen-recording-pip' + (showSessionChrome ? ' screen-recording-pip--session-active' : '')
      }
      aria-label="Screen recording controls"
    >
      {showAvatar && (
        <div
          className={
            'screen-recording-pip__avatar-column' +
            (showSessionChrome ? ' screen-recording-pip__avatar-column--session-active' : '')
          }
        >
          <div className="screen-recording-pip__avatar-wrap">
            {showCountdown ? (
              <div
                className={
                  'screen-recording-pip__countdown-stack screen-recording-pip__countdown-stack--avatar-slot' +
                  (countdownFinalAnimate ? ' screen-recording-pip__countdown-stack--final-second' : '')
                }
                role="status"
                aria-live="polite"
                aria-label={`Recording starts in ${countdown}`}
              >
                <img
                  src={countdownHexSrc}
                  alt=""
                  className="screen-recording-pip__countdown-hex"
                  draggable={false}
                />
                <span className="screen-recording-pip__countdown-digit">{countdown}</span>
              </div>
            ) : (
              <div
                className={
                  'screen-recording-pip__avatar' +
                  (cameraVideoOff ? ' screen-recording-pip__avatar--off' : '')
                }
              >
                <div className="screen-recording-pip__avatar-media">
                  <video
                    ref={bindAvatarVideoRef}
                    className={
                      'screen-recording-pip__avatar-video' +
                      (!hasCameraStream || cameraVideoOff ? ' screen-recording-pip__avatar-video--hidden' : '')
                    }
                    autoPlay
                    playsInline
                    muted
                  />
                  {cameraVideoOff && (
                    <div className="screen-recording-pip__avatar-no-feed" aria-hidden>
                      <PersonOffOutlined fontSize="inherit" />
                    </div>
                  )}
                  {!hasCameraStream && !cameraVideoOff && (
                    <div className="screen-recording-pip__avatar-no-feed" aria-hidden>
                      <VideocamOutlinedIcon fontSize="inherit" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {showSessionChrome && (
            <div className="screen-recording-pip__session-copy">
              <CaptureStatusCard
                captureStatusLine={captureStatusLine}
                tickerText={captureTickerText}
                showCaptureThumbnail={showCaptureThumbnail}
                marqueePaused={showCountdown}
              />
              {sessionRecording && recordingPaused && (
                <p className="screen-recording-pip__paused-banner">Recording paused</p>
              )}
            </div>
          )}
        </div>
      )}
      {showSessionChrome && (
        <div className="screen-recording-pip__controls-shell">
          <div
            className={
              'screen-recording-pip__controls' +
              (lockNonDeleteControls ? ' screen-recording-pip__controls--countdown-locked' : '')
            }
            aria-label="Recording controls"
          >
            <button
              type="button"
              className="screen-recording-pip__finish-btn"
              onClick={onFinish}
              disabled={lockNonDeleteControls}
            >
              Finish
              <StopRoundedIcon
                className="screen-recording-pip__finish-btn-icon"
                fontSize="inherit"
                aria-hidden
              />
            </button>
            <span className="screen-recording-pip__timer" aria-live="polite">
              {elapsedLabel}
            </span>
            <span className="screen-recording-pip__controls-sep" aria-hidden="true" />
            <div className="screen-recording-pip__controls-actions">
              <button
                type="button"
                className="screen-recording-pip__icon-btn"
                aria-label={recordingPaused ? 'Resume recording' : 'Pause recording'}
                aria-pressed={recordingPaused}
                disabled={lockNonDeleteControls}
                onClick={onPauseToggle}
              >
                {recordingPaused ? (
                  <PlayArrowRoundedIcon fontSize="inherit" />
                ) : (
                  <PauseRoundedIcon fontSize="inherit" />
                )}
              </button>
              <button
                type="button"
                className="screen-recording-pip__icon-btn screen-recording-pip__icon-btn--delete"
                aria-label="Delete recording"
                onClick={onDelete}
              >
                <DeleteOutlinedIcon fontSize="inherit" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
