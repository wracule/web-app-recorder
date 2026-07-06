/** Minimal types for the Document Picture-in-Picture API (Chromium). */
export interface DocumentPictureInPictureRequestWindowOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
  preferInitialWindowPlacement?: boolean
}

export interface DocumentPictureInPicture {
  readonly window: Window | null
  requestWindow(options?: DocumentPictureInPictureRequestWindowOptions): Promise<Window>
  addEventListener(type: 'enter', listener: () => void): void
  removeEventListener(type: 'enter', listener: () => void): void
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

export function isDocumentPictureInPictureSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

export function copyStyleSheetsToWindow(targetWindow: Window): void {
  const targetHead = targetWindow.document.head
  for (const sheet of document.styleSheets) {
    try {
      const rules = [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
      const style = targetWindow.document.createElement('style')
      style.textContent = rules
      targetHead.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = targetWindow.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        targetHead.appendChild(link)
      }
    }
  }
}

export async function requestDocumentPipWindow(
  options: DocumentPictureInPictureRequestWindowOptions,
): Promise<Window | null> {
  const api = window.documentPictureInPicture
  if (!api) return null
  const pipWindow = await api.requestWindow(options)
  copyStyleSheetsToWindow(pipWindow)
  const docEl = pipWindow.document.documentElement
  docEl.style.height = '100%'
  docEl.style.minHeight = '100%'
  pipWindow.document.body.style.margin = '0'
  pipWindow.document.body.style.minHeight = '100%'
  pipWindow.document.body.style.height = '100%'
  pipWindow.document.body.style.background = 'transparent'
  pipWindow.document.body.style.overflow = 'hidden'
  return pipWindow
}
