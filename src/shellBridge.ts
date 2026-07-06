import {
  isCreateNavTarget,
  prepareCreateNavControls,
  toggleCreateOptionsPopover,
} from './createOptionsPopover'
import { CONSENSUS_SHELL_ROOT_ID } from './loadConsensusShell'

export const RECORDER_OPEN_MESSAGE_TYPE = 'consensus-web-app-recorder:open'
export const RECORDER_OPEN_EVENT = 'consensus-web-app-recorder:open'

/** Matches saved Consensus HTML (`data-testid` is often unquoted). */
const RECORD_LAUNCH_SELECTORS = [
  '[data-testid="record-new-screenrecorder"]',
  '[data-testid=record-new-screenrecorder]',
  'button[aria-label*="record new" i]',
].join(', ')

const DASHBOARD_NAV_SELECTORS = [
  '[data-testid="menu-item-Dashboard"]',
  '[data-testid=menu-item-Dashboard]',
].join(', ')

function getShellRoot(): HTMLElement | null {
  const root = document.getElementById(CONSENSUS_SHELL_ROOT_ID)
  return root instanceof HTMLElement ? root : null
}

function isRecordNewLaunchTarget(target: EventTarget | null, shellRoot: HTMLElement): Element | null {
  if (!(target instanceof Element) || !shellRoot.contains(target)) return null
  return target.closest(RECORD_LAUNCH_SELECTORS)
}

function isDashboardNavTarget(target: EventTarget | null, shellRoot: HTMLElement): Element | null {
  if (!(target instanceof Element) || !shellRoot.contains(target)) return null
  return target.closest(DASHBOARD_NAV_SELECTORS)
}

function prepareShellRecordControl(el: HTMLElement) {
  if (el.dataset.webAppRecorderBound === 'true') return
  el.dataset.webAppRecorderBound = 'true'

  if (el instanceof HTMLAnchorElement) {
    el.setAttribute('href', '#')
    el.removeAttribute('target')
    el.removeAttribute('rel')
  }

  if (el instanceof HTMLButtonElement) {
    el.type = 'button'
  }
}

function prepareShellRecordControls(shellRoot: HTMLElement) {
  shellRoot.querySelectorAll<HTMLElement>(RECORD_LAUNCH_SELECTORS).forEach(prepareShellRecordControl)
}

function prepareDashboardNavControl(el: HTMLElement) {
  if (el.dataset.webAppRecorderDashboardBound === 'true') return
  el.dataset.webAppRecorderDashboardBound = 'true'

  if (el instanceof HTMLAnchorElement) {
    el.setAttribute('href', '#')
    el.removeAttribute('target')
    el.removeAttribute('rel')
  }
}

function prepareDashboardNavControls(shellRoot: HTMLElement) {
  shellRoot.querySelectorAll<HTMLElement>(DASHBOARD_NAV_SELECTORS).forEach(prepareDashboardNavControl)
}

function prepareShellControls(shellRoot: HTMLElement) {
  prepareShellRecordControls(shellRoot)
  prepareDashboardNavControls(shellRoot)
  prepareCreateNavControls(shellRoot)
}

export type ShellBridgeHandlers = {
  onRecordLaunch: () => void
  onDashboardNavigate: () => void
}

export function bindShellBridge(handlers: ShellBridgeHandlers): () => void {
  let shellRoot: HTMLElement | null = null
  let shellClickHandler: ((event: Event) => void) | null = null
  let shellObserver: MutationObserver | null = null
  let pollTimer: number | null = null

  const handleShellClick = (event: Event) => {
    const root = shellRoot ?? getShellRoot()
    if (!root) return

    const recordTrigger = isRecordNewLaunchTarget(event.target, root)
    if (recordTrigger) {
      event.preventDefault()
      event.stopPropagation()
      handlers.onRecordLaunch()
      return
    }

    const createTrigger = isCreateNavTarget(event.target, root)
    if (createTrigger) {
      event.preventDefault()
      event.stopPropagation()
      void toggleCreateOptionsPopover(createTrigger)
      return
    }

    const dashboardTrigger = isDashboardNavTarget(event.target, root)
    if (!dashboardTrigger) return
    event.preventDefault()
    event.stopPropagation()
    handlers.onDashboardNavigate()
  }

  const onHostOpenEvent = () => {
    handlers.onRecordLaunch()
  }

  document.addEventListener(RECORDER_OPEN_EVENT, onHostOpenEvent)

  const detachFromShell = () => {
    if (shellRoot && shellClickHandler) {
      shellRoot.removeEventListener('click', shellClickHandler, true)
    }
    shellObserver?.disconnect()
    shellRoot = null
    shellClickHandler = null
    shellObserver = null
  }

  const attachToShell = () => {
    const root = getShellRoot()
    if (!root || root === shellRoot) return Boolean(root)

    detachFromShell()

    shellRoot = root
    prepareShellControls(root)

    shellClickHandler = handleShellClick
    root.addEventListener('click', shellClickHandler, true)

    shellObserver = new MutationObserver(() => prepareShellControls(root))
    shellObserver.observe(root, { childList: true, subtree: true })
    return true
  }

  attachToShell()

  let attempts = 0
  pollTimer = window.setInterval(() => {
    attempts += 1
    attachToShell()
    if (shellRoot || attempts >= 50) {
      if (pollTimer !== null) window.clearInterval(pollTimer)
      pollTimer = null
    }
  }, 100)

  return () => {
    document.removeEventListener(RECORDER_OPEN_EVENT, onHostOpenEvent)
    if (pollTimer !== null) window.clearInterval(pollTimer)
    detachFromShell()
  }
}

/** @deprecated Use bindShellBridge */
export function bindRecordNewVideoButton(onLaunch: () => void): () => void {
  return bindShellBridge({ onRecordLaunch: onLaunch, onDashboardNavigate: () => {} })
}
