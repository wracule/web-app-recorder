const TOPBAR_ID = 'web-app-recorder-mobile-topbar'
const MENU_BTN_CLASS = 'web-app-recorder-mobile-menu-btn'
const AVATAR_BTN_CLASS = 'web-app-recorder-mobile-avatar'
const ICONS_CLASS = 'web-app-recorder-mobile-topbar__icons'
const SIDEBAR_OPEN_CLASS = 'web-app-recorder-sidebar-open'
const BACKDROP_CLASS = 'web-app-recorder-sidebar-backdrop'
const COMPACT_MEDIA = '(max-width: 991.98px)'

function getSidebar(): HTMLElement | null {
  const root = document.getElementById('consensus-app-root')
  if (!root) return null
  const sidebar =
    root.querySelector<HTMLElement>('[class*="styles-module-sidebar-"]:not([class*="sidebarColumn"]):not([class*="sidebarHeader"])') ??
    root.querySelector<HTMLElement>('[class*="_sidebar_"]')
  return sidebar
}

function getWorkspaceButtons(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid="workspace-navigation"] [class*="workspaceButton"]'),
  )
}

function ensureBackdrop(): HTMLElement {
  const existing = document.querySelector(`.${BACKDROP_CLASS}`)
  if (existing instanceof HTMLElement) return existing

  const backdrop = document.createElement('button')
  backdrop.type = 'button'
  backdrop.className = BACKDROP_CLASS
  backdrop.setAttribute('aria-label', 'Close navigation menu')
  backdrop.setAttribute('aria-hidden', 'true')
  document.body.appendChild(backdrop)
  return backdrop
}

function setSidebarOpen(open: boolean) {
  const sidebar = getSidebar()
  const backdrop = ensureBackdrop()
  document.documentElement.classList.toggle(SIDEBAR_OPEN_CLASS, open)
  document.body.classList.toggle(SIDEBAR_OPEN_CLASS, open)
  sidebar?.classList.toggle(SIDEBAR_OPEN_CLASS, open)
  backdrop.classList.toggle(`${BACKDROP_CLASS}--visible`, open)
  backdrop.setAttribute('aria-hidden', open ? 'false' : 'true')
}

function uniquifySvgIds(root: HTMLElement) {
  const nodes = root.querySelectorAll('[id]')
  const idMap = new Map<string, string>()
  const suffix = `m${Math.random().toString(36).slice(2, 9)}`

  nodes.forEach((node) => {
    const oldId = node.getAttribute('id')
    if (!oldId) return
    const nextId = `${oldId}-${suffix}`
    idMap.set(oldId, nextId)
    node.setAttribute('id', nextId)
  })

  if (idMap.size === 0) return

  root.querySelectorAll('*').forEach((el) => {
    for (const attr of ['filter', 'mask', 'fill', 'stroke', 'clip-path', 'href', 'xlink:href']) {
      const value = el.getAttribute(attr)
      if (!value || !value.includes('url(#')) continue
      let next = value
      for (const [oldId, nextId] of idMap) {
        next = next.replaceAll(`url(#${oldId})`, `url(#${nextId})`)
        next = next.replaceAll(`#${oldId}`, `#${nextId}`)
      }
      if (next !== value) el.setAttribute(attr, next)
    }
  })

  // Inline style urls (mask="url(#...)") sometimes land in style attributes too.
  root.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style')
    if (!style || !style.includes('url(#')) return
    let next = style
    for (const [oldId, nextId] of idMap) {
      next = next.replaceAll(`url(#${oldId})`, `url(#${nextId})`)
    }
    if (next !== style) el.setAttribute('style', next)
  })
}

function syncWorkspaceIcons(iconsHost: HTMLElement) {
  iconsHost.replaceChildren()
  for (const sourceBtn of getWorkspaceButtons()) {
    const clone = sourceBtn.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-testid')
    clone.classList.add('web-app-recorder-mobile-topbar__workspace-btn')
    clone.querySelectorAll('.sf-hidden, [class*="successWrapper"]').forEach((node) => {
      node.remove()
    })
    uniquifySvgIds(clone)
    clone.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      sourceBtn.click()
    })
    iconsHost.appendChild(clone)
  }
}

