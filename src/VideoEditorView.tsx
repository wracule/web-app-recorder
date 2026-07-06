import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { CSSProperties } from 'react'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import CropIcon from '@mui/icons-material/Crop'
import DragHandleIcon from '@mui/icons-material/DragHandle'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
/** Material `account_circle_off`; MUI exposes this glyph as `NoAccountsOutlined`. */
import NoAccountsOutlinedIcon from '@mui/icons-material/NoAccountsOutlined'
import Tooltip from '@mui/material/Tooltip'
import splitSceneSvgRaw from '/images/split_scene.svg?raw'
import './VideoEditorView.css'

type VideoEditorViewProps = {
  videoSrc: string
  onDone: () => void
  onDelete: () => void
}

const FILMSTRIP_FRAMES = 14
/** Served from `public/videos/talking-head.mp4`. */
const TALKING_HEAD_VIDEO_SRC = '/videos/talking-head.mp4'

type PipSizeKey = 'sm' | 'md' | 'lg'
const PIP_DIAMETER_PX: Record<PipSizeKey, number> = { sm: 96, md: 128, lg: 160 }
const PIP_ACCOUNT_ICON_SX: Record<PipSizeKey, { fontSize: number }> = {
  sm: { fontSize: 16 },
  md: { fontSize: 22 },
  lg: { fontSize: 27 },
}

/** Keep in sync with `--video-editor-no-avatar-orb-size` in `VideoEditorView.css`. */
const PIP_NO_AVATAR_ORB_PX = 72

function pipAvatarDiameterPx(pipHidden: boolean, pipSize: PipSizeKey): number {
  return pipHidden ? PIP_NO_AVATAR_ORB_PX : PIP_DIAMETER_PX[pipSize]
}

const PIP_SNAP_HIGHLIGHT_PX = 52
/** Gap from main video edge to orb outline at snap anchors (see `buildPipSnapAnchors`). */
const PIP_SNAP_BORDER_INSET_PX = 24

type PipSnapId =
  | 'corner-tl'
  | 'corner-tr'
  | 'corner-bl'
  | 'corner-br'
  | 'edge-t'
  | 'edge-b'
  | 'edge-l'
  | 'edge-r'

function buildPipSnapAnchors(
  vl: number,
  vt: number,
  vw: number,
  vh: number,
  d: number,
): { id: PipSnapId; cx: number; cy: number }[] {
  const r = d / 2
  const pad = PIP_SNAP_BORDER_INSET_PX
  const minSide = 2 * pad + d
  if (vw < minSide || vh < minSide) return []
  return [
    { id: 'corner-tl', cx: vl + pad + r, cy: vt + pad + r },
    { id: 'corner-tr', cx: vl + vw - pad - r, cy: vt + pad + r },
    { id: 'corner-bl', cx: vl + pad + r, cy: vt + vh - pad - r },
    { id: 'corner-br', cx: vl + vw - pad - r, cy: vt + vh - pad - r },
    { id: 'edge-t', cx: vl + vw / 2, cy: vt + pad + r },
    { id: 'edge-b', cx: vl + vw / 2, cy: vt + vh - pad - r },
    { id: 'edge-l', cx: vl + pad + r, cy: vt + vh / 2 },
    { id: 'edge-r', cx: vl + vw - pad - r, cy: vt + vh / 2 },
  ]
}

/** Minimum kept region as a fraction of full duration (handles cannot cross). */
const TRIM_MIN_KEEP = 0.08
/** Tap rail without dragging → nudge timeline scroll (px slop). */
const TRIM_RAIL_TAP_MAX_PX = 10
/** Matches `.video-editor__timeline-edge--trim-rail` width; rails use translateX(-50%) on frame edges. */
const TRIM_RAIL_WIDTH_PX = 14

type CropEdge = 'top' | 'right' | 'bottom' | 'left'
type CropInsets = { top: number; left: number; right: number; bottom: number }

/** Minimum width/height of the kept crop region, as a fraction of the video box. */
const CROP_MIN_VISIBLE_FRAC = 0.12
/** Scrim “hole” is expanded past the video frame so edge handles (outside the frame rect) stay clear of blur. */
const CROP_SCRIM_HOLE_BLEED_PX = 32

type CropOverlayLayout = {
  /** Expanded hole for blur scrim (includes handle bleed). */
  scrimRect: { top: number; left: number; width: number; height: number }
  /** Actual `.video-editor__video-frame` box — used to center actions under the main video. */
  videoFrameRect: { top: number; left: number; width: number; height: number }
}

/** Gap (px) between bottom of main video frame and the crop action buttons. */
const CROP_MODE_ACTIONS_BELOW_VIDEO_PX = 64

function hasNormCropInsets(c: CropInsets): boolean {
  return c.top > 1e-5 || c.bottom > 1e-5 || c.left > 1e-5 || c.right > 1e-5
}

function intersectPipSnapRectWithFrame(
  sr: DOMRectReadOnly,
  frameEl: HTMLElement | null,
  vl: number,
  vt: number,
  vw: number,
  vh: number,
): { vl: number; vt: number; vw: number; vh: number } | null {
  if (vw < 1 || vh < 1) return null
  if (!frameEl) return { vl, vt, vw, vh }
  const fr = frameEl.getBoundingClientRect()
  const fl = fr.left - sr.left
  const ft = fr.top - sr.top
  const frw = fr.width
  const frh = fr.height
  const r0 = Math.max(vl, fl)
  const t0 = Math.max(vt, ft)
  const r1 = Math.min(vl + vw, fl + frw)
  const b1 = Math.min(vt + vh, ft + frh)
  const iw = r1 - r0
  const ih = b1 - t0
  if (iw < 1 || ih < 1) return null
  return { vl: r0, vt: t0, vw: iw, vh: ih }
}

/**
 * Visible main-video picture rect in preview-surface coordinates: same object-fit / object-position
 * math as the main `<video>` (including crop centering on cover), then clipped to `.video-editor__video-frame`.
 */
function getPipSnapMainVideoRectInSurface(
  sr: DOMRectReadOnly,
  videoEl: HTMLVideoElement,
  frameEl: HTMLElement | null,
  videoIntrinsic: { w: number; h: number } | null,
  previewVideoContain: boolean,
  cropInsets: CropInsets,
  cropUiOpen: boolean,
): { vl: number; vt: number; vw: number; vh: number } | null {
  const vr = videoEl.getBoundingClientRect()
  const W = vr.width
  const H = vr.height
  if (!Number.isFinite(W) || !Number.isFinite(H) || W < 1 || H < 1) return null

  const mw =
    videoEl.videoWidth > 0 && Number.isFinite(videoEl.videoWidth)
      ? videoEl.videoWidth
      : (videoIntrinsic?.w ?? 0)
  const mh =
    videoEl.videoHeight > 0 && Number.isFinite(videoEl.videoHeight)
      ? videoEl.videoHeight
      : (videoIntrinsic?.h ?? 0)

  const vl0 = vr.left - sr.left
  const vt0 = vr.top - sr.top

  if (!Number.isFinite(mw) || !Number.isFinite(mh) || mw < 1 || mh < 1) {
    return intersectPipSnapRectWithFrame(sr, frameEl, vl0, vt0, W, H)
  }

  const fitContain = previewVideoContain
  const scale = fitContain ? Math.min(W / mw, H / mh) : Math.max(W / mw, H / mh)
  const rw = mw * scale
  const rh = mh * scale

  let px = 0.5
  let py = 0.5
  if (!cropUiOpen && hasNormCropInsets(cropInsets) && !previewVideoContain) {
    const { top, left, right, bottom } = cropInsets
    px = left + (1 - left - right) / 2
    py = top + (1 - top - bottom) / 2
  }

  const imgLeft = px * (W - rw)
  const imgTop = py * (H - rh)

  const ix0 = Math.max(0, imgLeft)
  const iy0 = Math.max(0, imgTop)
  const ix1 = Math.min(W, imgLeft + rw)
  const iy1 = Math.min(H, imgTop + rh)
  const iw = ix1 - ix0
  const ih = iy1 - iy0

  if (iw < 1 || ih < 1) {
    return intersectPipSnapRectWithFrame(sr, frameEl, vl0, vt0, W, H)
  }

  return intersectPipSnapRectWithFrame(sr, frameEl, vl0 + ix0, vt0 + iy0, iw, ih)
}

