import './create-options-popover.css'
import { navigateToShellPage } from './shellPages'

const CREATE_NAV_SELECTORS = [
  '[data-testid="menu-item-create"]',
  '[data-testid=menu-item-create]',
].join(', ')

const POPOVER_PANEL_SELECTOR = '[data-testid="popover-menu-panel"], [data-testid=popover-menu-panel]'
const SINGLE_EXPERIENCE_SELECTOR =
  '[data-testid="popover-menu-item-singleDemoCreate"], [data-testid=popover-menu-item-singleDemoCreate]'
const SCREEN_RECORDER_SELECTOR =
  '[data-testid="screen-recorder-link"], [data-testid=screen-recorder-link]'

export type CreateOptionsPopoverHandlers = {
  onScreenRecorderLaunch?: () => void
}

let popoverHost: HTMLDivElement | null = null
let backdrop: HTMLDivElement | null = null
let panel: HTMLElement | null = null
let anchor: Element | null = null
let visible = false
let loadPromise: Promise<void> | null = null
let handlers: CreateOptionsPopoverHandlers = {}

function getPanel(): HTMLElement | null {
  return panel ?? popoverHost?.querySelector<HTMLElement>(POPOVER_PANEL_SELECTOR) ?? null
}

async function ensurePopoverLoaded() {
  if (popoverHost) return
  if (!loadPromise) {
    loadPromise = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}create-options-popover.fragment.html`)
      if (!response.ok) {
        throw new Error(`Failed to load create options popover (${response.status})`)
      }

      const html = await response.text()

      backdrop = document.createElement('div')
      backdrop.className = 'web-app-recorder-create-popover-backdrop'
      backdrop.hidden = true
      backdrop.addEventListener('click', () => hideCreateOptionsPopover())

      popoverHost = document.createElement('div')
      popoverHost.className = 'web-app-recorder-create-popover-host'
      popoverHost.hidden = true
      popoverHost.innerHTML = html

      panel = getPanel()
      preparePopoverItems(popoverHost)

      document.body.append(backdrop, popoverHost)
    })()
  }

  await loadPromise
}

function preparePopoverItems(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    link.setAttribute('href', '#')
    link.removeAttribute('target')
    link.removeAttribute('rel')
  })
}

function getSingleExperienceOffsetY(panel: HTMLElement): number {
  const singleExperience = panel.querySelector<HTMLElement>(SINGLE_EXPERIENCE_SELECTOR)
  if (!singleExperience) return 0

  const panelRect = panel.getBoundingClientRect()
  const itemRect = singleExperience.getBoundingClientRect()
  return itemRect.top + itemRect.height / 2 - panelRect.top
}

function positionPopover(nextAnchor: Element) {
  const popoverPanel = getPanel()
  if (!popoverPanel) return

  const rect = nextAnchor.getBoundingClientRect()
  const anchorCenterY = rect.top + rect.height / 2
  const gap = 12
  const minArrowInset = 20

  popoverPanel.style.left = `${rect.right + gap}px`
  popoverPanel.style.top = '0px'
  popoverPanel.style.display = 'block'
  popoverPanel.style.visibility = 'hidden'

  const panelHeight = popoverPanel.getBoundingClientRect().height || popoverPanel.offsetHeight
  const singleExperienceOffsetY = getSingleExperienceOffsetY(popoverPanel)
  const clampPanelTop = (value: number) =>
    Math.max(8, Math.min(value, window.innerHeight - panelHeight - 8))

  // Align the Single Experience row (icon + label) with the + create nav item.
  let panelTop = clampPanelTop(anchorCenterY - singleExperienceOffsetY)
  let arrowTop = anchorCenterY - panelTop

  if (arrowTop < minArrowInset) {
    panelTop = clampPanelTop(anchorCenterY - minArrowInset)
    arrowTop = anchorCenterY - panelTop
  } else if (arrowTop > panelHeight - minArrowInset) {
    panelTop = clampPanelTop(anchorCenterY - (panelHeight - minArrowInset))
    arrowTop = anchorCenterY - panelTop
  }

  popoverPanel.style.top = `${panelTop}px`
  popoverPanel.style.setProperty('--web-app-recorder-create-popover-arrow-top', `${arrowTop}px`)
  popoverPanel.style.visibility = 'visible'
}

function handlePopoverClick(event: Event) {
  const target = event.target
  if (!(target instanceof Element) || !popoverHost?.contains(target)) return

  const screenRecorder = target.closest(SCREEN_RECORDER_SELECTOR)
  if (screenRecorder) {
    event.preventDefault()
    event.stopPropagation()
    hideCreateOptionsPopover()
    handlers.onScreenRecorderLaunch?.()
    return
  }

  const singleExperience = target.closest(SINGLE_EXPERIENCE_SELECTOR)
  if (singleExperience) {
    event.preventDefault()
    event.stopPropagation()
    hideCreateOptionsPopover()
    navigateToShellPage('discovery')
    return
  }

  const item = target.closest('.PopoverMenuList-module-menuItem-1ycrq')
  if (item) {
    event.preventDefault()
    event.stopPropagation()
    hideCreateOptionsPopover()
  }
}

export function hideCreateOptionsPopover() {
  visible = false
  anchor = null
  if (backdrop) backdrop.hidden = true
  if (popoverHost) popoverHost.hidden = true
}

export async function showCreateOptionsPopover(nextAnchor: Element) {
  await ensurePopoverLoaded()
  anchor = nextAnchor
  visible = true
  if (backdrop) backdrop.hidden = false
  if (popoverHost) popoverHost.hidden = false
  positionPopover(nextAnchor)
}

export async function toggleCreateOptionsPopover(nextAnchor: Element) {
  if (visible && anchor === nextAnchor) {
    hideCreateOptionsPopover()
    return
  }
  await showCreateOptionsPopover(nextAnchor)
}

export function bindCreateOptionsPopover(nextHandlers: CreateOptionsPopoverHandlers): () => void {
  handlers = nextHandlers

  const onDocumentClick = (event: Event) => {
    if (!visible) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (popoverHost?.contains(target)) return
    if (anchor instanceof Element && anchor.contains(target)) return
    hideCreateOptionsPopover()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hideCreateOptionsPopover()
  }

  const onResize = () => {
    if (visible && anchor) positionPopover(anchor)
  }

  const onPopoverHostClick = (event: Event) => {
    if (!popoverHost || popoverHost.hidden) return
    handlePopoverClick(event)
  }

  document.addEventListener('click', onPopoverHostClick, true)
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)

  return () => {
    document.removeEventListener('click', onPopoverHostClick, true)
    document.removeEventListener('click', onDocumentClick, true)
    document.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('resize', onResize)
    hideCreateOptionsPopover()
    backdrop?.remove()
    popoverHost?.remove()
    backdrop = null
    popoverHost = null
    panel = null
    loadPromise = null
  }
}

export function isCreateNavTarget(target: EventTarget | null, shellRoot: HTMLElement): Element | null {
  if (!(target instanceof Element) || !shellRoot.contains(target)) return null
  return target.closest(CREATE_NAV_SELECTORS)
}

export function prepareCreateNavControl(el: HTMLElement) {
  if (el.dataset.webAppRecorderCreateBound === 'true') return
  el.dataset.webAppRecorderCreateBound = 'true'

  if (el instanceof HTMLButtonElement) {
    el.type = 'button'
  }
}

export function prepareCreateNavControls(shellRoot: HTMLElement) {
  shellRoot.querySelectorAll<HTMLElement>(CREATE_NAV_SELECTORS).forEach(prepareCreateNavControl)
}
