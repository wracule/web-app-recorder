import { useLayoutEffect, useState } from 'react'
import type { DisplayCaptureSurfaceKind } from './displayCaptureLabel'
import {
  getDisplayCaptureFriendlyLabel,
  getScreenCaptureSurfaceKind,
  hasReadableNativeDisplayCaptureLabel,
} from './displayCaptureLabel'

const EMPTY_PRESENTATION: {
  friendlyLabel: string
  surfaceKind: DisplayCaptureSurfaceKind | undefined
} = {
  friendlyLabel: '',
  surfaceKind: undefined,
}

/**
 * Reads the display-capture video track label / settings for PiP UI.
 * Some browsers populate `track.label` shortly after `getDisplayMedia` resolves;
 * we poll briefly so the real tab/window/screen name can appear once the UA sets it.
 *
 * There is no standard API to read the share-picker title if the UA never exposes a
 * human-readable `label` (e.g. internal `web-contents-media-stream:` identifiers).
 */
export function useDisplayCapturePresentation(screenStream: MediaStream | null) {
  const [presentation, setPresentation] = useState(EMPTY_PRESENTATION)

  useLayoutEffect(() => {
    if (!screenStream) {
      setPresentation(EMPTY_PRESENTATION)
      return
    }
    const track = screenStream.getVideoTracks()[0]
    if (!track) {
      setPresentation(EMPTY_PRESENTATION)
      return
    }

    const commit = () => {
      const friendlyLabel = getDisplayCaptureFriendlyLabel(track)
      const surfaceKind = getScreenCaptureSurfaceKind(track)
      setPresentation((prev) => {
        if (prev.friendlyLabel === friendlyLabel && prev.surfaceKind === surfaceKind) {
          return prev
        }
        return { friendlyLabel, surfaceKind }
      })
    }

    commit()
    const rafId = requestAnimationFrame(commit)

    if (hasReadableNativeDisplayCaptureLabel(track)) {
      return () => cancelAnimationFrame(rafId)
    }

    let n = 0
    const POLL_MS = 280
    const MAX_POLLS = 16
    const intervalId = window.setInterval(() => {
      n += 1
      commit()
      if (hasReadableNativeDisplayCaptureLabel(track) || n >= MAX_POLLS) {
        window.clearInterval(intervalId)
      }
    }, POLL_MS)

    return () => {
      cancelAnimationFrame(rafId)
      window.clearInterval(intervalId)
    }
  }, [screenStream])

  return presentation
}