function ensureTopBar(): HTMLElement {
  let topbar = document.getElementById(TOPBAR_ID)
  if (topbar) return topbar

  topbar = document.createElement('header')
  topbar.id = TOPBAR_ID
  topbar.className = 'web-app-recorder-mobile-topbar'
  topbar.setAttribute('role', 'banner')

  const menuBtn = document.createElement('button')
  menuBtn.type = 'button'
  menuBtn.className = MENU_BTN_CLASS
  menuBtn.setAttribute('aria-label', 'Open navigation menu')
  menuBtn.innerHTML =
    '<span class="web-app-recorder-mobile-menu-btn__bars" aria-hidden="true"><span></span><span></span><span></span></span>'

  const icons = document.createElement('div')
  icons.className = ICONS_CLASS

  const avatarBtn = document.createElement('button')
  avatarBtn.type = 'button'
  avatarBtn.className = AVATAR_BTN_CLASS
  avatarBtn.setAttribute('aria-label', 'Account menu')
  const sourceImg = document.querySelector(
    '[data-testid="menu-item-user"] img',
  ) as HTMLImageElement | null
  const img = document.createElement('img')
  img.alt = sourceImg?.alt || 'User avatar'
  img.src =
    sourceImg?.getAttribute('src') || `${import.meta.env.BASE_URL}images/charles-bronson.png`
  avatarBtn.appendChild(img)

  topbar.append(menuBtn, icons, avatarBtn)
  document.body.appendChild(topbar)
  return topbar
}

function isCompact(): boolean {
  return window.matchMedia(COMPACT_MEDIA).matches
}

/**
 * Mobile chrome: fixed navy top bar (hamburger | workspace icons | avatar).
 * Keeps the main left nav closed until the hamburger is used.
 */
export function bindMobileWorkspaceTopNav(): () => void {
  const topbar = ensureTopBar()
  const menuBtn = topbar.querySelector(`.${MENU_BTN_CLASS}`)
  const avatarBtn = topbar.querySelector(`.${AVATAR_BTN_CLASS}`)
  const iconsHost = topbar.querySelector(`.${ICONS_CLASS}`)
  const backdrop = ensureBackdrop()

  if (
    !(menuBtn instanceof HTMLButtonElement) ||
    !(avatarBtn instanceof HTMLButtonElement) ||
    !(iconsHost instanceof HTMLElement)
  ) {
    return () => {}
  }

  const refresh = () => {
    const compact = isCompact()
    document.documentElement.classList.toggle('web-app-recorder-compact', compact)
    topbar.hidden = !compact
    if (compact) {
      syncWorkspaceIcons(iconsHost)
      setSidebarOpen(false)
    } else {
      setSidebarOpen(false)
    }
  }

  refresh()

  const onMenuClick = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!isCompact()) return
    const open = !document.documentElement.classList.contains(SIDEBAR_OPEN_CLASS)
    setSidebarOpen(open)
  }

  const onAvatarClick = (event: Event) => {
    event.preventDefault()
    if (!isCompact()) return
    setSidebarOpen(true)
  }

  const onBackdropClick = () => setSidebarOpen(false)

  const onDocClick = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[class*="closeButton"]')) {
      setSidebarOpen(false)
    }
  }

  const media = window.matchMedia(COMPACT_MEDIA)
  media.addEventListener('change', refresh)
  window.addEventListener('resize', refresh)
  menuBtn.addEventListener('click', onMenuClick)
  avatarBtn.addEventListener('click', onAvatarClick)
  backdrop.addEventListener('click', onBackdropClick)
  document.addEventListener('click', onDocClick, true)

  const shellRoot = document.getElementById('consensus-app-root')
  const mutationObserver =
    shellRoot && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
          if (isCompact()) syncWorkspaceIcons(iconsHost)
        })
      : null
  mutationObserver?.observe(shellRoot!, { childList: true, subtree: true })

  return () => {
    media.removeEventListener('change', refresh)
    window.removeEventListener('resize', refresh)
    menuBtn.removeEventListener('click', onMenuClick)
    avatarBtn.removeEventListener('click', onAvatarClick)
    backdrop.removeEventListener('click', onBackdropClick)
    document.removeEventListener('click', onDocClick, true)
    mutationObserver?.disconnect()
    setSidebarOpen(false)
    document.documentElement.classList.remove('web-app-recorder-compact')
    backdrop.remove()
    topbar.remove()
  }
}
