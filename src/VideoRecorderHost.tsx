import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TransitionEvent } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import PanoramaIcon from '@mui/icons-material/Panorama'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import CheckIcon from '@mui/icons-material/Check'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined'
import { playCountdownFinalFadeSound, playCountdownTick } from './audio/countdownTickSound'
import { playPauseToggleSound } from './audio/pauseToggleSound'
import {
  playRecordRevealSound,
  primeRevealAudioContext,
  RECORD_STAGE_REVEAL_DELAY_MS,
} from './audio/recordRevealSound'
const CameraPortraitBlurCanvas = lazy(() =>
  import('./CameraPortraitBlurCanvas').then((m) => ({ default: m.CameraPortraitBlurCanvas })),
)
import { VideoEditorView } from './VideoEditorView'
import { isDocumentPictureInPictureSupported } from './documentPictureInPicture'
import { useScreenRecordingDocumentPip } from './useScreenRecordingDocumentPip'
import type { ScreenRecordingPipViewProps } from './ScreenRecordingPipView'
import { useDisplayCapturePresentation } from './useDisplayCapturePresentation'
import { RecordSessionControlsDock } from './RecordSessionControlsDock'
import type { RecordSessionControlsDockProps } from './RecordSessionControlsDock'
import { TooltipLayer } from './TooltipLayer'
import { startCaptureBorder, stopCaptureBorder } from './captureBorderExtension'
import {
  getDisplayCaptureFriendlyLabel,
  getScreenCaptureSurfaceKind,
} from './displayCaptureLabel'
import { navigateToShellPage } from './shellPages'
import './recorder.css'

const VIDEO_EDIT_PREVIEW_SRC = `${import.meta.env.BASE_URL}videos/preview.mp4`
const SCREEN_RECORD_TEASER_SVG = `${import.meta.env.BASE_URL}images/screenrecord%20teaser%20-%20no%20radius.svg`

type RecordPreviewQuality = '1080p' | '720p' | '480p'
const RECORD_PREVIEW_QUALITY_OPTIONS: readonly RecordPreviewQuality[] = ['1080p', '720p', '480p']

const PAUSE_OVERLAY_FADE_MS = 400

function formatRecordingClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function cameraVideoConstraintsForQuality(
  videoDeviceId: string,
  quality: RecordPreviewQuality,
): MediaTrackConstraints {
  const size =
    quality === '1080p'
      ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
      : quality === '720p'
        ? { width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 854 }, height: { ideal: 480 } }
  return videoDeviceId ? { deviceId: { exact: videoDeviceId }, ...size } : size
}

export type VideoRecorderHostProps = {
  open: boolean
  onClose: () => void
}

