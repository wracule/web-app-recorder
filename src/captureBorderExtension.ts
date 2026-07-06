const EXTENSION_ID = import.meta.env.VITE_CAPTURE_BORDER_EXTENSION_ID as string | undefined

type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: { type: string; tabTitleHint?: string },
    responseCallback?: (response: { ok?: boolean }) => void,
  ) => void
  lastError?: { message?: string }
}

declare const chrome: { runtime?: ChromeRuntime } | undefined

function hasExtensionBridge(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime?.sendMessage === 'function' &&
    typeof EXTENSION_ID === 'string' &&
    EXTENSION_ID.length > 0
  )
}

function postToExtension(message: { type: string; tabTitleHint?: string }): void {
  if (!hasExtensionBridge()) return
  try {
    chrome!.runtime!.sendMessage(EXTENSION_ID!, message)
  } catch {
    /* extension unloaded or ID mismatch */
  }
}

export function isCaptureBorderExtensionConfigured(): boolean {
  return hasExtensionBridge()
}

export function startCaptureBorder(tabTitleHint?: string): void {
  postToExtension({
    type: 'CAPTURE_BORDER_START',
    tabTitleHint: tabTitleHint?.trim() ?? '',
  })
}

export function stopCaptureBorder(): void {
  postToExtension({ type: 'CAPTURE_BORDER_STOP' })
}
