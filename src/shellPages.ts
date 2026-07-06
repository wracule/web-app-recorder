export const SHELL_PAGES = {
  discovery: {
    label: 'Consensus Web App Recorder',
    shellFile: 'consensus-shell.html',
    showFloatingRecord: true,
  },
  welcome: {
    label: 'Welcome',
    shellFile: 'shells/welcome.html',
    showFloatingRecord: true,
  },
  'create-demoboard': {
    label: 'Create a DemoBoard',
    shellFile: 'shells/create-a-demoboard.html',
    showFloatingRecord: true,
  },
} as const

export type ShellPageId = keyof typeof SHELL_PAGES

export const DEFAULT_SHELL_PAGE: ShellPageId = 'welcome'

export function isShellPageId(value: string | null): value is ShellPageId {
  return value !== null && value in SHELL_PAGES
}

export function getShellPageFromLocation(location: Location = window.location): ShellPageId {
  const param = new URLSearchParams(location.search).get('page')
  return isShellPageId(param) ? param : DEFAULT_SHELL_PAGE
}

export function shellPageShowsFloatingRecord(pageId: ShellPageId): boolean {
  return SHELL_PAGES[pageId].showFloatingRecord
}

export function navigateToShellPage(pageId: ShellPageId) {
  const url = new URL(window.location.href)
  if (pageId === DEFAULT_SHELL_PAGE) {
    url.searchParams.delete('page')
  } else {
    url.searchParams.set('page', pageId)
  }
  window.history.pushState({ shellPageId: pageId }, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
