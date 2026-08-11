import { useLayoutEffect, useState } from 'react'
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'
import ScreenshotMonitorOutlinedIcon from '@mui/icons-material/ScreenshotMonitorOutlined'

export type RecordLaunchMode = 'camera' | 'screen'

const CAMERA_ICON_SRC = `${import.meta.env.BASE_URL}images/Record/camera-icon.png`

type FloatingRecordButtonProps = {
  onLaunch: (mode?: RecordLaunchMode) => void
  hidden?: boolean
}

const CONTENT_WRAPPER_SELECTORS = [
  '[data-testid="app-component"]',
  '#mainColumn [class*="contentWrapper"]',
  '#mainColumn',
] as const

function findContentWrapper(): HTMLElement | null {
  for (const selector of CONTENT_WRAPPER_SELECTORS) {
    const el = document.querySelector(selector)
    if (el instanceof HTMLElement) return el
  }
  return null
}

/** Align to content max-width edge; keep 8px when that edge is flush with the viewport. */
function contentEdgeInsetPx(): number {
  const wrapper = findContentWrapper()
  if (!wrapper) return 8

  const inset = Math.round(window.innerWidth - wrapper.getBoundingClientRect().right)
  return Math.max(8, inset)
}

export function FloatingRecordButton({ onLaunch, hidden }: FloatingRecordButtonProps) {
  const [rightPx, setRightPx] = useState(8)

  useLayoutEffect(() => {
    if (hidden) return

    const update = () => setRightPx(contentEdgeInsetPx())
    update()

    window.addEventListener('resize', update)

    const shellRoot = document.getElementById('consensus-app-root')
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (shellRoot && resizeObserver) resizeObserver.observe(shellRoot)

    const mutationObserver =
      shellRoot && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(update)
        : null
    mutationObserver?.observe(shellRoot!, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('resize', update)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [hidden])

  if (hidden) return null

  return (
    <div className="web-app-recorder-fab-wrap" style={{ right: rightPx }}>
      <button
        type="button"
        className="web-app-recorder-fab"
        onClick={() => onLaunch()}
        aria-label="Record & Share"
        aria-haspopup="menu"
      >
        <span className="web-app-recorder-fab__label">Record</span>
        <span className="web-app-recorder-fab__icon-wrap" aria-hidden>
          <RadioButtonCheckedIcon className="web-app-recorder-fab__icon" />
        </span>
        <span className="web-app-recorder-fab__tooltip" role="tooltip">
          Record &amp; Share
        </span>
      </button>

      <div className="web-app-recorder-fab-flyout" role="menu" aria-label="Record options">
        <button
          type="button"
          className="web-app-recorder-fab-flyout__btn"
          role="menuitem"
          aria-label="Record camera"
          onClick={() => onLaunch('camera')}
        >
          <img
            className="web-app-recorder-fab-flyout__camera-icon"
            src={CAMERA_ICON_SRC}
            alt=""
            width={22}
            height={22}
            decoding="async"
            draggable={false}
          />
          <span className="web-app-recorder-fab-flyout__tooltip" role="tooltip">
            Record camera
          </span>
        </button>
        <button
          type="button"
          className="web-app-recorder-fab-flyout__btn"
          role="menuitem"
          aria-label="Record screen"
          onClick={() => onLaunch('screen')}
        >
          <ScreenshotMonitorOutlinedIcon className="web-app-recorder-fab-flyout__icon" />
          <span className="web-app-recorder-fab-flyout__tooltip" role="tooltip">
            Record screen
          </span>
        </button>
      </div>
    </div>
  )
}
