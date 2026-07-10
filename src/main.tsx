import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { loadConsensusShell } from './loadConsensusShell'
import { FloatingRecordButton } from './FloatingRecordButton'
import { getShellPageFromLocation, navigateToShellPage, shellPageShowsFloatingRecord } from './shellPages'
import { VideoRecorderHost } from './VideoRecorderHost'
import { bindCreateOptionsPopover, hideCreateOptionsPopover } from './createOptionsPopover'
import { bindShellBridge } from './shellBridge'
import { injectVercelToolbar } from './mountVercelToolbar'
import './index.css'
import './web-app-recorder.css'

injectVercelToolbar()

function RecorderBootstrap() {
  const [shellPageId, setShellPageId] = useState(getShellPageFromLocation)
  const [shellReady, setShellReady] = useState(false)
  const [shellError, setShellError] = useState<string | null>(null)
  const [recorderOpen, setRecorderOpen] = useState(false)
  const showFloatingRecord = shellPageShowsFloatingRecord(shellPageId)

  const openRecorder = useCallback(() => {
    setRecorderOpen(true)
  }, [])

  const closeRecorder = useCallback(() => {
    setRecorderOpen(false)
  }, [])

  useEffect(() => {
    const onPopState = () => setShellPageId(getShellPageFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    hideCreateOptionsPopover()
  }, [shellPageId])

  useEffect(() => {
    return bindCreateOptionsPopover({
      onScreenRecorderLaunch: openRecorder,
    })
  }, [openRecorder])

  useEffect(() => {
    let cancelled = false
    setShellReady(false)
    setShellError(null)
    void loadConsensusShell(shellPageId)
      .then(() => {
        if (!cancelled) setShellReady(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setShellError(error instanceof Error ? error.message : 'Failed to load Consensus shell')
        }
      })
    return () => {
      cancelled = true
    }
  }, [shellPageId])

  useEffect(() => {
    if (!shellReady) return
    return bindShellBridge({
      onRecordLaunch: openRecorder,
      onDashboardNavigate: () => navigateToShellPage('welcome'),
    })
  }, [shellReady, openRecorder])

  return (
    <>
      {shellError ? (
        <div className="web-app-recorder-shell-error" role="alert">
          {shellError}
        </div>
      ) : null}
      {showFloatingRecord ? (
        <FloatingRecordButton onLaunch={openRecorder} hidden={recorderOpen} />
      ) : null}
      <VideoRecorderHost open={recorderOpen} onClose={closeRecorder} />
    </>
  )
}

const mount = document.getElementById('web-app-recorder-root')
if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <RecorderBootstrap />
    </StrictMode>,
  )
}
