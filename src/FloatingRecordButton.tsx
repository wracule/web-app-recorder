import { useLayoutEffect, useState } from 'react'
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'

type FloatingRecordButtonProps = {
  onLaunch: () => void
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
        onClick={onLaunch}
        aria-label="Record video"
      >
        <span className="web-app-recorder-fab__label">Record</span>
        <span className="web-app-recorder-fab__icon-wrap" aria-hidden>
          <RadioButtonCheckedIcon className="web-app-recorder-fab__icon" />
        </span>
        <span className="web-app-recorder-fab__tooltip" role="tooltip">
          Record &amp; share video
        </span>
      </button>
    </div>
  )
}
