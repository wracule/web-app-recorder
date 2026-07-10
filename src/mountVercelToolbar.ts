import { mountVercelToolbar } from '@vercel/toolbar'

/** Inject the Vercel Toolbar so team members can comment in production without the browser extension. */
export function injectVercelToolbar(): void {
  if (typeof window === 'undefined') return
  mountVercelToolbar()
}
