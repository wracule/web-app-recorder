import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type DeviceMenuPortalProps = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  menuRef: RefObject<HTMLDivElement | null>
  className: string
  role: string
  'aria-label': string
  children: ReactNode
}

function measureMenuPosition(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect()
  const minWidth = 300
  const margin = 12
  let left = rect.left
  if (left + minWidth > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - minWidth - margin)
  }
  return {
    position: 'fixed',
    left,
    bottom: window.innerHeight - rect.top + 8,
    visibility: 'visible',
  }
}

export function DeviceMenuPortal({
  open,
  anchorRef,
  menuRef,
  className,
  role,
  'aria-label': ariaLabel,
  children,
}: DeviceMenuPortalProps) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return

    const update = () => {
      if (!anchorRef.current) return
      setStyle(measureMenuPosition(anchorRef.current))
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  if (!open) return null

  return createPortal(
    <div ref={menuRef} className={className} style={style} role={role} aria-label={ariaLabel}>
      {children}
    </div>,
    document.body,
  )
}
