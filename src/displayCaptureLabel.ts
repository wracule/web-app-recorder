/** Values from `MediaTrackSettings.displaySurface` for display capture (getDisplayMedia). */
export type DisplayCaptureSurfaceKind = 'browser' | 'window' | 'monitor'

function isObfuscatedDisplayCaptureLabel(label: string): boolean {
  const t = label.trim()
  if (!t) return true
  if (/web-contents-media-stream:/i.test(t)) return true
  if (/^chrome-extension:\/\//i.test(t)) return true
  if (/^moz-extension:\/\//i.test(t)) return true
  if (/^safari-web-extension:\/\//i.test(t)) return true
  if (/^blob:/i.test(t)) return true
  if (t.length > 120 && /^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return true
  return false
}

/** True when the UA set a non-empty, human-oriented `label` on the display-capture track. */
export function hasReadableNativeDisplayCaptureLabel(track: MediaStreamTrack | undefined): boolean {
  if (!track || track.kind !== 'video') return false
  const raw = (track.label ?? '').trim()
  return raw.length > 0 && !isObfuscatedDisplayCaptureLabel(raw)
}

export function getScreenCaptureSurfaceKind(
  track: MediaStreamTrack | undefined,
): DisplayCaptureSurfaceKind | undefined {
  if (!track || track.kind !== 'video') return undefined
  const s = track.getSettings().displaySurface
  if (s === 'browser' || s === 'window' || s === 'monitor') return s
  return undefined
}

/**
 * Human-readable name for what the user picked in the share dialog.
 * Prefer the track `label` when the UA exposes a real title; otherwise fall back
 * using `displaySurface` when the label is empty or an internal identifier.
 */
export function getDisplayCaptureFriendlyLabel(track: MediaStreamTrack | undefined): string {
  if (!track || track.kind !== 'video') return ''
  const raw = (track.label ?? '').trim()
  const surface = getScreenCaptureSurfaceKind(track)

  if (raw && !isObfuscatedDisplayCaptureLabel(raw)) {
    return raw
  }

  switch (surface) {
    case 'browser':
      return 'Selected tab'
    case 'window':
      return 'Selected window'
    case 'monitor':
      return 'Entire screen'
    default:
      break
  }

  if (raw) return 'Shared source'
  return ''
}