function cacheBustedSrc(base: string, token: number): string {
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}t=${token}`
}

type RulerTick = { t: number; kind: 'label' | 'minor' }

/** Numeric labels every 5 seconds (m:ss); optional 1s minor ticks when duration ≤ 45s. */
function buildTimelineTicks(durationSec: number): RulerTick[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return []

  const map = new Map<number, 'label' | 'minor'>()

  for (let t = 0; t <= durationSec + 1e-9; t += 5) {
    const tt = Math.round(Math.min(t, durationSec) * 1000) / 1000
    map.set(tt, 'label')
  }

  if (durationSec <= 45) {
    const maxSec = Math.floor(durationSec + 1e-9)
    for (let i = 0; i <= maxSec; i++) {
      if (i % 5 === 0) continue
      const tt = Math.round(Math.min(i, durationSec) * 1000) / 1000
      if (!map.has(tt)) map.set(tt, 'minor')
    }
  }

  const end = Math.round(durationSec * 1000) / 1000
  if (!map.has(end)) map.set(end, 'label')

  return Array.from(map.entries())
    .map(([t, kind]) => ({ t, kind }))
    .sort((a, b) => a.t - b.t)
}

function formatRulerLabel(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Map time → horizontal % inside the filmstrip strip so labels line up with contiguous thumbs (tick marks stay linear). */
function filmstripAlignedLabelLeftPct(
  tSec: number,
  durationSec: number,
  thumbCount: number,
  layout: { w: number; gapPx: number } | null,
): number {
  const linearPct = (tSec / durationSec) * 100
  if (
    !layout ||
    layout.w <= 0 ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    thumbCount <= 0
  ) {
    return linearPct
  }
  const u = Math.min(1, Math.max(0, tSec / durationSec))
  const { w, gapPx } = layout
  const n = thumbCount
  const thumbW = (w - (n - 1) * gapPx) / n
  if (thumbW <= 0) return linearPct
  const k = Math.min(n - 1, Math.floor(u * n))
  const fracInCell = u * n - k
  const xPx = k * (thumbW + gapPx) + fracInCell * thumbW
  return (xPx / w) * 100
}

function isRulerLabelAtStart(tSec: number): boolean {
  return tSec <= 1e-4
}

function isRulerLabelAtEnd(tSec: number, durationSec: number): boolean {
  return durationSec > 0 && Math.abs(tSec - durationSec) <= 1e-3
}

export function VideoEditorView({ videoSrc, onDone, onDelete }: VideoEditorViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)
  const cropRefVideo = useRef<HTMLVideoElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  /** Ruler tick / label layout; scrub fallback when playhead overlay is not mounted yet. */
  const rulerInnerRef = useRef<HTMLDivElement>(null)
  /** Playhead slot uses `left: %` of this box — scrub geometry must match for cursor alignment. */
  const playheadRangeRef = useRef<HTMLDivElement>(null)
  const filmstripStripRef = useRef<HTMLDivElement>(null)
  const timelineScrubbingRef = useRef(false)
  /** True while pointer-drag scrubbing that began on the playhead tip (keep col-resize cursor). */
  const [scrubFromPlayheadTip, setScrubFromPlayheadTip] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [title, setTitle] = useState('NEW Consensus recorded video from FAB')
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [filmstrip, setFilmstrip] = useState<string[]>([])
  const [filmstripReady, setFilmstripReady] = useState(false)
  const [videoIntrinsicSize, setVideoIntrinsicSize] = useState<{ w: number; h: number } | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [pipHidden, setPipHidden] = useState(false)
  const [pipSize, setPipSize] = useState<PipSizeKey>('sm')
  const [pipClusterTranslate, setPipClusterTranslate] = useState({ x: 0, y: 0 })
  const pipClusterTranslateRef = useRef(pipClusterTranslate)
  const [pipAvatarDragActive, setPipAvatarDragActive] = useState(false)
  /** When the orb sits on the right half of the main video, pill + drag grip flip to the other side of the orb. */
  const [pipMirrorChrome, setPipMirrorChrome] = useState(false)
  const pipDragSessionRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    originX: number
    originY: number
  } | null>(null)
  const previewSurfaceRef = useRef<HTMLDivElement>(null)
  const pipClusterRef = useRef<HTMLDivElement>(null)
  const pipSnapRafRef = useRef<number | null>(null)
  const pipSnapHoverIdRef = useRef<PipSnapId | null>(null)
  const [pipSnapRings, setPipSnapRings] = useState<Array<{ id: PipSnapId; cx: number; cy: number; d: number }> | null>(
    null,
  )
  const [pipSnapHoverId, setPipSnapHoverId] = useState<PipSnapId | null>(null)
  const [pipSnapVideoDim, setPipSnapVideoDim] = useState<{
    l: number
    t: number
    w: number
    h: number
  } | null>(null)
  const [filmstripLayout, setFilmstripLayout] = useState<{ w: number; gapPx: number } | null>(null)
  const [cropUiOpen, setCropUiOpen] = useState(false)
  /** Preview main video: letterboxed contain vs cover (split control in transport pill). */
  const [previewVideoContain, setPreviewVideoContain] = useState(false)
  const [cropInsets, setCropInsets] = useState<CropInsets>({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  })
  const [cropLayout, setCropLayout] = useState<{
    vidL: number
    vidT: number
    vidW: number
    vidH: number
  } | null>(null)
  const [cropOverlayLayout, setCropOverlayLayout] = useState<CropOverlayLayout | null>(null)
  const videoFrameRef = useRef<HTMLDivElement>(null)
  const cropInsetsWhenOpenedRef = useRef<CropInsets>({ top: 0, left: 0, right: 0, bottom: 0 })
  const cropDragRef = useRef<{
    edge: CropEdge
    startClientX: number
    startClientY: number
    startInsets: CropInsets
  } | null>(null)
  /** Normalized trim on full timeline; kept playback region is [trimStartNorm, trimEndNorm]. */
  const [trimStartNorm, setTrimStartNorm] = useState(0)
  const [trimEndNorm, setTrimEndNorm] = useState(1)
  const trimLiveRef = useRef({ start: 0, end: 1 })
  const trimDragRef = useRef<'start' | 'end' | null>(null)
  const trimRailPointerDownRef = useRef<{ x: number; y: number; edge: 'start' | 'end' } | null>(null)
  /** After first layout pass; snap preview to trim-in / trim-out only when that edge actually moves. */
  const prevTrimStartForPreviewRef = useRef<number | null>(null)
  const prevTrimEndForPreviewRef = useRef<number | null>(null)
  const mediaSrc = cacheBustedSrc(videoSrc, reloadToken)

  useEffect(() => {
    pipClusterTranslateRef.current = pipClusterTranslate
  }, [pipClusterTranslate])

  useLayoutEffect(() => {
    if (loadError) {
      setPipMirrorChrome(false)
      return
    }

    const measure = () => {
      const surface = previewSurfaceRef.current
      const video = videoRef.current
      const cluster = pipClusterRef.current
      if (!surface || !video || !cluster) {
        setPipMirrorChrome(false)
        return
      }
      const pipOrb = cluster.querySelector('.video-editor__pip') as HTMLElement | null
      if (!pipOrb) {
        setPipMirrorChrome(false)
        return
      }
      const sr = surface.getBoundingClientRect()
      const vr = video.getBoundingClientRect()
      const pr = pipOrb.getBoundingClientRect()
      const acx = pr.left + pr.width / 2 - sr.left
      const midX = vr.left - sr.left + vr.width / 2
      setPipMirrorChrome(acx > midX)
    }

    measure()
    const surface = previewSurfaceRef.current
    const frame = videoFrameRef.current
    const video = videoRef.current
    const ro = new ResizeObserver(measure)
    if (surface) ro.observe(surface)
    if (frame) ro.observe(frame)
    if (video) ro.observe(video)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [
    loadError,
    pipClusterTranslate,
    pipHidden,
    pipSize,
    mediaSrc,
    cropUiOpen,
    videoIntrinsicSize,
    cropInsets,
    cropLayout,
    reloadToken,
  ])

  useEffect(() => {
    trimLiveRef.current = { start: trimStartNorm, end: trimEndNorm }
  }, [trimStartNorm, trimEndNorm])

  useLayoutEffect(() => {
    const v = videoRef.current
    if (!v || loadError || !Number.isFinite(duration) || duration <= 0) return
    const lo = Math.max(0, trimStartNorm * duration)
    const rawHi = trimEndNorm * duration
    const hi =
      Number.isFinite(v.duration) && v.duration > 0
        ? Math.min(rawHi, v.duration)
        : rawHi
    const prevStart = prevTrimStartForPreviewRef.current
    const prevEnd = prevTrimEndForPreviewRef.current
    const startChanged =
      prevStart !== null && Math.abs(trimStartNorm - prevStart) > 1e-9
    const endChanged =
      prevEnd !== null && Math.abs(trimEndNorm - prevEnd) > 1e-9
    prevTrimStartForPreviewRef.current = trimStartNorm
    prevTrimEndForPreviewRef.current = trimEndNorm

    if (startChanged) {
      const at = Math.min(lo, hi)
      v.currentTime = at
      setCurrentTime(at)
      return
    }

    if (endChanged) {
      const at = lo <= hi ? hi : lo
      v.currentTime = at
      setCurrentTime(at)
      return
    }

    const ct = v.currentTime
    if (ct < lo || ct > hi) {
      const next = Math.min(Math.max(lo, ct), hi)
      v.currentTime = next
      setCurrentTime(next)
    }
  }, [trimStartNorm, trimEndNorm, duration, loadError])

  useLayoutEffect(() => {
    const el = filmstripStripRef.current
    if (!el) return

    const measure = () => {
      const cs = getComputedStyle(el)
      const gapRaw = cs.columnGap || cs.gap || '0'
      const gapPx = Number.parseFloat(gapRaw) || 0
      const w = el.clientWidth
      setFilmstripLayout({ w, gapPx })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [filmstripReady, filmstrip.length])

  useLayoutEffect(() => {
    const frame = videoFrameRef.current
    const video = videoRef.current
    if (!frame || !video || loadError) {
      setCropLayout(null)
      return
    }

    const measure = () => {
      const fr = frame.getBoundingClientRect()
      const vr = video.getBoundingClientRect()
      if (fr.width < 1 || fr.height < 1 || vr.width < 1 || vr.height < 1) {
        setCropLayout(null)
        return
      }
      const next = {
        vidL: vr.left - fr.left,
        vidT: vr.top - fr.top,
        vidW: vr.width,
        vidH: vr.height,
      }
      setCropLayout((prev) => {
        if (
          prev != null &&
          Math.abs(prev.vidL - next.vidL) < 0.25 &&
          Math.abs(prev.vidT - next.vidT) < 0.25 &&
          Math.abs(prev.vidW - next.vidW) < 0.25 &&
          Math.abs(prev.vidH - next.vidH) < 0.25
        ) {
          return prev
        }
        return next
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(frame)
    ro.observe(video)
    const ghost = cropRefVideo.current
    if (ghost) ro.observe(ghost)
    return () => ro.disconnect()
  }, [loadError, mediaSrc, videoIntrinsicSize, cropUiOpen])

  useEffect(() => {
    if (!cropUiOpen) return
    const main = videoRef.current
    const ref = cropRefVideo.current
    if (!main || !ref) return

    const syncTime = () => {
      if (Math.abs(ref.currentTime - main.currentTime) > 0.08) {
        ref.currentTime = main.currentTime
      }
    }
    const syncPlayPause = () => {
      if (main.paused) ref.pause()
      else void ref.play().catch(() => undefined)
    }
    const syncHard = () => {
      ref.currentTime = main.currentTime
      ref.playbackRate = main.playbackRate
      syncPlayPause()
    }
    const onRate = () => {
      ref.playbackRate = main.playbackRate
    }

    syncHard()

    main.addEventListener('timeupdate', syncTime)
    main.addEventListener('seeked', syncHard)
    main.addEventListener('play', syncPlayPause)
    main.addEventListener('pause', syncPlayPause)
    main.addEventListener('ratechange', onRate)

    return () => {
      main.removeEventListener('timeupdate', syncTime)
      main.removeEventListener('seeked', syncHard)
      main.removeEventListener('play', syncPlayPause)
      main.removeEventListener('pause', syncPlayPause)
      main.removeEventListener('ratechange', onRate)
    }
  }, [cropUiOpen, mediaSrc])

  /** Bottom-left talking-head circle: follow main timeline (loop if shorter); audio when visible (not hidden). */
  useEffect(() => {
    if (loadError) return
    const main = videoRef.current
    const pip = pipVideoRef.current
    if (!main || !pip) return

    const pipActive = !pipHidden

    const pipTargetTime = () => {
      const pd = pip.duration
      if (!Number.isFinite(pd) || pd <= 0) return null
      const mt = main.currentTime
      return ((mt % pd) + pd) % pd
    }

    const hardSyncTime = () => {
      if (!pipActive) return
      const target = pipTargetTime()
      if (target != null) pip.currentTime = target
    }

    const softSyncTime = () => {
      if (!pipActive || main.paused) return
      const target = pipTargetTime()
      if (target == null) return
      if (Math.abs(pip.currentTime - target) > 0.25) pip.currentTime = target
    }

    const syncPlayPause = () => {
      if (!pipActive) {
        pip.pause()
        return
      }
      pip.playbackRate = main.playbackRate
      if (main.paused) {
        pip.pause()
        hardSyncTime()
      } else {
        hardSyncTime()
        void pip.play().catch(() => undefined)
      }
    }

    const onPipMeta = () => {
      hardSyncTime()
      syncPlayPause()
    }

    const onRate = () => {
      pip.playbackRate = main.playbackRate
    }

    pip.addEventListener('loadedmetadata', onPipMeta)

    main.addEventListener('play', syncPlayPause)
    main.addEventListener('pause', syncPlayPause)
    main.addEventListener('seeking', hardSyncTime)
    main.addEventListener('seeked', hardSyncTime)
    main.addEventListener('ratechange', onRate)
    main.addEventListener('timeupdate', softSyncTime)

    syncPlayPause()

    return () => {
      pip.removeEventListener('loadedmetadata', onPipMeta)
      main.removeEventListener('play', syncPlayPause)
      main.removeEventListener('pause', syncPlayPause)
      main.removeEventListener('seeking', hardSyncTime)
      main.removeEventListener('seeked', hardSyncTime)
      main.removeEventListener('ratechange', onRate)
      main.removeEventListener('timeupdate', softSyncTime)
    }
  }, [loadError, mediaSrc, pipHidden])

  const runPipSnapMeasure = useCallback(() => {
    const surface = previewSurfaceRef.current
    const video = videoRef.current
    const cluster = pipClusterRef.current
    if (!surface || !video || !cluster || loadError) {
      setPipSnapRings([])
      setPipSnapVideoDim(null)
      setPipSnapHoverId(null)
      pipSnapHoverIdRef.current = null
      return
    }
    const pipOrb = cluster.querySelector('.video-editor__pip') as HTMLElement | null
    const d = pipAvatarDiameterPx(pipHidden, pipSize)
    const sr = surface.getBoundingClientRect()
    const content = getPipSnapMainVideoRectInSurface(
      sr,
      video,
      videoFrameRef.current,
      videoIntrinsicSize,
      previewVideoContain,
      cropInsets,
      cropUiOpen,
    )
    if (!content) {
      setPipSnapRings([])
      setPipSnapVideoDim(null)
      setPipSnapHoverId(null)
      pipSnapHoverIdRef.current = null
      return
    }
    const { vl, vt, vw, vh } = content
    const minSide = 2 * PIP_SNAP_BORDER_INSET_PX + d
    if (vw < minSide || vh < minSide) {
      setPipSnapRings([])
      setPipSnapVideoDim(null)
      setPipSnapHoverId(null)
      pipSnapHoverIdRef.current = null
      return
    }
    const anchors = buildPipSnapAnchors(vl, vt, vw, vh, d)
    setPipSnapRings(anchors.map((a) => ({ id: a.id, cx: a.cx, cy: a.cy, d })))
    setPipSnapVideoDim({ l: vl, t: vt, w: vw, h: vh })
    if (!pipOrb) {
      pipSnapHoverIdRef.current = null
      setPipSnapHoverId(null)
      return
    }
    const pr = pipOrb.getBoundingClientRect()
    const acx = pr.left + pr.width / 2 - sr.left
    const acy = pr.top + pr.height / 2 - sr.top
    let hot: PipSnapId | null = null
    let best = PIP_SNAP_HIGHLIGHT_PX + 1
    for (const a of anchors) {
      const dist = Math.hypot(acx - a.cx, acy - a.cy)
      if (dist <= PIP_SNAP_HIGHLIGHT_PX && dist < best) {
        best = dist
        hot = a.id
      }
    }
    pipSnapHoverIdRef.current = hot
    setPipSnapHoverId(hot)
  }, [loadError, pipHidden, pipSize, previewVideoContain, videoIntrinsicSize, cropInsets, cropUiOpen])

  const schedulePipSnapMeasure = useCallback(() => {
    if (pipSnapRafRef.current != null) cancelAnimationFrame(pipSnapRafRef.current)
    pipSnapRafRef.current = window.requestAnimationFrame(() => {
      pipSnapRafRef.current = null
      runPipSnapMeasure()
    })
  }, [runPipSnapMeasure])

  const clearPipSnapOverlay = useCallback(() => {
    if (pipSnapRafRef.current != null) {
      cancelAnimationFrame(pipSnapRafRef.current)
      pipSnapRafRef.current = null
    }
    pipSnapHoverIdRef.current = null
    setPipSnapHoverId(null)
    setPipSnapRings(null)
    setPipSnapVideoDim(null)
  }, [])

  /** After crop / layout, preview geometry can change between frames — remeasure snap guides while dragging. */
  useLayoutEffect(() => {
    if (!pipAvatarDragActive || loadError || cropUiOpen) return

    const tick = () => {
      schedulePipSnapMeasure()
    }

    tick()

    const surface = previewSurfaceRef.current
    const frame = videoFrameRef.current
    const video = videoRef.current
    const ro = new ResizeObserver(tick)
    if (surface) ro.observe(surface)
    if (frame) ro.observe(frame)
    if (video) ro.observe(video)
    window.addEventListener('resize', tick)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', tick)
    }
  }, [
    pipAvatarDragActive,
    loadError,
    cropUiOpen,
    schedulePipSnapMeasure,
    cropInsets,
    previewVideoContain,
    videoIntrinsicSize,
  ])

  const onPipAvatarWrapPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const origin = pipClusterTranslateRef.current
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      pipDragSessionRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: origin.x,
        originY: origin.y,
      }
      setPipAvatarDragActive(true)
      schedulePipSnapMeasure()
    },
    [schedulePipSnapMeasure],
  )

  const onPipAvatarWrapPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = pipDragSessionRef.current
      if (!s || e.pointerId !== s.pointerId) return
      e.stopPropagation()
      const dx = e.clientX - s.startClientX
      const dy = e.clientY - s.startClientY
      const next = { x: s.originX + dx, y: s.originY + dy }
      pipClusterTranslateRef.current = next
      setPipClusterTranslate(next)
      schedulePipSnapMeasure()
    },
    [schedulePipSnapMeasure],
  )

  const onPipAvatarWrapPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = pipDragSessionRef.current
      if (!s || e.pointerId !== s.pointerId) return
      e.stopPropagation()

      const hot = pipSnapHoverIdRef.current
      const surface = previewSurfaceRef.current
      const video = videoRef.current
      const cluster = pipClusterRef.current
      let snapped = false
      if (hot && surface && video && cluster && !loadError) {
        const pipOrb = cluster.querySelector('.video-editor__pip') as HTMLElement | null
        if (pipOrb) {
          const d = pipAvatarDiameterPx(pipHidden, pipSize)
          const sr = surface.getBoundingClientRect()
          const snapRect = getPipSnapMainVideoRectInSurface(
            sr,
            video,
            videoFrameRef.current,
            videoIntrinsicSize,
            previewVideoContain,
            cropInsets,
            cropUiOpen,
          )
          if (snapRect) {
            const { vl, vt, vw, vh } = snapRect
            const minSide = 2 * PIP_SNAP_BORDER_INSET_PX + d
            if (vw >= minSide && vh >= minSide) {
              const anchors = buildPipSnapAnchors(vl, vt, vw, vh, d)
              const anchor = anchors.find((a) => a.id === hot)
              if (anchor) {
                const pr = pipOrb.getBoundingClientRect()
                const acx = pr.left + pr.width / 2 - sr.left
                const acy = pr.top + pr.height / 2 - sr.top
                const deltaX = anchor.cx - acx
                const deltaY = anchor.cy - acy
                const cur = pipClusterTranslateRef.current
                const nu = { x: cur.x + deltaX, y: cur.y + deltaY }
                pipClusterTranslateRef.current = nu
                setPipClusterTranslate(nu)
                snapped = true
              }
            }
          }
        }
      }

      if (!snapped) {
        const back = { x: s.originX, y: s.originY }
        pipClusterTranslateRef.current = back
        setPipClusterTranslate(back)
      }

      pipDragSessionRef.current = null
      setPipAvatarDragActive(false)
      clearPipSnapOverlay()
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    },
    [clearPipSnapOverlay, loadError, pipHidden, pipSize, previewVideoContain, videoIntrinsicSize, cropInsets, cropUiOpen],
  )

  const onPipAvatarWrapLostPointerCapture = useCallback(() => {
    const s = pipDragSessionRef.current
    if (s) {
      const back = { x: s.originX, y: s.originY }
      pipClusterTranslateRef.current = back
      setPipClusterTranslate(back)
    }
    pipDragSessionRef.current = null
    setPipAvatarDragActive(false)
    clearPipSnapOverlay()
  }, [clearPipSnapOverlay])

  const reloadVideoFile = useCallback(() => {
    setReloadToken((n) => n + 1)
    setLoadError(false)
    setDuration(0)
    setCurrentTime(0)
    setFilmstrip([])
    setFilmstripReady(false)
    setVideoIntrinsicSize(null)
    setPreviewPlaying(false)
    setTrimStartNorm(0)
    setTrimEndNorm(1)
    trimLiveRef.current = { start: 0, end: 1 }
    prevTrimStartForPreviewRef.current = null
    prevTrimEndForPreviewRef.current = null
    setCropUiOpen(false)
    setCropInsets({ top: 0, left: 0, right: 0, bottom: 0 })
    setCropLayout(null)
    setPipClusterTranslate({ x: 0, y: 0 })
    clearPipSnapOverlay()
  }, [clearPipSnapOverlay])

  const togglePreviewPlayback = useCallback(() => {
    const v = videoRef.current
    if (!v || loadError) return
    if (v.paused) void v.play()
    else v.pause()
  }, [loadError])

  const seekTo = useCallback((t: number) => {
    const el = videoRef.current
    if (!el) return
    const d =
      duration > 0 && Number.isFinite(duration)
        ? duration
        : Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : 0
    if (d <= 0) return
    const { start, end } = trimLiveRef.current
    const lo = Math.max(0, start * d)
    const rawHi = end * d
    const hi =
      Number.isFinite(el.duration) && el.duration > 0
        ? Math.min(rawHi, el.duration)
        : rawHi
    el.currentTime = Math.min(Math.max(lo, t), hi)
  }, [duration])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoadedMeta = () => {
      setDuration(video.duration || 0)
      setLoadError(false)
      const w = video.videoWidth
      const h = video.videoHeight
      if (w > 0 && h > 0) {
        setVideoIntrinsicSize({ w, h })
      }
    }
    const onTimeUpdate = () => {
      const d = video.duration
      if (!Number.isFinite(d) || d <= 0) {
        setCurrentTime(video.currentTime)
        return
      }
      // seekTo already clamps while dragging; avoid rewriting currentTime from stale samples mid-seek.
      if (timelineScrubbingRef.current) {
        setCurrentTime(video.currentTime)
        return
      }
      const { start, end } = trimLiveRef.current
      const lo = Math.max(0, start * d)
      const hi = Math.min(end * d, d)
      let ct = video.currentTime
      if (ct < lo) {
        video.currentTime = lo
        ct = lo
      } else if (ct > hi) {
        video.currentTime = hi
        ct = hi
        if (!video.paused) video.pause()
      }
      setCurrentTime(ct)
    }
    const onError = () => setLoadError(true)
    const onPlay = () => setPreviewPlaying(true)
    const onPause = () => setPreviewPlaying(false)

    video.addEventListener('loadedmetadata', onLoadedMeta)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('error', onError)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    setPreviewPlaying(!video.paused)

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMeta)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('error', onError)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [mediaSrc])

  useEffect(() => {
    const video = videoRef.current
    if (!video || loadError || !Number.isFinite(video.duration) || video.duration <= 0) {
      setFilmstrip([])
      setFilmstripReady(false)
      return
    }

    let cancelled = false
    const w = 88
    const h = 50
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setFilmstripReady(true)
      return
    }

    const prevTime = video.currentTime
    const wasPaused = video.paused

    void (async () => {
      const urls: string[] = []
      const d = video.duration
      for (let i = 0; i < FILMSTRIP_FRAMES; i++) {
        if (cancelled) return
        const t = d * (i + 0.5) / FILMSTRIP_FRAMES
        video.currentTime = t
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked)
            resolve()
          }
          video.addEventListener('seeked', onSeeked)
        })
        if (cancelled) return
        ctx.drawImage(video, 0, 0, w, h)
        urls.push(canvas.toDataURL('image/jpeg', 0.55))
      }
      video.currentTime = prevTime
      if (!wasPaused) void video.play()
      if (!cancelled) {
        setFilmstrip(urls)
        setFilmstripReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mediaSrc, loadError, duration])

  const scrollTimeline = (dir: -1 | 1) => {
    const strip = timelineRef.current
    if (!strip) return
    strip.scrollBy({ left: dir * 160, behavior: 'smooth' })
  }

  const seekFromClientX = useCallback(
    (clientX: number, clientY: number) => {
      const d = duration
      if (!d || d <= 0) return

      const rangeEl = playheadRangeRef.current
      let t: number
      if (rangeEl) {
        const trackEl = filmstripStripRef.current?.closest(
          '.video-editor__timeline-filmstrip-track',
        ) as HTMLElement | null
        const frameEl = filmstripStripRef.current?.closest(
          '.video-editor__timeline-filmstrip-frame',
        ) as HTMLElement | null

        if (trackEl && frameEl) {
          const fr = frameEl.getBoundingClientRect()
          const tr = trackEl.getBoundingClientRect()
          // Frame rect can be shorter than the clickable filmstrip row; use track for Y band.
          const inFilmstripTrackY =
            clientY >= tr.top - 2 && clientY <= tr.bottom + 2 && tr.width > 1e-6
          if (inFilmstripTrackY) {
            const railHalf = TRIM_RAIL_WIDTH_PX / 2
            // Trim rails are centered on frame edges (translateX(-50%)); thumbs run innerLeft → innerRight.
            const innerLeft = fr.left + railHalf
            const innerRight = fr.right - railHalf
            const innerW = innerRight - innerLeft
            const edgeSlopPx = 1
            const inFrameX =
              clientX >= fr.left - railHalf - edgeSlopPx &&
              clientX <= fr.right + railHalf + edgeSlopPx
            if (inFrameX && fr.width > 1e-6 && innerW > 1e-6) {
              const uRel = Math.min(1, Math.max(0, (clientX - innerLeft) / innerW))
              const { start, end } = trimLiveRef.current
              const span = end - start
              t = span > 1e-12 ? (start + uRel * span) * d : start * d
            } else if (inFrameX && fr.width > 1e-6) {
              const { start } = trimLiveRef.current
              t = start * d
            } else {
              const u = Math.min(1, Math.max(0, (clientX - tr.left) / tr.width))
              t = u * d
            }
          } else if (rangeEl) {
            const rr = rangeEl.getBoundingClientRect()
            if (rr.width <= 1e-6) return
            const u = Math.min(1, Math.max(0, (clientX - rr.left) / rr.width))
            t = u * d
          } else {
            return
          }
        } else {
          const refEl = trackEl ?? rangeEl
          const rr = refEl.getBoundingClientRect()
          if (rr.width <= 1e-6) return
          const u = Math.min(1, Math.max(0, (clientX - rr.left) / rr.width))
          t = u * d
        }
      } else {
        const inner = rulerInnerRef.current
        if (!inner) return
        const ruler = inner.querySelector<HTMLElement>('.video-editor__timeline-ruler')
        if (!ruler) return
        const w = ruler.scrollWidth
        if (w <= 0) return
        const r = ruler.getBoundingClientRect()
        t = ((clientX - r.left) / w) * d
      }

      seekTo(t)
    },
    [duration, seekTo, trimEndNorm, trimStartNorm],
  )

  const onFilmstripWheelPanScroll = (e: ReactWheelEvent<HTMLDivElement>) => {
    const el = timelineRef.current
    if (!el) return
    const dx = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0
    if (dx === 0) return
    el.scrollLeft += dx
    e.preventDefault()
  }

  const onTimelinePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!timelineScrubbingRef.current) return
    seekFromClientX(e.clientX, e.clientY)
  }

  const endTimelineScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!timelineScrubbingRef.current) return
    timelineScrubbingRef.current = false
    setScrubFromPlayheadTip(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const onTimelineStripLostPointerCapture = () => {
    timelineScrubbingRef.current = false
    setScrubFromPlayheadTip(false)
  }

  const applyTrimFromPointer = useCallback((edge: 'start' | 'end', clientX: number) => {
    const strip = filmstripStripRef.current
    if (!strip) return
    const track = strip.closest('.video-editor__timeline-filmstrip-track')
    if (!(track instanceof HTMLElement)) return
    const tr = track.getBoundingClientRect()
    const x = Math.min(Math.max(0, clientX - tr.left), tr.width)
    const u = tr.width > 0 ? x / tr.width : 0
    const { start, end } = trimLiveRef.current
    const minK = TRIM_MIN_KEEP

    if (edge === 'start') {
      const next = Math.min(Math.max(0, u), end - minK)
      trimLiveRef.current = { start: next, end }
      setTrimStartNorm(next)
    } else {
      const next = Math.max(Math.min(1, u), start + minK)
      trimLiveRef.current = { start, end: next }
      setTrimEndNorm(next)
    }

    const v = videoRef.current
    const d = duration
    if (v && d > 0) {
      const { start: s, end: e } = trimLiveRef.current
      const dCap = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : d
      const lo = Math.max(0, s * d)
      const hi = Math.min(e * d, dCap)
      let ct = v.currentTime
      if (ct < lo || ct > hi) {
        ct = Math.min(Math.max(lo, ct), hi)
        v.currentTime = ct
        setCurrentTime(ct)
      }
    }
  }, [duration])

  const onTrimRailPointerDown = (edge: 'start' | 'end', e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || loadError || duration <= 0) return
    e.preventDefault()
    e.stopPropagation()
    trimRailPointerDownRef.current = { x: e.clientX, y: e.clientY, edge }
    trimDragRef.current = edge
    e.currentTarget.setPointerCapture(e.pointerId)
    applyTrimFromPointer(edge, e.clientX)
  }

  const onTrimRailPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const edge = trimDragRef.current
    if (!edge) return
    e.preventDefault()
    applyTrimFromPointer(edge, e.clientX)
  }

  const onTrimRailPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const meta = trimRailPointerDownRef.current
    trimDragRef.current = null
    trimRailPointerDownRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    if (meta) {
      const dx = Math.abs(e.clientX - meta.x)
      const dy = Math.abs(e.clientY - meta.y)
      if (dx <= TRIM_RAIL_TAP_MAX_PX && dy <= TRIM_RAIL_TAP_MAX_PX) {
        scrollTimeline(meta.edge === 'start' ? -1 : 1)
      }
    }
  }

  const onTrimRailPointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    trimDragRef.current = null
    trimRailPointerDownRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const onTrimRailLostPointerCapture = () => {
    trimDragRef.current = null
    trimRailPointerDownRef.current = null
  }

  const onTimelinePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || loadError || duration <= 0) return
    const target = e.target
    if (target instanceof Element && target.closest('.video-editor__timeline-edge--trim-rail')) {
      return
    }
    const fromPlayheadTip =
      target instanceof Element &&
      (target.closest('.video-editor__timeline-playhead-tip') != null ||
        target.closest('.video-editor__timeline-playhead-above-filmstrip-hit') != null)
    timelineScrubbingRef.current = true
    setScrubFromPlayheadTip(fromPlayheadTip)
    e.currentTarget.setPointerCapture(e.pointerId)
    seekFromClientX(e.clientX, e.clientY)
  }

  const trimIsActive =
    trimStartNorm > 0.0005 || trimEndNorm < 0.9995

  const playheadPct =
    duration > 0 && Number.isFinite(currentTime)
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0

  const playheadTrackStyle = useMemo(
    (): CSSProperties => ({
      left: `${playheadPct}%`,
      transform: 'translateX(-50%)',
    }),
    [playheadPct],
  )

  const rulerTicks = useMemo(() => buildTimelineTicks(duration), [duration])

  const cropClipPath = useMemo(() => {
    const { top, right, bottom, left } = cropInsets
    if (top <= 1e-5 && right <= 1e-5 && bottom <= 1e-5 && left <= 1e-5) return undefined
    return `inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%)`
  }, [cropInsets])

  const previewSurfaceFullAspectStyle = useMemo((): CSSProperties | undefined => {
    if (loadError || !videoIntrinsicSize) return undefined
    const { w, h } = videoIntrinsicSize
    return { aspectRatio: `${w} / ${h}` } as CSSProperties
  }, [loadError, videoIntrinsicSize])

  const previewSurfaceCroppedAspectStyle = useMemo((): CSSProperties | undefined => {
    if (loadError || !videoIntrinsicSize) return undefined
    const { w, h } = videoIntrinsicSize
    const { top, left, right, bottom } = cropInsets
    const cw = w * (1 - left - right)
    const ch = h * (1 - top - bottom)
    const cropped =
      top > 1e-5 || bottom > 1e-5 || left > 1e-5 || right > 1e-5
    if (!cropped || cw <= 1 || ch <= 1) {
      return previewSurfaceFullAspectStyle
    }
    return { aspectRatio: `${cw} / ${ch}` } as CSSProperties
  }, [loadError, videoIntrinsicSize, cropInsets, previewSurfaceFullAspectStyle])

  const previewSurfaceAspectStyle = cropUiOpen
    ? previewSurfaceFullAspectStyle
    : previewSurfaceCroppedAspectStyle

  /** Matches the preview surface aspect for container-query sizing in CSS (see `VideoEditorView.css`). */
  const previewSurfaceFitVarsStyle = useMemo((): CSSProperties => {
    let aw = 16
    let ah = 9
    if (!loadError && videoIntrinsicSize) {
      if (cropUiOpen) {
        aw = videoIntrinsicSize.w
        ah = videoIntrinsicSize.h
      } else {
        const { w, h } = videoIntrinsicSize
        const { top, left, right, bottom } = cropInsets
        const cw = w * (1 - left - right)
        const ch = h * (1 - top - bottom)
        const cropped = top > 1e-5 || bottom > 1e-5 || left > 1e-5 || right > 1e-5
        if (cropped && cw > 1 && ch > 1) {
          aw = cw
          ah = ch
        } else {
          aw = w
          ah = h
        }
      }
    }
    return {
      ['--preview-fit-ar-w' as string]: String(aw),
      ['--preview-fit-ar-h' as string]: String(ah),
    }
  }, [loadError, videoIntrinsicSize, cropInsets, cropUiOpen])

  const videoStyle = useMemo((): CSSProperties | undefined => {
    if (!videoIntrinsicSize) return undefined
    const fit: CSSProperties['objectFit'] = previewVideoContain ? 'contain' : 'cover'
    const intrinsic = {
      ['--video-intrinsic-w']: `${videoIntrinsicSize.w}px`,
      ['--video-intrinsic-h']: `${videoIntrinsicSize.h}px`,
    } as CSSProperties
    if (!cropClipPath) return { ...intrinsic, objectFit: fit }
    if (cropUiOpen) {
      return {
        ...intrinsic,
        clipPath: cropClipPath,
        WebkitClipPath: cropClipPath,
        objectFit: fit,
      } as CSSProperties
    }
    const { top, left, right, bottom } = cropInsets
    const cx = (left + (1 - left - right) / 2) * 100
    const cy = (top + (1 - top - bottom) / 2) * 100
    return {
      ...intrinsic,
      objectFit: fit,
      objectPosition: previewVideoContain ? '50% 50%' : `${cx}% ${cy}%`,
    } as CSSProperties
  }, [videoIntrinsicSize, cropClipPath, cropInsets, cropUiOpen, previewVideoContain])

  const cropRefVideoStyle = useMemo((): CSSProperties | undefined => {
    if (!videoIntrinsicSize) return undefined
    return {
      ['--video-intrinsic-w']: `${videoIntrinsicSize.w}px`,
      ['--video-intrinsic-h']: `${videoIntrinsicSize.h}px`,
    } as CSSProperties
  }, [videoIntrinsicSize])

  const startTitleEdit = () => {
    setTitleDraft(title)
    setEditingTitle(true)
  }

  const commitTitle = () => {
    const next = titleDraft.trim()
    if (next) setTitle(next)
    setEditingTitle(false)
  }

  const bindCropHandlePointerDown = useCallback(
    (edge: CropEdge) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      cropDragRef.current = {
        edge,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startInsets: { ...cropInsets },
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [cropInsets],
  )

  const onCropHandlePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = cropDragRef.current
    if (!drag) return
    const video = videoRef.current
    if (!video) return
    const vr = video.getBoundingClientRect()
    const vidW = vr.width
    const vidH = vr.height
    if (vidW < 1e-6 || vidH < 1e-6) return
    const dx = (e.clientX - drag.startClientX) / vidW
    const dy = (e.clientY - drag.startClientY) / vidH
    const s = drag.startInsets
    const min = CROP_MIN_VISIBLE_FRAC
    const next: CropInsets = { ...s }

    if (drag.edge === 'top') {
      next.top = Math.min(Math.max(0, s.top + dy), 1 - s.bottom - min)
    } else if (drag.edge === 'bottom') {
      next.bottom = Math.min(Math.max(0, s.bottom - dy), 1 - s.top - min)
    } else if (drag.edge === 'left') {
      next.left = Math.min(Math.max(0, s.left + dx), 1 - s.right - min)
    } else {
      next.right = Math.min(Math.max(0, s.right - dx), 1 - s.left - min)
    }

    setCropInsets(next)
  }, [])

  const endCropHandleDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    cropDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }, [])

  const onCropHandleLostCapture = useCallback(() => {
    cropDragRef.current = null
  }, [])

  const measureCropHole = useCallback(() => {
    const el = videoFrameRef.current
    if (!el) {
      setCropOverlayLayout(null)
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) {
      setCropOverlayLayout(null)
      return
    }
    const b = CROP_SCRIM_HOLE_BLEED_PX
    const vw = window.innerWidth
    const vh = window.innerHeight
    const top = Math.max(0, r.top - b)
    const left = Math.max(0, r.left - b)
    const right = Math.min(vw, r.right + b)
    const bottom = Math.min(vh, r.bottom + b)
    const w = right - left
    const h = bottom - top
    if (w < 2 || h < 2) {
      setCropOverlayLayout(null)
      return
    }
    setCropOverlayLayout({
      scrimRect: { top, left, width: w, height: h },
      videoFrameRect: {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      },
    })
  }, [])

  useLayoutEffect(() => {
    if (!cropUiOpen || loadError) {
      setCropOverlayLayout(null)
      return
    }

    const scheduleMeasure = () => {
      requestAnimationFrame(() => {
        measureCropHole()
      })
    }

    scheduleMeasure()

    const frame = videoFrameRef.current
    const surface = previewSurfaceRef.current
    const ro = new ResizeObserver(scheduleMeasure)
    if (frame) ro.observe(frame)
    if (surface) ro.observe(surface)
    window.addEventListener('resize', scheduleMeasure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [cropUiOpen, loadError, measureCropHole, cropInsets, previewVideoContain, duration, mediaSrc])

  const openCropUi = useCallback(() => {
    cropInsetsWhenOpenedRef.current = { ...cropInsets }
    setPipAvatarDragActive(false)
    pipDragSessionRef.current = null
    clearPipSnapOverlay()
    setCropUiOpen(true)
  }, [cropInsets, clearPipSnapOverlay])

  const cancelCropUi = useCallback(() => {
    setCropInsets({ ...cropInsetsWhenOpenedRef.current })
    setCropUiOpen(false)
  }, [])

  const applyCropUi = useCallback(() => {
    setCropUiOpen(false)
  }, [])

  useEffect(() => {
    if (!cropUiOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelCropUi()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cropUiOpen, cancelCropUi])

  const filmstripViewportCssVars =
    duration > 0 && !loadError
      ? ({
          ['--trim-start' as string]: String(trimStartNorm),
          ['--trim-end' as string]: String(trimEndNorm),
        } as CSSProperties)
      : undefined

  return (
    <div className={`video-editor${cropUiOpen && !loadError ? ' video-editor--crop-mode' : ''}`}>
      <header className="video-editor__top">
        <div className="video-editor__title-block">
          {editingTitle ? (
            <input
              className="video-editor__title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              autoFocus
              aria-label="Simulation title"
            />
          ) : (
            <>
              <span className="video-editor__title">{title}</span>
              <button
                type="button"
                className="video-editor__icon-btn"
                onClick={startTitleEdit}
                aria-label="Edit title"
              >
                <EditOutlinedIcon fontSize="small" />
              </button>
            </>
          )}
        </div>
        <div className="video-editor__brand" aria-hidden>
          <VideocamOutlinedIcon className="video-editor__brand-icon" fontSize="medium" />
          <span className="video-editor__brand-text">Consensus SNAP</span>
        </div>
        <div className="video-editor__top-actions">
          <button
            type="button"
            className="video-editor__delete-session"
            onClick={onDelete}
            aria-label="Delete recording and exit editor"
          >
            <DeleteOutlinedIcon className="video-editor__delete-session-icon" fontSize="small" aria-hidden />
            Delete
          </button>
          <button type="button" className="video-editor__done" onClick={onDone}>
            Done Editing
          </button>
        </div>
      </header>

      <div
        className={`video-editor__preview-block${loadError ? ' video-editor__preview-block--error' : ''}`}
      >
        <div className="video-editor__preview-stage">
          <div
            ref={previewSurfaceRef}
            className={`video-editor__preview-surface${cropUiOpen && !loadError ? ' video-editor__preview-surface--crop-open' : ''}`}
            style={{ ...previewSurfaceFitVarsStyle, ...previewSurfaceAspectStyle }}
          >
          {loadError ? (
            <div className="video-editor__video-error">
              <p>Could not load video.</p>
              <p className="video-editor__video-error-hint">
                Add <code>preview.mp4</code> under <code>public/videos/</code> (served as{' '}
                <code>/videos/preview.mp4</code>). After adding or replacing the file, tap Reload video below.
              </p>
              <button type="button" className="video-editor__reload-fallback" onClick={reloadVideoFile}>
                Reload video
              </button>
            </div>
          ) : (
            <div className="video-editor__video-frame" ref={videoFrameRef}>
              <div className="video-editor__video-stack">
                {cropUiOpen && (
                  <video
                    key={`crop-ref-${mediaSrc}`}
                    ref={cropRefVideo}
                    className="video-editor__video video-editor__video--crop-ref"
                    src={mediaSrc}
                    muted
                    playsInline
                    preload="auto"
                    tabIndex={-1}
                    aria-hidden
                    style={cropRefVideoStyle}
                  />
                )}
                <video
                  key={mediaSrc}
                  ref={videoRef}
                  className="video-editor__video"
                  src={mediaSrc}
                  muted
                  playsInline
                  controls={false}
                  style={videoStyle}
                  onClick={() => {
                    const v = videoRef.current
                    if (!v) return
                    if (v.paused) void v.play()
                    else v.pause()
                  }}
                />
              </div>
              {cropUiOpen && cropLayout != null && (
                <div className="video-editor__crop-ui" aria-hidden>
                  <div
                    className="video-editor__crop-frame-wrap"
                    style={{
                      left: cropLayout.vidL + cropInsets.left * cropLayout.vidW,
                      top: cropLayout.vidT + cropInsets.top * cropLayout.vidH,
                      width: Math.max(
                        0,
                        cropLayout.vidW * (1 - cropInsets.left - cropInsets.right),
                      ),
                      height: Math.max(
                        0,
                        cropLayout.vidH * (1 - cropInsets.top - cropInsets.bottom),
                      ),
                    }}
                  >
                    <div className="video-editor__crop-spotlight-dim" />
                    <div className="video-editor__crop-spotlight-ring" />
                    {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
                      <button
                        key={edge}
                        type="button"
                        className={`video-editor__crop-handle video-editor__crop-handle--${edge}`}
                        aria-label={
                          edge === 'top'
                            ? 'Crop top edge'
                            : edge === 'bottom'
                              ? 'Crop bottom edge'
                              : edge === 'left'
                                ? 'Crop left edge'
                                : 'Crop right edge'
                        }
                        onPointerDown={bindCropHandlePointerDown(edge)}
                        onPointerMove={onCropHandlePointerMove}
                        onPointerUp={endCropHandleDrag}
                        onPointerCancel={endCropHandleDrag}
                        onLostPointerCapture={onCropHandleLostCapture}
                      >
                        <DragHandleIcon
                          sx={{
                            display: 'block',
                            fontSize: 14,
                            ...(edge === 'left' || edge === 'right'
                              ? { transform: 'rotate(90deg)' }
                              : {}),
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {pipAvatarDragActive && !loadError && !cropUiOpen && (
            <div className="video-editor__pip-snap-layer" aria-hidden>
              <div
                className="video-editor__pip-snap-dim"
                style={
                  pipSnapVideoDim
                    ? {
                        left: pipSnapVideoDim.l,
                        top: pipSnapVideoDim.t,
                        width: pipSnapVideoDim.w,
                        height: pipSnapVideoDim.h,
                      }
                    : { inset: 0 }
                }
              />
              {pipSnapRings?.map((ring) => (
                <div
                  key={ring.id}
                  className={
                    'video-editor__pip-snap-ring' +
                    (pipSnapHoverId === ring.id ? ' video-editor__pip-snap-ring--hot' : '')
                  }
                  style={{
                    left: ring.cx,
                    top: ring.cy,
                    width: ring.d,
                    height: ring.d,
                  }}
                />
              ))}
            </div>
          )}
          {!loadError && !cropUiOpen && (
            <div
              ref={pipClusterRef}
              className="video-editor__pip-cluster"
              style={{
                transform: `translate(${pipClusterTranslate.x}px, ${pipClusterTranslate.y}px)`,
              }}
            >
              <div
                className={
                  'video-editor__pip-hover-zone' +
                  (pipMirrorChrome ? ' video-editor__pip-hover-zone--mirror-chrome' : '')
                }
              >
                <div
                  className={
                    'video-editor__pip-avatar-wrap' +
                    (pipAvatarDragActive ? ' video-editor__pip-avatar-wrap--dragging' : '')
                  }
                  onPointerDown={onPipAvatarWrapPointerDown}
                  onPointerMove={onPipAvatarWrapPointerMove}
                  onPointerUp={onPipAvatarWrapPointerUp}
                  onPointerCancel={onPipAvatarWrapPointerUp}
                  onLostPointerCapture={onPipAvatarWrapLostPointerCapture}
                >
                  <div
                    className={
                      pipHidden ? 'video-editor__pip video-editor__pip--no-avatar' : 'video-editor__pip'
                    }
                    style={
                      pipHidden
                        ? undefined
                        : {
                            width: PIP_DIAMETER_PX[pipSize],
                            height: PIP_DIAMETER_PX[pipSize],
                          }
                    }
                    aria-label={pipHidden ? 'No avatar' : undefined}
                    aria-hidden={pipHidden ? undefined : true}
                  >
                    <video
                      ref={pipVideoRef}
                      className={
                        pipHidden
                          ? 'video-editor__pip-video video-editor__pip-video--hidden'
                          : 'video-editor__pip-video'
                      }
                      src={TALKING_HEAD_VIDEO_SRC}
                      playsInline
                      muted={pipHidden}
                      preload="auto"
                      controls={false}
                      tabIndex={-1}
                    />
                    {pipHidden && (
                      <div className="video-editor__pip-no-avatar-fill" aria-hidden>
                        <NoAccountsOutlinedIcon />
                      </div>
                    )}
                    <span className="video-editor__pip-drag-hint" aria-hidden>
                      <DragIndicatorIcon sx={{ fontSize: 20, color: 'rgba(255, 255, 255, 0.92)' }} />
                    </span>
                  </div>
                </div>
                <div
                  className={`video-editor__pip-pill${pipHidden ? ' video-editor__pip-pill--avatar-off' : ''}`}
                  role="toolbar"
                  aria-label="Talking head preview"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {!pipHidden && (
                    <>
                      <button
                        type="button"
                        className="video-editor__pip-pill-btn"
                        aria-label="No avatar"
                        aria-pressed={pipHidden}
                        title="No avatar"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPipHidden(true)
                        }}
                      >
                        <NoAccountsOutlinedIcon sx={{ fontSize: 19 }} />
                      </button>
                      <span className="video-editor__pip-pill-divider" aria-hidden />
                    </>
                  )}
                  {(['sm', 'md', 'lg'] as const).map((sz) => (
                    <Tooltip
                      key={sz}
                      title={sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : 'Large'}
                      placement="top"
                      disableInteractive
                      enterDelay={400}
                      enterNextDelay={400}
                    >
                      <button
                        type="button"
                        className="video-editor__pip-pill-btn"
                        aria-label={
                          sz === 'sm'
                            ? 'Small talking head'
                            : sz === 'md'
                              ? 'Medium talking head'
                              : 'Large talking head'
                        }
                        aria-pressed={!pipHidden && pipSize === sz}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPipHidden(false)
                          setPipSize(sz)
                        }}
                      >
                        <AccountCircleIcon sx={PIP_ACCOUNT_ICON_SX[sz]} />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="video-editor__transport-timeline-stack">
        <div className="video-editor__preview-transport">
          <div className="video-editor__preview-transport-pill" role="group" aria-label="Preview playback">
            <div className="video-editor__preview-transport-time" aria-live="polite">
              <span className="video-editor__time video-editor__time--elapsed">{formatClock(currentTime)}</span>
              <span className="video-editor__time video-editor__time-sep" aria-hidden>
                /
              </span>
              <span className="video-editor__time video-editor__time--total">{formatClock(duration)}</span>
            </div>
            <Tooltip
              title={previewPlaying ? 'Pause preview' : 'Play preview'}
              placement="top"
              disableInteractive
              enterDelay={400}
            >
              <span className="video-editor__play-btn-tooltip-wrap">
                <button
                  type="button"
                  className="video-editor__play-btn"
                  aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
                  aria-pressed={previewPlaying}
                  disabled={loadError || duration <= 0}
                  onClick={togglePreviewPlayback}
                >
                  {previewPlaying ? (
                    <PauseRoundedIcon className="video-editor__play-btn-icon" fontSize="inherit" />
                  ) : (
                    <PlayArrowRoundedIcon className="video-editor__play-btn-icon" fontSize="inherit" />
                  )}
                </button>
              </span>
            </Tooltip>
            <div className="video-editor__preview-transport-actions">
              <Tooltip title="Split frame" placement="top" disableInteractive enterDelay={400}>
                <span className="video-editor__transport-tooltip-hit">
                  <button
                    type="button"
                    className={
                      'video-editor__transport-round-btn' +
                      (previewVideoContain ? ' video-editor__transport-round-btn--active' : '')
                    }
                    aria-label="Split frame"
                    aria-pressed={previewVideoContain}
                    disabled={loadError}
                    onClick={() => setPreviewVideoContain((v) => !v)}
                  >
                    <span
                      className="video-editor__split-scene-icon"
                      aria-hidden
                      dangerouslySetInnerHTML={{ __html: splitSceneSvgRaw }}
                    />
                  </button>
                </span>
              </Tooltip>
              <span className="video-editor__transport-actions-pipe" aria-hidden />
              <Tooltip title={cropUiOpen ? 'Cancel crop' : 'Crop video'} placement="top" disableInteractive enterDelay={400}>
                <span className="video-editor__transport-tooltip-hit">
                  <button
                    type="button"
                    className={
                      'video-editor__transport-round-btn' +
                      (cropUiOpen ? ' video-editor__transport-round-btn--active' : '')
                    }
                    aria-label={cropUiOpen ? 'Cancel crop' : 'Crop video'}
                    aria-pressed={cropUiOpen}
                    disabled={loadError}
                    onClick={() => {
                      if (loadError) return
                      if (cropUiOpen) cancelCropUi()
                      else openCropUi()
                    }}
                  >
                    <CropIcon sx={{ fontSize: 17 }} />
                  </button>
                </span>
              </Tooltip>
            </div>
          </div>
        </div>

      <div className="video-editor__timeline-row">
          <div className="video-editor__timeline-shell video-editor__timeline-shell--stacked">
            <div className="video-editor__timeline-band">
              <div
                className={
                  'video-editor__timeline-strip-wrap' +
                  (scrubFromPlayheadTip ? ' video-editor__timeline-strip-wrap--scrub-playhead-tip' : '')
                }
                role="slider"
                tabIndex={loadError || duration <= 0 ? -1 : 0}
                aria-label="Video timeline scrubber"
                aria-valuemin={
                  duration > 0 ? Math.round(trimStartNorm * duration * 1000) / 1000 : 0
                }
                aria-valuemax={
                  duration > 0 ? Math.round(trimEndNorm * duration * 1000) / 1000 : 0
                }
                aria-valuenow={Math.round(currentTime * 1000) / 1000}
                aria-disabled={loadError || duration <= 0}
                onPointerDown={onTimelinePointerDown}
                onPointerMove={onTimelinePointerMove}
                onPointerUp={endTimelineScrub}
                onPointerCancel={endTimelineScrub}
                onLostPointerCapture={onTimelineStripLostPointerCapture}
                onKeyDown={(e) => {
                  if (loadError || duration <= 0) return
                  const step = e.shiftKey ? 5 : 1
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    seekTo(currentTime - step)
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    seekTo(currentTime + step)
                  } else if (e.key === 'Home') {
                    e.preventDefault()
                    seekTo(0)
                  } else if (e.key === 'End') {
                    e.preventDefault()
                    seekTo(duration)
                  }
                }}
              >
                <div className="video-editor__timeline-scroll-col video-editor__timeline-playhead-scope">
                  <div className="video-editor__timeline-bottom-strip">
                    <div
                      className="video-editor__timeline-ruler-stack"
                      onWheel={onFilmstripWheelPanScroll}
                    >
                      <div ref={timelineRef} className="video-editor__timeline-ruler-scroll">
                        <div className="video-editor__timeline-ruler-track">
                          <div ref={rulerInnerRef} className="video-editor__timeline-ruler-inner">
                            {duration > 0 ? (
                              <div className="video-editor__timeline-ruler" aria-hidden>
                                {rulerTicks.map((tick) => (
                                  <div
                                    key={`${tick.kind}-${tick.t}`}
                                    className={`video-editor__timeline-ruler-tick video-editor__timeline-ruler-tick--${tick.kind}`}
                                    style={{ left: `${(tick.t / duration) * 100}%` }}
                                  >
                                    <span className="video-editor__timeline-ruler-mark" />
                                  </div>
                                ))}
                                {rulerTicks
                                  .filter((tick) => tick.kind === 'label')
                                  .map((tick) => {
                                    const atStart = isRulerLabelAtStart(tick.t)
                                    const atEnd = isRulerLabelAtEnd(tick.t, duration)
                                    const cls =
                                      `video-editor__timeline-ruler-label` +
                                      (atStart ? ' video-editor__timeline-ruler-label--start' : '') +
                                      (atEnd ? ' video-editor__timeline-ruler-label--end' : '')
                                    return (
                                      <span
                                        key={`ruler-lbl-${tick.t}`}
                                        className={cls}
                                        style={{
                                          left: `${filmstripAlignedLabelLeftPct(
                                            tick.t,
                                            duration,
                                            FILMSTRIP_FRAMES,
                                            filmstripLayout,
                                          )}%`,
                                        }}
                                      >
                                        {formatRulerLabel(tick.t)}
                                      </span>
                                    )
                                  })}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      className="video-editor__timeline-filmstrip-viewport"
                      onWheel={onFilmstripWheelPanScroll}
                    >
                      <div
                        className="video-editor__timeline-filmstrip-track"
                        style={filmstripViewportCssVars}
                      >
                        <div
                          className={`video-editor__timeline-filmstrip-frame${
                            trimIsActive ? ' video-editor__timeline-filmstrip-frame--trim-active' : ''
                          }`}
                        >
                          <div className="video-editor__timeline-filmstrip-sizer">
                            <div className="video-editor__timeline-panel">
                              <div className="video-editor__timeline-filmstrip-thumbs-clip">
                                <div
                                  ref={filmstripStripRef}
                                  className="video-editor__timeline-strip"
                                >
                                {!filmstripReady && !loadError ? (
                                  <div className="video-editor__timeline-loading">Loading preview…</div>
                                ) : (
                                  filmstrip.map((src, thumbIdx) => (
                                    <div
                                      key={`thumb-${thumbIdx}`}
                                      className="video-editor__thumb"
                                      style={{ backgroundImage: `url(${src})` }}
                                      aria-hidden
                                    />
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                          {duration > 0 && !loadError ? (
                            <>
                              <button
                                type="button"
                                className={`video-editor__timeline-edge video-editor__timeline-edge--prev video-editor__timeline-edge--trim-rail${
                                  trimIsActive ? ' video-editor__timeline-edge--trim-active' : ''
                                }`}
                                aria-label="Trim clip start, or tap to scroll timeline left"
                                onPointerDown={(e) => onTrimRailPointerDown('start', e)}
                                onPointerMove={onTrimRailPointerMove}
                                onPointerUp={onTrimRailPointerUp}
                                onPointerCancel={onTrimRailPointerCancel}
                                onLostPointerCapture={onTrimRailLostPointerCapture}
                              >
                                <DragHandleIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
                              </button>
                              <button
                                type="button"
                                className={`video-editor__timeline-edge video-editor__timeline-edge--next video-editor__timeline-edge--trim-rail${
                                  trimIsActive ? ' video-editor__timeline-edge--trim-active' : ''
                                }`}
                                aria-label="Trim clip end, or tap to scroll timeline right"
                                onPointerDown={(e) => onTrimRailPointerDown('end', e)}
                                onPointerMove={onTrimRailPointerMove}
                                onPointerUp={onTrimRailPointerUp}
                                onPointerCancel={onTrimRailPointerCancel}
                                onLostPointerCapture={onTrimRailLostPointerCapture}
                              >
                                <DragHandleIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {filmstripReady && duration > 0 ? (
                      <div ref={playheadRangeRef} className="video-editor__timeline-playhead-range" aria-hidden>
                        <div
                          className="video-editor__timeline-playhead-above-filmstrip-hit"
                          style={playheadTrackStyle}
                          aria-hidden
                          onWheel={onFilmstripWheelPanScroll}
                        />
                        <div className="video-editor__timeline-playhead-slot" style={playheadTrackStyle}>
                          <div className="video-editor__timeline-playhead-bar" />
                        </div>
                        <div className="video-editor__timeline-playhead-tip-slot" style={playheadTrackStyle}>
                          <div className="video-editor__timeline-playhead-tip" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {cropUiOpen &&
        !loadError &&
        cropOverlayLayout != null &&
        cropOverlayLayout.scrimRect.width > 2 &&
        cropOverlayLayout.scrimRect.height > 2 && (
          <>
            <div className="video-editor__crop-scrim" aria-hidden>
              <div
                className="video-editor__crop-mode-dim video-editor__crop-mode-dim--top"
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  height: `${cropOverlayLayout.scrimRect.top}px`,
                }}
              />
              <div
                className="video-editor__crop-mode-dim video-editor__crop-mode-dim--left"
                style={{
                  top: `${cropOverlayLayout.scrimRect.top}px`,
                  left: 0,
                  width: `${cropOverlayLayout.scrimRect.left}px`,
                  height: `${cropOverlayLayout.scrimRect.height}px`,
                }}
              />
              <div
                className="video-editor__crop-mode-dim video-editor__crop-mode-dim--right"
                style={{
                  top: `${cropOverlayLayout.scrimRect.top}px`,
                  left: `${cropOverlayLayout.scrimRect.left + cropOverlayLayout.scrimRect.width}px`,
                  right: 0,
                  height: `${cropOverlayLayout.scrimRect.height}px`,
                }}
              />
              <div
                className="video-editor__crop-mode-dim video-editor__crop-mode-dim--bottom"
                style={{
                  top: `${cropOverlayLayout.scrimRect.top + cropOverlayLayout.scrimRect.height}px`,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
            </div>
            <div
              className="video-editor__crop-mode-actions"
              role="group"
              aria-label="Crop video controls"
              style={{
                left: `${cropOverlayLayout.videoFrameRect.left}px`,
                width: `${cropOverlayLayout.videoFrameRect.width}px`,
                top: `${
                  cropOverlayLayout.videoFrameRect.top +
                  cropOverlayLayout.videoFrameRect.height +
                  CROP_MODE_ACTIONS_BELOW_VIDEO_PX
                }px`,
              }}
            >
              <button type="button" className="video-editor__crop-mode-cancel" onClick={cancelCropUi}>
                Cancel
              </button>
              <button type="button" className="video-editor__crop-mode-apply" onClick={applyCropUi}>
                Crop video
              </button>
            </div>
          </>
        )}
    </div>
  )
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