export function VideoRecorderHost({ open, onClose }: VideoRecorderHostProps) {
  const [recordOverlayActive, setRecordOverlayActive] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [recordStageVisible, setRecordStageVisible] = useState(false)
  const [recordModeVisualVisible, setRecordModeVisualVisible] = useState(true)
  const [recordInputMode, setRecordInputMode] = useState<'camera' | 'screen'>('camera')
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('')
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraMicEnabled, setCameraMicEnabled] = useState(false)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const recordStageRectVideoRef = useRef<HTMLVideoElement | null>(null)
  const recordScreenShareVideoRef = useRef<HTMLVideoElement | null>(null)
  const recordScreenPipVideoRef = useRef<HTMLVideoElement | null>(null)
  const recordScreenDocumentPipVideoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false)
  const [micMenuOpen, setMicMenuOpen] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [cameraVideoOff, setCameraVideoOff] = useState(false)
  const [cameraBgBlurEnabled, setCameraBgBlurEnabled] = useState(false)
  /** Virtual background: default preset vs user image (mutually exclusive with blur). */
  const [cameraBgReplacementMode, setCameraBgReplacementMode] = useState<
    'default' | 'upload' | null
  >(null)
  const [cameraBgMenuOpen, setCameraBgMenuOpen] = useState(false)
  const [recordPreviewQuality, setRecordPreviewQuality] = useState<RecordPreviewQuality>('1080p')
  const cameraMenuRef = useRef<HTMLDivElement | null>(null)
  const cameraMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const micMenuRef = useRef<HTMLDivElement | null>(null)
  const micMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const cameraBgMenuRef = useRef<HTMLDivElement | null>(null)
  const cameraBgFileInputRef = useRef<HTMLInputElement | null>(null)
  const revealAudioContextRef = useRef<AudioContext | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  /** Camera mode: simulated “recording starts” countdown over the live preview (3 → 1). */
  const [cameraRecordCountdown, setCameraRecordCountdown] = useState<number | null>(null)
  /** After “1” displays at full strength for 1s, scale + fade runs until overlay clears. */
  const [cameraRecordFinalAnimate, setCameraRecordFinalAnimate] = useState(false)
  /** Dedupes Strict Mode double effects so each countdown beat plays one tick sound. */
  const countdownTickBeatRef = useRef<number | null>(null)
  /** Dedupes fade-out sound when final animation phase starts. */
  const countdownFinalFadeSoundPlayedRef = useRef(false)
  /** Camera session: after countdown fade completes — timer runs, Stop / Pause / Delete active. */
  const [cameraSessionRecording, setCameraSessionRecording] = useState(false)
  /** Screen session via Document PiP after display capture is chosen. */
  const [screenDocumentPipActive, setScreenDocumentPipActive] = useState(false)
  const [screenRecordCountdown, setScreenRecordCountdown] = useState<number | null>(null)
  const [screenRecordFinalAnimate, setScreenRecordFinalAnimate] = useState(false)
  const [screenSessionRecording, setScreenSessionRecording] = useState(false)
  const screenCountdownTickBeatRef = useRef<number | null>(null)
  const screenCountdownFinalFadeSoundPlayedRef = useRef(false)
  const [videoEditorOpen, setVideoEditorOpen] = useState(false)
  const [uiSkeletonActive, setUiSkeletonActive] = useState(false)
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0)
  const [recordingPaused, setRecordingPaused] = useState(false)
  /** After unpause: overlay stays mounted until opacity fade completes. */
  const [pauseOverlayExiting, setPauseOverlayExiting] = useState(false)
  const [pauseOverlayFadeOut, setPauseOverlayFadeOut] = useState(false)
  const countdownHexSrc = `${import.meta.env.BASE_URL}images/CountdownHex.svg`

  const recordingFlowChromeActive =
    (recordInputMode === 'camera' &&
      (cameraRecordFinalAnimate || cameraSessionRecording)) ||
    (recordInputMode === 'screen' &&
      !screenDocumentPipActive &&
      (screenRecordFinalAnimate || screenSessionRecording))

  const recordCountdownControlsLocked =
    cameraRecordCountdown !== null ||
    cameraRecordFinalAnimate ||
    screenRecordCountdown !== null ||
    screenRecordFinalAnimate

  const screenRecordingSessionActive =
    screenRecordCountdown !== null || screenRecordFinalAnimate || screenSessionRecording

  /** Document PiP shows capture chrome; keep the in-app stage on the wireframe/teaser only. */
  const screenDocumentPipOwnsInAppPreview =
    screenDocumentPipActive && screenRecordingSessionActive

  const handleRecordingPauseToggle = useCallback(() => {
    if (recordingPaused) {
      playCountdownFinalFadeSound()
      setRecordingPaused(false)
      setPauseOverlayExiting(true)
      setPauseOverlayFadeOut(false)
    } else {
      playPauseToggleSound()
      setRecordingPaused(true)
      setPauseOverlayExiting(false)
      setPauseOverlayFadeOut(false)
    }
  }, [recordingPaused])

  const handleRecordingResumeFromOverlay = useCallback(() => {
    playCountdownFinalFadeSound()
    setRecordingPaused(false)
    setPauseOverlayExiting(true)
    setPauseOverlayFadeOut(false)
  }, [])

  const handleSkipCameraCountdown = useCallback(() => {
    setCameraRecordCountdown(null)
    setCameraRecordFinalAnimate(false)
    setRecordingElapsedSec(0)
    setRecordingPaused(false)
    setCameraSessionRecording(true)
  }, [])

  const resetScreenRecordingSession = useCallback(() => {
    stopCaptureBorder()
    setScreenDocumentPipActive(false)
    setScreenRecordCountdown(null)
    setScreenRecordFinalAnimate(false)
    setScreenSessionRecording(false)
    setRecordingElapsedSec(0)
    setRecordingPaused(false)
    screenCountdownTickBeatRef.current = null
    screenCountdownFinalFadeSoundPlayedRef.current = false
  }, [])

  const handleSkipScreenCountdown = useCallback(() => {
    setScreenRecordCountdown(null)
    setScreenRecordFinalAnimate(false)
    setRecordingElapsedSec(0)
    setRecordingPaused(false)
    setScreenSessionRecording(true)
  }, [])

  const handleScreenFinishRecording = useCallback(() => {
    resetScreenRecordingSession()
    setRecordOverlayActive(false)
    setVideoEditorOpen(true)
  }, [resetScreenRecordingSession])

  const handleScreenDeleteRecording = useCallback(() => {
    resetScreenRecordingSession()
    screenStream?.getTracks().forEach((track) => track.stop())
    setScreenStream(null)
  }, [resetScreenRecordingSession, screenStream])

  const handleScreenDocumentPipClosed = useCallback(() => {
    if (screenSessionRecording || screenRecordCountdown !== null || screenRecordFinalAnimate) {
      resetScreenRecordingSession()
      screenStream?.getTracks().forEach((track) => track.stop())
      setScreenStream(null)
    } else {
      setScreenDocumentPipActive(false)
    }
  }, [
    resetScreenRecordingSession,
    screenRecordCountdown,
    screenRecordFinalAnimate,
    screenSessionRecording,
    screenStream,
  ])

  useEffect(() => {
    if (!pauseOverlayExiting || recordingPaused) return
    let inner = 0
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        setPauseOverlayFadeOut(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(outer)
      window.cancelAnimationFrame(inner)
    }
  }, [pauseOverlayExiting, recordingPaused])

  useEffect(() => {
    if (!cameraSessionRecording && !screenSessionRecording) {
      setPauseOverlayExiting(false)
      setPauseOverlayFadeOut(false)
    }
  }, [cameraSessionRecording, screenSessionRecording])

  const handlePauseOverlayTransitionEnd = useCallback((e: TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'opacity' || e.target !== e.currentTarget) return
    setPauseOverlayExiting(false)
    setPauseOverlayFadeOut(false)
  }, [])

  useEffect(() => {
    if (!pauseOverlayFadeOut) return
    const t = window.setTimeout(() => {
      setPauseOverlayExiting(false)
      setPauseOverlayFadeOut(false)
    }, PAUSE_OVERLAY_FADE_MS + 120)
    return () => window.clearTimeout(t)
  }, [pauseOverlayFadeOut])

  useEffect(() => {
    if (!recordCountdownControlsLocked) return
    setMicMenuOpen(false)
    setCameraMenuOpen(false)
  }, [recordCountdownControlsLocked])

  useEffect(() => {
    const devicesApi = navigator.mediaDevices
    if (!devicesApi?.enumerateDevices) return

    const readDevices = async () => {
      try {
        const devices = await devicesApi.enumerateDevices()
        const nextVideoDevices = devices.filter((device) => device.kind === 'videoinput')
        const nextAudioDevices = devices.filter((device) => device.kind === 'audioinput')
        setVideoDevices(nextVideoDevices)
        setAudioDevices(nextAudioDevices)
        if (!selectedVideoDeviceId && nextVideoDevices[0]?.deviceId) {
          setSelectedVideoDeviceId(nextVideoDevices[0].deviceId)
        }
        if (!selectedAudioDeviceId && nextAudioDevices[0]?.deviceId) {
          setSelectedAudioDeviceId(nextAudioDevices[0].deviceId)
        }
      } catch {
        /* unable to enumerate devices */
      }
    }

    void readDevices()
    devicesApi.addEventListener('devicechange', readDevices)
    return () => devicesApi.removeEventListener('devicechange', readDevices)
  }, [selectedAudioDeviceId, selectedVideoDeviceId])

  useEffect(() => {
    if (recordStageRectVideoRef.current) {
      recordStageRectVideoRef.current.srcObject = cameraStream
    }
    if (recordScreenShareVideoRef.current) {
      recordScreenShareVideoRef.current.srcObject = screenStream
    }
    const pipVideo = recordScreenPipVideoRef.current
    if (pipVideo) {
      pipVideo.srcObject = cameraStream
      if (cameraStream) {
        void pipVideo.play().catch(() => {
          /* autoplay blocked or element not visible yet */
        })
      }
    }
    const documentPipVideo = recordScreenDocumentPipVideoRef.current
    if (documentPipVideo) {
      documentPipVideo.srcObject = cameraStream
      if (cameraStream) {
        void documentPipVideo.play().catch(() => {
          /* autoplay blocked or element not visible yet */
        })
      }
    }
  }, [cameraStream, screenStream, recordInputMode, recordStageVisible, recordModeVisualVisible])

  const bindRecordScreenPipVideoRef = useCallback((el: HTMLVideoElement | null) => {
    recordScreenPipVideoRef.current = el
    if (!el) return
    const stream = cameraStreamRef.current
    el.srcObject = stream
    if (stream) {
      void el.play().catch(() => {
        /* autoplay blocked or element not visible yet */
      })
    }
  }, [])

  const bindScreenDocumentPipAvatarVideoRef = useCallback((el: HTMLVideoElement | null) => {
    recordScreenDocumentPipVideoRef.current = el
    if (!el) return
    const stream = cameraStreamRef.current
    el.srcObject = stream
    if (stream) {
      void el.play().catch(() => {
        /* autoplay blocked or element not visible yet */
      })
    }
  }, [])

  const displayCapturePip = useDisplayCapturePresentation(screenStream)

  useEffect(() => {
    if (!screenStream) {
      stopCaptureBorder()
      return
    }

    const sessionChromeActive =
      screenRecordCountdown !== null || screenRecordFinalAnimate || screenSessionRecording

    if (!sessionChromeActive) {
      stopCaptureBorder()
      return
    }

    const track = screenStream.getVideoTracks()[0]
    const surface = getScreenCaptureSurfaceKind(track)
    if (surface && surface !== 'browser') {
      stopCaptureBorder()
      return
    }

    const hint = displayCapturePip.friendlyLabel || getDisplayCaptureFriendlyLabel(track)
    startCaptureBorder(hint)
  }, [
    displayCapturePip.friendlyLabel,
    screenRecordCountdown,
    screenRecordFinalAnimate,
    screenSessionRecording,
    screenStream,
  ])

  const screenRecordingPipViewProps = useMemo<ScreenRecordingPipViewProps>(() => {
    return {
      showAvatar: true,
      cameraVideoOff,
      hasCameraStream: !!cameraStream,
      bindAvatarVideoRef: bindScreenDocumentPipAvatarVideoRef,
      countdownHexSrc,
      countdown: screenRecordCountdown,
      countdownFinalAnimate: screenRecordFinalAnimate,
      sessionRecording: screenSessionRecording,
      captureSurfaceKind: screenStream ? displayCapturePip.surfaceKind : undefined,
      captureSourceLabel: screenStream ? displayCapturePip.friendlyLabel : '',
      elapsedLabel: formatRecordingClock(recordingElapsedSec),
      recordingPaused,
      onFinish: handleScreenFinishRecording,
      onPauseToggle: handleRecordingPauseToggle,
      onDelete: handleScreenDeleteRecording,
      showCaptureThumbnail: false,
    }
  }, [
      bindScreenDocumentPipAvatarVideoRef,
      cameraStream,
      cameraVideoOff,
      countdownHexSrc,
      displayCapturePip,
      handleScreenDeleteRecording,
      handleScreenFinishRecording,
      handleRecordingPauseToggle,
      recordingElapsedSec,
      recordingPaused,
      screenRecordCountdown,
      screenRecordFinalAnimate,
      screenSessionRecording,
      screenStream,
    ],
  )

  useScreenRecordingDocumentPip(
    screenDocumentPipActive,
    screenRecordingPipViewProps,
    handleScreenDocumentPipClosed,
  )

  useEffect(() => {
    cameraStreamRef.current = cameraStream
  }, [cameraStream])

  useEffect(() => {
    if (!cameraStream) return
    for (const track of cameraStream.getAudioTracks()) {
      track.enabled = !micMuted
    }
    for (const track of cameraStream.getVideoTracks()) {
      track.enabled = !cameraVideoOff
    }
  }, [cameraStream, micMuted, cameraVideoOff])

  useEffect(() => {
    if (!recordOverlayActive) {
      setRecordStageVisible(false)
      setRecordInputMode('camera')
      setRecordModeVisualVisible(true)
      setCameraBgBlurEnabled(false)
      setCameraBgReplacementMode(null)
      setCameraBgMenuOpen(false)
      setCameraRecordCountdown(null)
      setCameraRecordFinalAnimate(false)
      setCameraSessionRecording(false)
      resetScreenRecordingSession()
      setRecordingElapsedSec(0)
      setRecordingPaused(false)
      setPauseOverlayExiting(false)
      setPauseOverlayFadeOut(false)
      return
    }

    setRecordInputMode('camera')
    setRecordModeVisualVisible(true)

    const timer = window.setTimeout(() => {
      setRecordStageVisible(true)
      const ctx = revealAudioContextRef.current ?? new AudioContext()
      void playRecordRevealSound(ctx)
    }, RECORD_STAGE_REVEAL_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [recordOverlayActive])

  useEffect(() => {
    if (cameraRecordCountdown === null || cameraRecordFinalAnimate) return

    if (cameraRecordCountdown > 1) {
      const t = window.setTimeout(() => {
        setCameraRecordCountdown((n) => (n === null ? null : n - 1))
      }, 1000)
      return () => window.clearTimeout(t)
    }

    const t = window.setTimeout(() => {
      setCameraRecordFinalAnimate(true)
    }, 1000)
    return () => window.clearTimeout(t)
  }, [cameraRecordCountdown, cameraRecordFinalAnimate])

  useEffect(() => {
    if (!cameraRecordFinalAnimate) return
    const t = window.setTimeout(() => {
      setCameraRecordCountdown(null)
      setCameraRecordFinalAnimate(false)
      setRecordingElapsedSec(0)
      setRecordingPaused(false)
      setCameraSessionRecording(true)
    }, 1000)
    return () => window.clearTimeout(t)
  }, [cameraRecordFinalAnimate])

  useEffect(() => {
    if (screenRecordCountdown === null || screenRecordFinalAnimate) return

    if (screenRecordCountdown > 1) {
      const t = window.setTimeout(() => {
        setScreenRecordCountdown((n) => (n === null ? null : n - 1))
      }, 1000)
      return () => window.clearTimeout(t)
    }

    const t = window.setTimeout(() => {
      setScreenRecordFinalAnimate(true)
    }, 1000)
    return () => window.clearTimeout(t)
  }, [screenRecordCountdown, screenRecordFinalAnimate])

  useEffect(() => {
    if (!screenRecordFinalAnimate) return
    const t = window.setTimeout(() => {
      setScreenRecordCountdown(null)
      setScreenRecordFinalAnimate(false)
      setRecordingElapsedSec(0)
      setRecordingPaused(false)
      setScreenSessionRecording(true)
    }, 1000)
    return () => window.clearTimeout(t)
  }, [screenRecordFinalAnimate])

  useEffect(() => {
    if (screenRecordCountdown === null) {
      screenCountdownTickBeatRef.current = null
      return
    }
    if (screenCountdownTickBeatRef.current === screenRecordCountdown) return
    screenCountdownTickBeatRef.current = screenRecordCountdown
    playCountdownTick()
  }, [screenRecordCountdown])

  useEffect(() => {
    if (!screenRecordFinalAnimate) {
      screenCountdownFinalFadeSoundPlayedRef.current = false
      return
    }
    if (screenCountdownFinalFadeSoundPlayedRef.current) return
    screenCountdownFinalFadeSoundPlayedRef.current = true
    playCountdownFinalFadeSound()
  }, [screenRecordFinalAnimate])

  useEffect(() => {
    const sessionActive =
      recordInputMode === 'camera' ? cameraSessionRecording : screenSessionRecording
    if (!sessionActive || recordingPaused) return
    const id = window.setInterval(() => {
      setRecordingElapsedSec((s) => s + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [cameraSessionRecording, screenSessionRecording, recordingPaused, recordInputMode])

  useEffect(() => {
    if (!cameraSessionRecording || recordInputMode !== 'camera') return

    const endCaptureSession = () => {
      setCameraSessionRecording(false)
      setRecordingElapsedSec(0)
      setRecordingPaused(false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable=true]')) return

      if (e.code === 'Space') {
        if (e.repeat) return
        e.preventDefault()
        handleRecordingPauseToggle()
        queueMicrotask(() => {
          const ae = document.activeElement
          if (!(ae instanceof HTMLElement)) return
          if (
            ae.closest('.prototype-browser-window__record-stage-toolbar') ||
            ae.closest('.prototype-browser-window__record-pause-overlay')
          ) {
            ae.blur()
          }
        })
        return
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        endCaptureSession()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        endCaptureSession()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [cameraSessionRecording, recordInputMode, handleRecordingPauseToggle])

  useEffect(() => {
    if (!cameraRecordFinalAnimate) {
      countdownFinalFadeSoundPlayedRef.current = false
      return
    }
    if (countdownFinalFadeSoundPlayedRef.current) return
    countdownFinalFadeSoundPlayedRef.current = true
    playCountdownFinalFadeSound()
  }, [cameraRecordFinalAnimate])

  useEffect(() => {
    if (cameraRecordCountdown === null) {
      countdownTickBeatRef.current = null
      countdownFinalFadeSoundPlayedRef.current = false
      return
    }
    if (countdownTickBeatRef.current === cameraRecordCountdown) return
    countdownTickBeatRef.current = cameraRecordCountdown
    playCountdownTick()
  }, [cameraRecordCountdown])

  useEffect(() => {
    if (recordInputMode !== 'camera') {
      setCameraBgBlurEnabled(false)
      setCameraBgReplacementMode(null)
      setCameraBgMenuOpen(false)
    }
  }, [recordInputMode])

  useEffect(() => {
    if (cameraSessionRecording) {
      setCameraBgMenuOpen(false)
    }
  }, [cameraSessionRecording])

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop())
      screenStream?.getTracks().forEach((track) => track.stop())
    }
  }, [cameraStream, screenStream])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        cameraMenuRef.current &&
        !cameraMenuRef.current.contains(target) &&
        !(cameraMenuPanelRef.current && cameraMenuPanelRef.current.contains(target))
      ) {
        setCameraMenuOpen(false)
      }
      if (
        micMenuRef.current &&
        !micMenuRef.current.contains(target) &&
        !(micMenuPanelRef.current && micMenuPanelRef.current.contains(target))
      ) {
        setMicMenuOpen(false)
      }
      if (cameraBgMenuRef.current && !cameraBgMenuRef.current.contains(target)) {
        setCameraBgMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const requestCameraMicStream = useCallback(
    async (videoDeviceId: string, audioDeviceId: string, quality: RecordPreviewQuality) => {
      try {
        cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoDeviceId
            ? cameraVideoConstraintsForQuality(videoDeviceId, quality)
            : cameraVideoConstraintsForQuality('', quality),
          audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
        })
        cameraStreamRef.current = stream
        setCameraStream(stream)
        return true
      } catch {
        cameraStreamRef.current = null
        setCameraStream(null)
        return false
      }
    },
    [],
  )

  useEffect(() => {
    if (!cameraMicEnabled) return
    void requestCameraMicStream(selectedVideoDeviceId, selectedAudioDeviceId, recordPreviewQuality)
  }, [
    cameraMicEnabled,
    requestCameraMicStream,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    recordPreviewQuality,
  ])

  const handleEnableCameraMic = async () => {
    const started = await requestCameraMicStream(
      selectedVideoDeviceId,
      selectedAudioDeviceId,
      recordPreviewQuality,
    )
    setCameraMicEnabled(started)
  }

  const handleStartScreenShare = async () => {
    if (screenRecordingSessionActive) return
    try {
      screenStream?.getTracks().forEach((track) => track.stop())
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        resetScreenRecordingSession()
        setScreenStream(null)
      })
      setScreenStream(stream)
      setScreenRecordFinalAnimate(false)
      setScreenRecordCountdown(3)
      if (isDocumentPictureInPictureSupported()) {
        setScreenDocumentPipActive(true)
      }
    } catch {
      /* cancelled or blocked */
    }
  }

  const screenStreamRef = useRef<MediaStream | null>(null)
  screenStreamRef.current = screenStream

  const releaseRecorderMedia = useCallback(() => {
    resetScreenRecordingSession()
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraStream(null)
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    setScreenStream(null)
    setCameraMicEnabled(false)
    setCameraSessionRecording(false)
    setCameraRecordCountdown(null)
    setCameraRecordFinalAnimate(false)
    setRecordingElapsedSec(0)
    setRecordingPaused(false)
    setVideoEditorOpen(false)
  }, [resetScreenRecordingSession])

  const handleCloseRecordingOverlay = () => {
    setRecordOverlayActive(false)
    releaseRecorderMedia()
    onCloseRef.current()
  }

  const handleEditorDone = useCallback(() => {
    setVideoEditorOpen(false)
    setRecordOverlayActive(false)
    releaseRecorderMedia()
    onCloseRef.current()
    navigateToShellPage('create-demoboard')
  }, [releaseRecorderMedia])

  const handleEditorDelete = useCallback(() => {
    handleCloseRecordingOverlay()
  }, [handleCloseRecordingOverlay])

  useEffect(() => {
    if (open) {
      if (!revealAudioContextRef.current) {
        revealAudioContextRef.current = new AudioContext()
      }
      primeRevealAudioContext(revealAudioContextRef.current)
      setRecordOverlayActive(true)
      if (!cameraMicEnabled) {
        void handleEnableCameraMic()
      }
      return
    }

    setRecordOverlayActive(false)
    releaseRecorderMedia()
  }, [open, cameraMicEnabled, releaseRecorderMedia])

  useEffect(() => {
    if (!open || videoEditorOpen) {
      setUiSkeletonActive(false)
      return
    }

    setUiSkeletonActive(true)
    const t = window.setTimeout(() => setUiSkeletonActive(false), 2000)
    return () => window.clearTimeout(t)
  }, [open, videoEditorOpen])

  const handleRecordModeChange = (nextMode: 'camera' | 'screen') => {
    if (nextMode === recordInputMode) return
    if (recordCountdownControlsLocked) return

    setCameraRecordCountdown(null)
    setCameraRecordFinalAnimate(false)
    setCameraSessionRecording(false)
    resetScreenRecordingSession()
    setRecordingElapsedSec(0)
    setRecordingPaused(false)
    setPauseOverlayExiting(false)
    setPauseOverlayFadeOut(false)

    setRecordInputMode(nextMode)
  }

  const recordSessionControlsDockProps = useMemo<RecordSessionControlsDockProps>(
    () => ({
      recordingFlowChromeActive,
      recordInputMode,
      recordCountdownControlsLocked,
      onRecordModeChange: handleRecordModeChange,
      cameraSessionRecording,
      screenDocumentPipActive,
      screenSessionRecording,
      screenRecordingSessionActive,
      recordingPaused,
      recordingElapsedSec,
      formatRecordingClock,
      micMuted,
      onMicMutedToggle: () => setMicMuted((prev) => !prev),
      micMenuOpen,
      onMicMenuToggle: () => {
        setMicMenuOpen((open) => !open)
        setCameraMenuOpen(false)
      },
      micMenuRef,
      micMenuPanelRef,
      cameraVideoOff,
      onCameraVideoOffToggle: () => setCameraVideoOff((prev) => !prev),
      cameraMenuOpen,
      onCameraMenuToggle: () => {
        setCameraMenuOpen((open) => !open)
        setMicMenuOpen(false)
      },
      cameraMenuRef,
      cameraMenuPanelRef,
      audioDevices,
      selectedAudioDeviceId,
      onSelectAudioDevice: (deviceId) => {
        setSelectedAudioDeviceId(deviceId)
        setMicMenuOpen(false)
      },
      videoDevices,
      selectedVideoDeviceId,
      onSelectVideoDevice: (deviceId) => {
        setSelectedVideoDeviceId(deviceId)
        setCameraMenuOpen(false)
      },
      onStartScreenShare: () => {
        void handleStartScreenShare()
      },
      onScreenFinishRecording: handleScreenFinishRecording,
      onScreenDeleteRecording: handleScreenDeleteRecording,
      onRecordingPauseToggle: handleRecordingPauseToggle,
      onCameraFinishRecording: () => {
        setCameraSessionRecording(false)
        setRecordingElapsedSec(0)
        setRecordingPaused(false)
        setRecordOverlayActive(false)
        setVideoEditorOpen(true)
      },
      onCameraDeleteRecording: () => {
        setCameraSessionRecording(false)
        setRecordingElapsedSec(0)
        setRecordingPaused(false)
      },
      onCameraStartRecording: () => {
        setCameraRecordFinalAnimate(false)
        setCameraRecordCountdown(3)
      },
    }),
    [
      recordingFlowChromeActive,
      recordInputMode,
      recordCountdownControlsLocked,
      cameraSessionRecording,
      screenDocumentPipActive,
      screenSessionRecording,
      screenRecordingSessionActive,
      recordingPaused,
      recordingElapsedSec,
      micMuted,
      micMenuOpen,
      cameraVideoOff,
      cameraMenuOpen,
      audioDevices,
      selectedAudioDeviceId,
      videoDevices,
      selectedVideoDeviceId,
      handleScreenFinishRecording,
      handleScreenDeleteRecording,
      handleRecordingPauseToggle,
      handleStartScreenShare,
      handleRecordModeChange,
    ],
  )

  const recordStageReady = recordOverlayActive && recordStageVisible && recordModeVisualVisible

  if (!open) return null

  if (videoEditorOpen) {
    return (
      <div className="web-app-recorder-editor-fullpage" role="application" aria-label="Edit recording">
        <VideoEditorView
          videoSrc={VIDEO_EDIT_PREVIEW_SRC}
          onDone={handleEditorDone}
          onDelete={handleEditorDelete}
        />
      </div>
    )
  }

  return (
    <div className="web-app-recorder-overlay" role="presentation">
      <div className="web-app-recorder-overlay__gradient" aria-hidden />
      <div className="web-app-recorder-overlay__backdrop" aria-hidden />
      <div
        className="web-app-recorder-overlay__stage"
        ref={workspaceRef}
        role="dialog"
        aria-modal="true"
        aria-label="Video recorder"
      >
        <div className="web-app-recorder-overlay__content">
        {uiSkeletonActive ? (
<div className="web-app-recorder-skeleton">
  <div className="web-app-recorder-skeleton__banner" />
  <div className="web-app-recorder-skeleton__chrome">
    <button
      type="button"
      className="web-app-recorder-overlay__close"
      aria-label="Close recorder"
      onClick={handleCloseRecordingOverlay}
    >
      <CloseIcon fontSize="small" />
    </button>
    <div className="web-app-recorder-skeleton__video" />
    <div className="web-app-recorder-skeleton__controls">
      <div className="web-app-recorder-skeleton__controls-left" />
      <div className="web-app-recorder-skeleton__controls-center" />
      <div className="web-app-recorder-skeleton__controls-right" />
    </div>
  </div>
</div>
        ) : (
<div className="prototype-browser-window__record-ui-stack web-app-recorder-overlay__stack">
{recordOverlayActive && recordStageVisible && recordModeVisualVisible ? (
  <div className="prototype-browser-window__record-ui-stack-message-slot web-app-recorder-overlay__stack-message-slot">
    <div
      className={
        'prototype-browser-window__record-camera-only-banner web-app-recorder-overlay__camera-banner' +
        (recordInputMode === 'camera'
          ? ' prototype-browser-window__record-ui-stack-message--active'
          : '') +
        (cameraSessionRecording
          ? ' prototype-browser-window__record-camera-only-banner--recording'
          : '') +
        (cameraSessionRecording && recordingPaused
          ? ' prototype-browser-window__record-camera-only-banner--recording-paused'
          : '')
      }
      aria-label="Camera recording only"
      aria-hidden={recordInputMode !== 'camera'}
    >
      <span className="prototype-browser-window__record-camera-only-dot" aria-hidden />
      <span>Camera Recording Only</span>
    </div>
    <p
      className={
        'prototype-browser-window__record-stage-screen-hint prototype-browser-window__record-stage-screen-hint--stack web-app-recorder-overlay__screen-hint' +
        (recordInputMode === 'screen'
          ? ' prototype-browser-window__record-ui-stack-message--active'
          : '')
      }
      role="status"
      aria-hidden={recordInputMode !== 'screen'}
    >
      <InfoOutlined
        className="prototype-browser-window__record-stage-screen-hint-icon"
        fontSize="inherit"
        aria-hidden
      />
      <span>Your recording will happen in the tab or window you choose.</span>
    </p>
  </div>
) : null}
<div className="web-app-recorder-overlay__recorder-chrome">
  {recordStageReady ? (
    <button
      type="button"
      className="web-app-recorder-overlay__close"
      aria-label="Close recorder"
      onClick={handleCloseRecordingOverlay}
    >
      <CloseIcon fontSize="small" />
    </button>
  ) : null}
  <div
    className={
      'prototype-browser-window__record-ui-recorder' +
      (recordStageReady
        ? ' prototype-browser-window__record-ui-recorder--active'
        : '') +
      (cameraSessionRecording ? ' prototype-browser-window__record-ui-recorder--camera-recording' : '') +
      (cameraSessionRecording && recordingPaused
        ? ' prototype-browser-window__record-ui-recorder--camera-recording-paused'
        : '')
    }
  >
<div className="prototype-browser-window__record-ui-stage-slot">
<div
  className={
    'prototype-browser-window__record-stage prototype-browser-window__record-stage--camera' +
    (recordOverlayActive &&
    recordStageVisible &&
    recordModeVisualVisible &&
    recordInputMode === 'camera'
      ? ' prototype-browser-window__record-stage--active'
      : '')
  }
  aria-hidden={
    !(recordOverlayActive && recordStageVisible && recordModeVisualVisible && recordInputMode === 'camera')
  }
>
  <div className="prototype-browser-window__record-stage-live">
  <div
    className={
      'prototype-browser-window__record-stage-inner' +
      (cameraBgBlurEnabled ? ' prototype-browser-window__record-stage-inner--camera-blur-on' : '') +
      (cameraSessionRecording ? ' prototype-browser-window__record-stage-inner--recording' : '')
    }
  >
    {cameraStream ? (
      <>
        <video
          ref={recordStageRectVideoRef}
          className={
            'prototype-browser-window__record-stage-video' +
            (cameraBgBlurEnabled
              ? ' prototype-browser-window__record-stage-video--segmentation-source'
              : '')
          }
          crossOrigin="anonymous"
          autoPlay
          playsInline
          muted
        />
        {cameraBgBlurEnabled && (
          <Suspense fallback={null}>
            <CameraPortraitBlurCanvas
              videoRef={recordStageRectVideoRef}
              active={cameraBgBlurEnabled}
            />
          </Suspense>
        )}
      </>
    ) : (
      <div className="prototype-browser-window__record-stage-placeholder">
        Enable camera to preview video here
      </div>
    )}
    {cameraRecordCountdown !== null && (
      <div
        className="prototype-browser-window__record-countdown-overlay"
        role="status"
        aria-live="polite"
        aria-label={`Recording starts in ${cameraRecordCountdown}`}
      >
        <div className="prototype-browser-window__record-countdown-dim" aria-hidden />
        <div
          className={
            'prototype-browser-window__record-countdown-stack' +
            (cameraRecordFinalAnimate
              ? ' prototype-browser-window__record-countdown-stack--final-second'
              : '')
          }
        >
          <img
            src={countdownHexSrc}
            alt=""
            className="prototype-browser-window__record-countdown-hex"
            draggable={false}
          />
          <span className="prototype-browser-window__record-countdown-digit">
            {cameraRecordCountdown}
          </span>
        </div>
        <button
          type="button"
          className={
            'prototype-browser-window__record-countdown-skip' +
            (cameraRecordFinalAnimate
              ? ' prototype-browser-window__record-countdown-skip--final-fade'
              : '')
          }
          onClick={handleSkipCameraCountdown}
          aria-label="Skip the countdown and start recording immediately"
        >
          Skip the countdown
        </button>
      </div>
    )}
    {cameraSessionRecording && (recordingPaused || pauseOverlayExiting) && (
      <div
        className={
          'prototype-browser-window__record-pause-overlay' +
          (pauseOverlayFadeOut ? ' prototype-browser-window__record-pause-overlay--fade-out' : '')
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-pause-overlay-heading"
        aria-hidden={pauseOverlayFadeOut}
        onTransitionEnd={handlePauseOverlayTransitionEnd}
      >
        <div className="prototype-browser-window__record-pause-overlay-scrim" aria-hidden />
        <div className="prototype-browser-window__record-pause-overlay-card">
          <h2
            id="record-pause-overlay-heading"
            className="prototype-browser-window__record-pause-overlay-heading"
          >
            <span>Recording Paused</span>
            <PauseRoundedIcon
              className="prototype-browser-window__record-pause-overlay-pause-icon"
              fontSize="inherit"
              aria-hidden
            />
          </h2>
          <div className="prototype-browser-window__record-pause-overlay-actions">
            <button
              type="button"
              className="prototype-browser-window__record-pause-overlay-action"
              onClick={handleRecordingResumeFromOverlay}
            >
              <span className="prototype-browser-window__record-pause-overlay-action-label">
                Resume/Pause
              </span>
              <kbd className="prototype-browser-window__record-pause-overlay-kbd">SPACE</kbd>
            </button>
            <button
              type="button"
              className="prototype-browser-window__record-pause-overlay-action"
              onClick={() => {
                setCameraSessionRecording(false)
                setRecordingElapsedSec(0)
                setRecordingPaused(false)
              }}
            >
              <span className="prototype-browser-window__record-pause-overlay-action-label">Stop</span>
              <kbd className="prototype-browser-window__record-pause-overlay-kbd">D</kbd>
            </button>
            <button
              type="button"
              className="prototype-browser-window__record-pause-overlay-action"
              onClick={() => {
                setCameraSessionRecording(false)
                setRecordingElapsedSec(0)
                setRecordingPaused(false)
              }}
            >
              <span className="prototype-browser-window__record-pause-overlay-action-label">Delete</span>
              <kbd className="prototype-browser-window__record-pause-overlay-kbd">ESC</kbd>
            </button>
          </div>
        </div>
      </div>
    )}
    <div
      className="prototype-browser-window__record-preview-quality"
      role="radiogroup"
      aria-label="Camera preview resolution"
    >
      {RECORD_PREVIEW_QUALITY_OPTIONS.map((q) => (
        <button
          key={q}
          type="button"
          role="radio"
          aria-checked={recordPreviewQuality === q}
          className={
            'prototype-browser-window__record-preview-quality__btn' +
            (recordPreviewQuality === q
              ? ' prototype-browser-window__record-preview-quality__btn--selected'
              : '')
          }
          disabled={recordCountdownControlsLocked}
          onClick={() => setRecordPreviewQuality(q)}
        >
          {q}
        </button>
      ))}
    </div>
  </div>
  <div
    className={
      'prototype-browser-window__record-stage-controls' +
      (recordOverlayActive &&
      recordStageVisible &&
      recordModeVisualVisible &&
      recordInputMode === 'camera' &&
      !cameraSessionRecording
        ? ' prototype-browser-window__record-stage-controls--active'
        : '')
    }
    aria-label="Video feed controls"
  >
    <button
      type="button"
      className={
        'prototype-browser-window__tooltip-trigger prototype-browser-window__record-stage-controls__blur-btn' +
        (cameraBgBlurEnabled ? ' prototype-browser-window__record-stage-control-btn--active' : '')
      }
      aria-label={cameraBgBlurEnabled ? 'Turn off blur' : 'Blur background around subject'}
      aria-pressed={cameraBgBlurEnabled}
      data-tooltip={
        cameraBgBlurEnabled ? 'Turn off blur' : 'Blur background'
      }
      disabled={!cameraStream}
      onClick={() => {
        setCameraBgBlurEnabled((prev) => {
          const next = !prev
          if (next) {
            setCameraBgReplacementMode(null)
            setCameraBgMenuOpen(false)
          }
          return next
        })
      }}
    >
      <span className="prototype-browser-window__material-symbol" aria-hidden>
        background_replace
      </span>
    </button>
    <div
      className="prototype-browser-window__device-menu-wrap prototype-browser-window__record-stage-bg-menu-wrap"
      ref={cameraBgMenuRef}
    >
      <input
        ref={cameraBgFileInputRef}
        type="file"
        accept="image/*"
        className="prototype-browser-window__record-stage-bg-file-input"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            setCameraBgReplacementMode('upload')
            setCameraBgBlurEnabled(false)
            setCameraBgMenuOpen(false)
          }
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className={
          'prototype-browser-window__tooltip-trigger prototype-browser-window__record-stage-controls__bg-btn' +
          (cameraBgReplacementMode !== null
            ? ' prototype-browser-window__record-stage-control-btn--active'
            : '') +
          (cameraBgMenuOpen ? ' prototype-browser-window__record-stage-controls__bg-btn--menu-open' : '')
        }
        aria-label={
          cameraBgReplacementMode !== null
            ? 'Turn off virtual background'
            : 'Virtual background'
        }
        aria-expanded={cameraBgMenuOpen}
        aria-controls={cameraBgMenuOpen ? 'record-stage-virtual-bg-menu' : undefined}
        aria-haspopup="menu"
        aria-pressed={cameraBgReplacementMode !== null}
        data-tooltip={
          cameraBgReplacementMode !== null
            ? 'Turn off virtual background'
            : 'Virtual background'
        }
        disabled={!cameraStream}
        onClick={() => {
          if (cameraBgReplacementMode !== null) {
            setCameraBgReplacementMode(null)
            setCameraBgMenuOpen(false)
            return
          }
          setCameraBgMenuOpen((open) => !open)
        }}
      >
        <PanoramaIcon fontSize="inherit" aria-hidden />
      </button>
      {cameraBgMenuOpen && (
        <div
          id="record-stage-virtual-bg-menu"
          className="prototype-browser-window__device-menu prototype-browser-window__device-menu--virtual-background"
          role="menu"
          aria-label="Virtual background options"
        >
          <button
            type="button"
            className={
              'prototype-browser-window__device-menu-item' +
              (cameraBgReplacementMode === 'default'
                ? ' prototype-browser-window__device-menu-item--active'
                : '')
            }
            role="menuitem"
            onClick={() => {
              setCameraBgReplacementMode('default')
              setCameraBgBlurEnabled(false)
              setCameraBgMenuOpen(false)
            }}
          >
            <span className="prototype-browser-window__device-menu-item-label">Default</span>
            {cameraBgReplacementMode === 'default' && (
              <span className="prototype-browser-window__device-menu-item-check" aria-hidden>
                <CheckIcon fontSize="inherit" />
              </span>
            )}
          </button>
          <button
            type="button"
            className={
              'prototype-browser-window__device-menu-item' +
              (cameraBgReplacementMode === 'upload'
                ? ' prototype-browser-window__device-menu-item--active'
                : '')
            }
            role="menuitem"
            onClick={() => {
              cameraBgFileInputRef.current?.click()
            }}
          >
            <span className="prototype-browser-window__device-menu-item-label">Upload custom</span>
            {cameraBgReplacementMode === 'upload' && (
              <span className="prototype-browser-window__device-menu-item-check" aria-hidden>
                <CheckIcon fontSize="inherit" />
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  </div>
  </div>
</div>
<div
  className={
    'prototype-browser-window__record-stage prototype-browser-window__record-stage--screen' +
    (recordOverlayActive &&
    recordStageVisible &&
    recordModeVisualVisible &&
    recordInputMode === 'screen'
      ? ' prototype-browser-window__record-stage--active'
      : '')
  }
  aria-hidden={
    !(recordOverlayActive && recordStageVisible && recordModeVisualVisible && recordInputMode === 'screen')
  }
>
  <div className="prototype-browser-window__record-stage-live">
  <div className="prototype-browser-window__record-stage-inner prototype-browser-window__record-stage-inner--screen">
  <div
    className={
      'prototype-browser-window__record-screen-frame' +
      (screenStream && !screenDocumentPipOwnsInAppPreview
        ? ' prototype-browser-window__record-screen-frame--live'
        : '')
    }
  >
    <div className="prototype-browser-window__record-screen-frame-base" aria-hidden />
    {screenStream && !screenDocumentPipOwnsInAppPreview ? (
      <video
        ref={recordScreenShareVideoRef}
        className="prototype-browser-window__record-screen-share-video"
        autoPlay
        playsInline
        muted
      />
    ) : null}
    {(!screenStream || screenDocumentPipOwnsInAppPreview) && (
      <img
        className="prototype-browser-window__record-screen-wireframe"
        src={SCREEN_RECORD_TEASER_SVG}
        alt=""
        draggable={false}
      />
    )}
    {!screenDocumentPipOwnsInAppPreview && (
    <div
      className={
        'prototype-browser-window__record-screen-pip' +
        (cameraVideoOff ? ' prototype-browser-window__record-screen-pip--camera-off' : '')
      }
    >
      <div className="prototype-browser-window__record-screen-pip-media">
      {cameraStream ? (
        <video
          ref={bindRecordScreenPipVideoRef}
          className={
            'prototype-browser-window__record-screen-pip-video' +
            (cameraVideoOff ? ' prototype-browser-window__record-screen-pip-video--hidden' : '')
          }
          autoPlay
          playsInline
          muted
        />
      ) : null}
      {cameraVideoOff && (
        <div
          className="prototype-browser-window__record-screen-pip-no-avatar"
          role="img"
          aria-label="Camera is off"
        >
          <PersonOffOutlined
            className="prototype-browser-window__record-screen-pip-no-avatar-icon"
            aria-hidden
          />
        </div>
      )}
      {!cameraStream && !cameraVideoOff && (
        <div className="prototype-browser-window__record-screen-pip-placeholder" aria-hidden>
          <VideocamOutlinedIcon />
        </div>
      )}
      </div>
    </div>
    )}
    {!screenDocumentPipActive && screenRecordCountdown !== null && (
      <div
        className="prototype-browser-window__record-countdown-overlay"
        role="status"
        aria-live="polite"
        aria-label={`Recording starts in ${screenRecordCountdown}`}
      >
        <div className="prototype-browser-window__record-countdown-dim" aria-hidden />
        <div
          className={
            'prototype-browser-window__record-countdown-stack' +
            (screenRecordFinalAnimate
              ? ' prototype-browser-window__record-countdown-stack--final-second'
              : '')
          }
        >
          <img
            src={countdownHexSrc}
            alt=""
            className="prototype-browser-window__record-countdown-hex"
            draggable={false}
          />
          <span className="prototype-browser-window__record-countdown-digit">
            {screenRecordCountdown}
          </span>
        </div>
        <button
          type="button"
          className={
            'prototype-browser-window__record-countdown-skip' +
            (screenRecordFinalAnimate
              ? ' prototype-browser-window__record-countdown-skip--final-fade'
              : '')
          }
          onClick={handleSkipScreenCountdown}
          aria-label="Skip the countdown and start recording immediately"
        >
          Skip the countdown
        </button>
      </div>
    )}
    {!screenDocumentPipActive &&
      screenSessionRecording &&
      (recordingPaused || pauseOverlayExiting) && (
        <div
          className={
            'prototype-browser-window__record-pause-overlay' +
            (pauseOverlayFadeOut ? ' prototype-browser-window__record-pause-overlay--fade-out' : '')
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-screen-pause-overlay-heading"
          aria-hidden={pauseOverlayFadeOut}
          onTransitionEnd={handlePauseOverlayTransitionEnd}
        >
          <div className="prototype-browser-window__record-pause-overlay-scrim" aria-hidden />
          <div className="prototype-browser-window__record-pause-overlay-card">
            <h2
              id="record-screen-pause-overlay-heading"
              className="prototype-browser-window__record-pause-overlay-heading"
            >
              <span>Recording Paused</span>
              <PauseRoundedIcon
                className="prototype-browser-window__record-pause-overlay-pause-icon"
                fontSize="inherit"
                aria-hidden
              />
            </h2>
            <div className="prototype-browser-window__record-pause-overlay-actions">
              <button
                type="button"
                className="prototype-browser-window__record-pause-overlay-action"
                onClick={handleRecordingResumeFromOverlay}
              >
                <span className="prototype-browser-window__record-pause-overlay-action-label">
                  Resume/Pause
                </span>
                <kbd className="prototype-browser-window__record-pause-overlay-kbd">SPACE</kbd>
              </button>
              <button
                type="button"
                className="prototype-browser-window__record-pause-overlay-action"
                onClick={handleScreenFinishRecording}
              >
                <span className="prototype-browser-window__record-pause-overlay-action-label">Stop</span>
                <kbd className="prototype-browser-window__record-pause-overlay-kbd">D</kbd>
              </button>
              <button
                type="button"
                className="prototype-browser-window__record-pause-overlay-action"
                onClick={handleScreenDeleteRecording}
              >
                <span className="prototype-browser-window__record-pause-overlay-action-label">Delete</span>
                <kbd className="prototype-browser-window__record-pause-overlay-kbd">ESC</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    <div
      className="prototype-browser-window__record-preview-quality"
      role="radiogroup"
      aria-label="Screen capture resolution"
    >
      {RECORD_PREVIEW_QUALITY_OPTIONS.map((q) => (
        <button
          key={q}
          type="button"
          role="radio"
          aria-checked={recordPreviewQuality === q}
          className={
            'prototype-browser-window__record-preview-quality__btn' +
            (recordPreviewQuality === q
              ? ' prototype-browser-window__record-preview-quality__btn--selected'
              : '')
          }
          disabled={recordCountdownControlsLocked}
          onClick={() => setRecordPreviewQuality(q)}
        >
          {q}
        </button>
      ))}
    </div>
  </div>
  </div>
  </div>
</div>
</div>
<div
  className={
    'prototype-browser-window__record-stage-toolbar' +
    (recordOverlayActive && recordStageVisible && recordModeVisualVisible
      ? ' prototype-browser-window__record-stage-toolbar--active'
      : '')
  }
  aria-label="Recording controls"
>
  <RecordSessionControlsDock {...recordSessionControlsDockProps} />
</div>
  </div>
</div>
</div>
        )}
        </div>
        <TooltipLayer rootRef={workspaceRef} />
      </div>
    </div>
  )
}
