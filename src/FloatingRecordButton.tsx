import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const FAB_VIEWPORT_INSET = 8

function clampFabPosition(x: number, y: number, width: number, height: number) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxX = Math.max(FAB_VIEWPORT_INSET, viewportWidth - width - FAB_VIEWPORT_INSET)
  const maxY = Math.max(FAB_VIEWPORT_INSET, viewportHeight - height - FAB_VIEWPORT_INSET)
  return {
    x: Math.max(FAB_VIEWPORT_INSET, Math.min(maxX, x)),
    y: Math.max(FAB_VIEWPORT_INSET, Math.min(maxY, y)),
  }
}

function positionNeedsClamp(x: number, y: number, width: number, height: number) {
  const clamped = clampFabPosition(x, y, width, height)
  return Math.abs(clamped.x - x) > 0.5 || Math.abs(clamped.y - y) > 0.5
}

type FloatingRecordButtonProps = {
  onLaunch: () => void
  hidden?: boolean
}

export function FloatingRecordButton({ onLaunch, hidden }: FloatingRecordButtonProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerOffsetX: number
    pointerOffsetY: number
    width: number
    height: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  const enforceWithinViewport = useCallback(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const rect = wrapper.getBoundingClientRect()
    setPosition((current) => {
      const originX = current?.x ?? rect.left
      const originY = current?.y ?? rect.top
      const clamped = clampFabPosition(originX, originY, rect.width, rect.height)

      if (!current) {
        return positionNeedsClamp(rect.left, rect.top, rect.width, rect.height) ? clamped : null
      }

      if (clamped.x !== current.x || clamped.y !== current.y) return clamped
      return current
    })
  }, [])

  const stopDragging = useCallback(() => {
    dragStateRef.current = null
    setDragging(false)
    document.body.style.userSelect = ''
    window.requestAnimationFrame(() => {
      enforceWithinViewport()
    })
  }, [enforceWithinViewport])

  const onPointerMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current
    if (!dragState) return

    event.preventDefault()
    const next = clampFabPosition(
      event.clientX - dragState.pointerOffsetX,
      event.clientY - dragState.pointerOffsetY,
      dragState.width,
      dragState.height,
    )
    setPosition(next)
  }, [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopDragging)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDragging)
    }
  }, [dragging, onPointerMove, stopDragging])

  useEffect(
    () => () => {
      document.body.style.userSelect = ''
    },
    [],
  )

  useLayoutEffect(() => {
    if (hidden) return
    enforceWithinViewport()
  }, [hidden, enforceWithinViewport])

  useEffect(() => {
    if (hidden) return
    window.addEventListener('resize', enforceWithinViewport)
    return () => window.removeEventListener('resize', enforceWithinViewport)
  }, [hidden, enforceWithinViewport])

  const startDragging = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const rect = wrapper.getBoundingClientRect()
    const clamped = clampFabPosition(rect.left, rect.top, rect.width, rect.height)
    setPosition(clamped)
    dragStateRef.current = {
      pointerOffsetX: event.clientX - clamped.x,
      pointerOffsetY: event.clientY - clamped.y,
      width: rect.width,
      height: rect.height,
    }
    setDragging(true)
    document.body.style.userSelect = 'none'
    event.preventDefault()
  }, [])

  if (hidden) return null

  return (
    <div
      ref={wrapperRef}
      className={`web-app-recorder-fab-wrap${dragging ? ' is-dragging' : ''}`}
      style={position ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' } : undefined}
      onMouseEnter={() => {
        window.requestAnimationFrame(() => {
          enforceWithinViewport()
        })
      }}
    >
      <button
        type="button"
        className="web-app-recorder-fab-handle"
        onPointerDown={startDragging}
        aria-label="Reposition record button"
      >
        <DragIndicatorIcon className="web-app-recorder-fab-handle__icon" aria-hidden />
      </button>
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
