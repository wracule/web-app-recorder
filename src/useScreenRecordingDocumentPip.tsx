import { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScreenRecordingPipView, type ScreenRecordingPipViewProps } from './ScreenRecordingPipView'
import { requestDocumentPipWindow } from './documentPictureInPicture'

const PIP_WIDTH = 360
const PIP_HEIGHT = 300

export function useScreenRecordingDocumentPip(
  active: boolean,
  viewProps: ScreenRecordingPipViewProps,
  onPipClosed: () => void,
) {
  const rootRef = useRef<Root | null>(null)
  const pipWindowRef = useRef<Window | null>(null)
  const onPipClosedRef = useRef(onPipClosed)
  onPipClosedRef.current = onPipClosed

  const closePipWindow = () => {
    rootRef.current?.unmount()
    rootRef.current = null
    const pipWindow = pipWindowRef.current
    pipWindowRef.current = null
    pipWindow?.close()
  }

  useEffect(() => {
    if (!active) {
      closePipWindow()
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const pipWindow = await requestDocumentPipWindow({
          width: PIP_WIDTH,
          height: PIP_HEIGHT,
          disallowReturnToOpener: false,
        })
        if (!pipWindow) {
          onPipClosedRef.current()
          return
        }
        if (cancelled) {
          pipWindow.close()
          return
        }

        pipWindowRef.current = pipWindow
        const container = pipWindow.document.createElement('div')
        container.className = 'screen-recording-pip-root'
        pipWindow.document.body.appendChild(container)
        rootRef.current = createRoot(container)

        const handlePageHide = () => {
          rootRef.current?.unmount()
          rootRef.current = null
          pipWindowRef.current = null
          onPipClosedRef.current()
        }
        pipWindow.addEventListener('pagehide', handlePageHide)

        rootRef.current.render(
          <ScreenRecordingPipView {...viewProps} showCaptureThumbnail />,
        )
      } catch {
        onPipClosedRef.current()
      }
    })()

    return () => {
      cancelled = true
      closePipWindow()
    }
    // Open once when `active` flips true; prop updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    if (!active || !rootRef.current) return
    rootRef.current.render(
      <ScreenRecordingPipView {...viewProps} showCaptureThumbnail />,
    )
  }, [active, viewProps])

  return { closePipWindow }
}
