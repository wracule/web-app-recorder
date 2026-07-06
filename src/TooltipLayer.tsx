import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

type TooltipLayerProps = {
  rootRef: RefObject<HTMLElement | null>
}

function measureTooltipPosition(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  return {
    position: 'fixed',
    left: centerX,
    bottom: window.innerHeight - rect.top + 8,
    transform: 'translateX(-50%) translateY(4px)',
    visibility: 'visible',
  }
}

function tooltipTargetFromEvent(root: HTMLElement, event: Event): HTMLElement | null {
  const el = (event.target as Element | null)?.closest<HTMLElement>('[data-tooltip]')
  if (!el || !root.contains(el)) return null
  const text = el.getAttribute('data-tooltip')
  if (!text) return null
  return el
}

export function TooltipLayer({ rootRef }: TooltipLayerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [text, setText] = useState('')
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [visible, setVisible] = useState(false)
  const activeAnchorRef = useRef<HTMLElement | null>(null)

  const showFor = useCallback((el: HTMLElement) => {
    const label = el.getAttribute('data-tooltip')
    if (!label) return
    activeAnchorRef.current = el
    setAnchor(el)
    setText(label)
  }, [])

  const hide = useCallback(() => {
    activeAnchorRef.current = null
    setVisible(false)
    setAnchor(null)
    setText('')
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const onMouseOver = (event: MouseEvent) => {
      const el = tooltipTargetFromEvent(root, event)
      if (!el) return
      showFor(el)
    }

    const onMouseOut = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest<HTMLElement>('[data-tooltip]')
      if (!el || el !== activeAnchorRef.current) return
      const related = event.relatedTarget as Node | null
      if (related && el.contains(related)) return
      hide()
    }

    const onFocusIn = (event: FocusEvent) => {
      const el = tooltipTargetFromEvent(root, event)
      if (!el) return
      showFor(el)
    }

    const onFocusOut = (event: FocusEvent) => {
      const el = (event.target as Element | null)?.closest<HTMLElement>('[data-tooltip]')
      if (!el || el !== activeAnchorRef.current) return
      const related = event.relatedTarget as Node | null
      if (related && el.contains(related)) return
      hide()
    }

    root.addEventListener('mouseover', onMouseOver)
    root.addEventListener('mouseout', onMouseOut)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)

    return () => {
      root.removeEventListener('mouseover', onMouseOver)
      root.removeEventListener('mouseout', onMouseOut)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
    }
  }, [rootRef, showFor, hide])

  useLayoutEffect(() => {
    if (!anchor) {
      setVisible(false)
      return
    }

    const update = () => {
      if (!activeAnchorRef.current) return
      setStyle(measureTooltipPosition(activeAnchorRef.current))
    }

    update()
    const frame = requestAnimationFrame(() => setVisible(true))
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor])

  if (!anchor || !text) return null

  return createPortal(
    <div
      className={
        'prototype-browser-window__tooltip prototype-browser-window__tooltip--portaled' +
        (visible ? ' prototype-browser-window__tooltip--portaled-visible' : '')
      }
      style={style}
      role="tooltip"
    >
      {text}
    </div>,
    document.body,
  )
}
