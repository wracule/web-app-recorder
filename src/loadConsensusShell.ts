import { DEFAULT_SHELL_PAGE, SHELL_PAGES, type ShellPageId } from './shellPages'

export const CONSENSUS_SHELL_ROOT_ID = 'consensus-app-root'
const SHELL_STYLE_ATTR = 'data-consensus-shell-style'

export async function loadConsensusShell(pageId: ShellPageId = DEFAULT_SHELL_PAGE): Promise<HTMLElement> {
  const root = document.getElementById(CONSENSUS_SHELL_ROOT_ID)
  if (!root) {
    throw new Error(`Missing #${CONSENSUS_SHELL_ROOT_ID}`)
  }

  const shellFile = SHELL_PAGES[pageId].shellFile
  const response = await fetch(`${import.meta.env.BASE_URL}${shellFile}`)
  if (!response.ok) {
    throw new Error(`Failed to load shell "${shellFile}" (${response.status})`)
  }

  const html = await response.text()
  const parsed = new DOMParser().parseFromString(html, 'text/html')

  applyShellStyles(parsed)

  root.replaceChildren()
  appendParsedShellContent(parsed, root)

  root.querySelector('#web-app-recorder-shell-bridge')?.remove()

  return root
}

function clearShellStyles() {
  document.getElementById('consensus-shell-styles')?.remove()
  document.head.querySelectorAll(`[${SHELL_STYLE_ATTR}]`).forEach((node) => node.remove())
}

function applyShellStyles(parsed: Document) {
  clearShellStyles()

  parsed.querySelectorAll('style, link[rel="stylesheet"], link[rel=stylesheet]').forEach((node) => {
    const clone = node.cloneNode(true)
    if (clone instanceof HTMLElement) {
      clone.setAttribute(SHELL_STYLE_ATTR, 'true')
    }
    document.head.appendChild(clone)
  })
}

function isShellStyleNode(node: Node): boolean {
  if (!(node instanceof Element)) return false
  if (node.tagName === 'STYLE') return true
  return node.tagName === 'LINK' && node.getAttribute('rel')?.toLowerCase() === 'stylesheet'
}

function appendParsedShellContent(doc: Document, root: HTMLElement) {
  const body = doc.body
  if (body && body.childNodes.length > 0) {
    while (body.firstChild) {
      const child = body.firstChild
      if (isShellStyleNode(child)) {
        body.removeChild(child)
        continue
      }
      root.appendChild(child)
    }
    return
  }

  for (const child of Array.from(doc.documentElement.children)) {
    const tag = child.tagName
    if (tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE') continue
    if (tag === 'LINK' && child.getAttribute('rel')?.toLowerCase() === 'stylesheet') continue
    root.appendChild(child.cloneNode(true))
  }
}
