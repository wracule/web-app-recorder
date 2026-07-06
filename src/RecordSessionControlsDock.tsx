import type { RefObject } from 'react'
import { DeviceMenuPortal } from './DeviceMenuPortal'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded'
import MicOff from '@mui/icons-material/MicOff'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import NoPhotography from '@mui/icons-material/NoPhotography'
import CheckIcon from '@mui/icons-material/Check'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'

const DESKTOP_LANDSCAPE_ADD_SVG = `${import.meta.env.BASE_URL}images/Record/desktop_landscape_add.svg`

export type RecordSessionControlsDockProps = {
  recordingFlowChromeActive: boolean
  recordInputMode: 'camera' | 'screen'
  recordCountdownControlsLocked: boolean
  onRecordModeChange: (mode: 'camera' | 'screen') => void
  cameraSessionRecording: boolean
  screenDocumentPipActive: boolean
  screenSessionRecording: boolean
  screenRecordingSessionActive: boolean
  recordingPaused: boolean
  recordingElapsedSec: number
  formatRecordingClock: (totalSeconds: number) => string
  micMuted: boolean
  onMicMutedToggle: () => void
  micMenuOpen: boolean
  onMicMenuToggle: () => void
  micMenuRef: RefObject<HTMLDivElement | null>
  micMenuPanelRef: RefObject<HTMLDivElement | null>
  cameraVideoOff: boolean
  onCameraVideoOffToggle: () => void
  cameraMenuOpen: boolean
  onCameraMenuToggle: () => void
  cameraMenuRef: RefObject<HTMLDivElement | null>
  cameraMenuPanelRef: RefObject<HTMLDivElement | null>
  audioDevices: MediaDeviceInfo[]
  selectedAudioDeviceId: string
  onSelectAudioDevice: (deviceId: string) => void
  videoDevices: MediaDeviceInfo[]
  selectedVideoDeviceId: string
  onSelectVideoDevice: (deviceId: string) => void
  onStartScreenShare: () => void
  onScreenFinishRecording: () => void
  onScreenDeleteRecording: () => void
  onRecordingPauseToggle: () => void
  onCameraFinishRecording: () => void
  onCameraDeleteRecording: () => void
  onCameraStartRecording: () => void
}

export function RecordSessionControlsDock({
  recordingFlowChromeActive,
  recordInputMode,
  recordCountdownControlsLocked,
  onRecordModeChange,
  cameraSessionRecording,
  screenDocumentPipActive,
  screenSessionRecording,
  screenRecordingSessionActive,
  recordingPaused,
  recordingElapsedSec,
  formatRecordingClock,
  micMuted,
  onMicMutedToggle,
  micMenuOpen,
  onMicMenuToggle,
  micMenuRef,
  micMenuPanelRef,
  cameraVideoOff,
  onCameraVideoOffToggle,
  cameraMenuOpen,
  onCameraMenuToggle,
  cameraMenuRef,
  cameraMenuPanelRef,
  audioDevices,
  selectedAudioDeviceId,
  onSelectAudioDevice,
  videoDevices,
  selectedVideoDeviceId,
  onSelectVideoDevice,
  onStartScreenShare,
  onScreenFinishRecording,
  onScreenDeleteRecording,
  onRecordingPauseToggle,
  onCameraFinishRecording,
  onCameraDeleteRecording,
  onCameraStartRecording,
}: RecordSessionControlsDockProps) {
  const screenFinishInPage = !screenDocumentPipActive && screenSessionRecording
  const timerActive =
    (recordInputMode === 'camera' && cameraSessionRecording) ||
    (recordInputMode === 'screen' && screenFinishInPage)

  return (
    <div
      className={
        'prototype-browser-window__record-ui-dock' +
        (recordingFlowChromeActive ? ' prototype-browser-window__record-ui-dock--recording-flow' : '')
      }
    >
      <div className="prototype-browser-window__record-dock-zone prototype-browser-window__record-dock-zone--modes">
        <div className="prototype-browser-window__record-mode-group">
          <button
            type="button"
            className={
              'prototype-browser-window__record-mode-btn prototype-browser-window__tooltip-trigger' +
              (recordInputMode === 'camera' ? ' prototype-browser-window__record-mode-btn--active' : '')
            }
            onClick={() => onRecordModeChange('camera')}
            aria-label="Record with Camera"
            data-tooltip="Record with Camera"
            disabled={recordCountdownControlsLocked}
          >
            <VideocamOutlinedIcon
              className="prototype-browser-window__record-mode-btn-icon prototype-browser-window__record-mode-btn-icon--camera"
              fontSize="inherit"
              aria-hidden
            />
            <span className="prototype-browser-window__record-mode-btn-label">Camera</span>
          </button>
          <button
            type="button"
            className={
              'prototype-browser-window__record-mode-btn prototype-browser-window__tooltip-trigger' +
              (recordInputMode === 'screen' ? ' prototype-browser-window__record-mode-btn--active' : '')
            }
            onClick={() => onRecordModeChange('screen')}
            aria-label="Capture Screen"
            data-tooltip="Capture Screen"
            disabled={recordCountdownControlsLocked}
          >
            <DesktopWindowsOutlinedIcon
              className="prototype-browser-window__record-mode-btn-icon"
              fontSize="inherit"
              aria-hidden
            />
            <span className="prototype-browser-window__record-mode-btn-label">Screen</span>
          </button>
        </div>
      </div>
      <div className="prototype-browser-window__record-dock-zone prototype-browser-window__record-dock-zone--core">
        <div className="prototype-browser-window__record-core">
          <button
            type="button"
            className={
              'prototype-browser-window__record-start-btn prototype-browser-window__tooltip-trigger' +
              ((recordInputMode === 'camera' && cameraSessionRecording) ||
              (recordInputMode === 'screen' && screenFinishInPage)
                ? ' prototype-browser-window__record-start-btn--stop'
                : '')
            }
            aria-label={
              recordInputMode === 'screen'
                ? screenFinishInPage
                  ? 'Finish recording'
                  : 'Share screen to record'
                : cameraSessionRecording
                  ? 'Finish recording'
                  : 'Start recording'
            }
            data-tooltip={
              recordInputMode === 'screen'
                ? screenFinishInPage
                  ? 'Finish recording'
                  : 'Share screen'
                : cameraSessionRecording
                  ? 'Finish recording'
                  : 'Start recording'
            }
            disabled={
              (recordInputMode === 'camera' && !cameraSessionRecording && recordCountdownControlsLocked) ||
              (recordInputMode === 'screen' && screenRecordingSessionActive)
            }
            onClick={() => {
              if (recordInputMode === 'screen') {
                if (screenFinishInPage) {
                  onScreenFinishRecording()
                  return
                }
                onStartScreenShare()
                return
              }
              if (cameraSessionRecording) {
                onCameraFinishRecording()
                return
              }
              if (!recordCountdownControlsLocked) {
                onCameraStartRecording()
              }
            }}
          >
            {recordInputMode === 'camera' && cameraSessionRecording ? (
              <>
                Finish
                <StopRoundedIcon
                  className="prototype-browser-window__record-start-btn-icon"
                  fontSize="inherit"
                  aria-hidden
                />
              </>
            ) : recordInputMode === 'screen' && screenFinishInPage ? (
              <>
                Finish
                <StopRoundedIcon
                  className="prototype-browser-window__record-start-btn-icon"
                  fontSize="inherit"
                  aria-hidden
                />
              </>
            ) : recordInputMode === 'screen' ? (
              <>
                Share Screen
                <img
                  src={DESKTOP_LANDSCAPE_ADD_SVG}
                  alt=""
                  className="prototype-browser-window__record-start-btn-icon prototype-browser-window__record-start-btn-icon--img"
                  aria-hidden
                  draggable={false}
                />
              </>
            ) : (
              <>
                Record
                <FiberManualRecordIcon
                  className="prototype-browser-window__record-start-btn-icon"
                  fontSize="inherit"
                  aria-hidden
                />
              </>
            )}
          </button>
          <span
            className={
              'prototype-browser-window__record-timer' + (timerActive ? ' prototype-browser-window__record-timer--active' : '')
            }
            aria-live="polite"
          >
            {timerActive ? formatRecordingClock(recordingElapsedSec) : '00:00'}
          </span>
          <span className="prototype-browser-window__record-core-divider" aria-hidden="true" />
          <button
            type="button"
            className="prototype-browser-window__record-pause-btn prototype-browser-window__tooltip-trigger"
            aria-label={recordingPaused ? 'Resume recording' : 'Pause recording'}
            data-tooltip={recordingPaused ? 'Resume' : 'Pause recording'}
            aria-pressed={recordingPaused}
            disabled={
              (recordInputMode === 'camera' && !cameraSessionRecording) ||
              (recordInputMode === 'screen' && (screenDocumentPipActive || !screenSessionRecording))
            }
            onClick={onRecordingPauseToggle}
          >
            {recordingPaused ? (
              <PlayArrowRoundedIcon fontSize="inherit" />
            ) : (
              <PauseRoundedIcon fontSize="inherit" />
            )}
          </button>
          <button
            type="button"
            className="prototype-browser-window__tooltip-trigger prototype-browser-window__record-delete-btn"
            aria-label="Delete recording"
            data-tooltip="Delete recording"
            disabled={
              (recordInputMode === 'camera' && !cameraSessionRecording) ||
              (recordInputMode === 'screen' && (screenDocumentPipActive || !screenSessionRecording))
            }
            onClick={() => {
              if (recordInputMode === 'screen') {
                onScreenDeleteRecording()
                return
              }
              onCameraDeleteRecording()
            }}
          >
            <DeleteOutlinedIcon fontSize="inherit" />
          </button>
        </div>
      </div>
      <div className="prototype-browser-window__record-dock-zone prototype-browser-window__record-dock-zone--extra">
        <div className="prototype-browser-window__record-extra">
          <div className="prototype-browser-window__device-menu-wrap" ref={micMenuRef}>
            <div className="prototype-browser-window__device-menu-trigger-group">
              <button
                type="button"
                className={
                  'prototype-browser-window__device-menu-trigger-icon-slot prototype-browser-window__tooltip-trigger' +
                  (micMuted ? ' prototype-browser-window__device-menu-trigger-icon-slot--off' : '')
                }
                aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={micMuted}
                data-tooltip={micMuted ? 'Turn mic on' : 'Turn mic off'}
                disabled={recordCountdownControlsLocked}
                onClick={onMicMutedToggle}
              >
                {micMuted ? (
                  <MicOff className="prototype-browser-window__device-menu-trigger-icon" fontSize="inherit" aria-hidden />
                ) : (
                  <MicNoneRoundedIcon
                    className="prototype-browser-window__device-menu-trigger-icon"
                    fontSize="inherit"
                    aria-hidden
                  />
                )}
              </button>
              <button
                type="button"
                className="prototype-browser-window__device-menu-trigger-caret-btn prototype-browser-window__tooltip-trigger"
                aria-label="Microphone options"
                aria-haspopup="menu"
                data-tooltip="Microphone options"
                aria-expanded={micMenuOpen}
                disabled={recordCountdownControlsLocked}
                onClick={onMicMenuToggle}
              >
                <KeyboardArrowDownRoundedIcon
                  className={
                    'prototype-browser-window__device-menu-trigger-caret' +
                    (micMenuOpen ? ' prototype-browser-window__device-menu-trigger-caret--open' : '')
                  }
                  fontSize="inherit"
                  aria-hidden
                />
              </button>
            </div>
            <DeviceMenuPortal
              open={micMenuOpen}
              anchorRef={micMenuRef}
              menuRef={micMenuPanelRef}
              className="prototype-browser-window__device-menu prototype-browser-window__device-menu--portaled"
              role="menu"
              aria-label="Microphone options"
            >
                {audioDevices.length === 0 ? (
                  <div className="prototype-browser-window__device-menu-empty">No microphones found</div>
                ) : (
                  audioDevices.map((device, index) => (
                    <button
                      key={device.deviceId}
                      type="button"
                      className={
                        'prototype-browser-window__device-menu-item' +
                        (device.deviceId === selectedAudioDeviceId
                          ? ' prototype-browser-window__device-menu-item--active'
                          : '')
                      }
                      onClick={() => onSelectAudioDevice(device.deviceId)}
                    >
                      <span className="prototype-browser-window__device-menu-item-label">
                        {device.label || `Microphone ${index + 1}`}
                      </span>
                      {device.deviceId === selectedAudioDeviceId && (
                        <span className="prototype-browser-window__device-menu-item-check" aria-hidden>
                          <CheckIcon fontSize="inherit" />
                        </span>
                      )}
                    </button>
                  ))
                )}
            </DeviceMenuPortal>
          </div>
          <div className="prototype-browser-window__device-menu-wrap" ref={cameraMenuRef}>
            <div className="prototype-browser-window__device-menu-trigger-group">
              <button
                type="button"
                className={
                  'prototype-browser-window__device-menu-trigger-icon-slot prototype-browser-window__tooltip-trigger' +
                  (cameraVideoOff ? ' prototype-browser-window__device-menu-trigger-icon-slot--off' : '')
                }
                aria-label={cameraVideoOff ? 'Turn camera on' : 'Turn camera off'}
                aria-pressed={cameraVideoOff}
                data-tooltip={cameraVideoOff ? 'Turn camera on' : 'Turn camera off'}
                disabled={recordCountdownControlsLocked}
                onClick={onCameraVideoOffToggle}
              >
                {cameraVideoOff ? (
                  <NoPhotography
                    className="prototype-browser-window__device-menu-trigger-icon"
                    fontSize="inherit"
                    aria-hidden
                  />
                ) : (
                  <PhotoCameraOutlinedIcon
                    className="prototype-browser-window__device-menu-trigger-icon"
                    fontSize="inherit"
                    aria-hidden
                  />
                )}
              </button>
              <button
                type="button"
                className="prototype-browser-window__device-menu-trigger-caret-btn prototype-browser-window__tooltip-trigger"
                aria-label="Camera options"
                aria-haspopup="menu"
                data-tooltip="Camera options"
                aria-expanded={cameraMenuOpen}
                disabled={recordCountdownControlsLocked}
                onClick={onCameraMenuToggle}
              >
                <KeyboardArrowDownRoundedIcon
                  className={
                    'prototype-browser-window__device-menu-trigger-caret' +
                    (cameraMenuOpen ? ' prototype-browser-window__device-menu-trigger-caret--open' : '')
                  }
                  fontSize="inherit"
                  aria-hidden
                />
              </button>
            </div>
            <DeviceMenuPortal
              open={cameraMenuOpen}
              anchorRef={cameraMenuRef}
              menuRef={cameraMenuPanelRef}
              className="prototype-browser-window__device-menu prototype-browser-window__device-menu--portaled"
              role="menu"
              aria-label="Camera options"
            >
                {videoDevices.length === 0 ? (
                  <div className="prototype-browser-window__device-menu-empty">No cameras found</div>
                ) : (
                  videoDevices.map((device, index) => (
                    <button
                      key={device.deviceId}
                      type="button"
                      className={
                        'prototype-browser-window__device-menu-item' +
                        (device.deviceId === selectedVideoDeviceId
                          ? ' prototype-browser-window__device-menu-item--active'
                          : '')
                      }
                      onClick={() => onSelectVideoDevice(device.deviceId)}
                    >
                      <span className="prototype-browser-window__device-menu-item-label">
                        {device.label || `Camera ${index + 1}`}
                      </span>
                      {device.deviceId === selectedVideoDeviceId && (
                        <span className="prototype-browser-window__device-menu-item-check" aria-hidden>
                          <CheckIcon fontSize="inherit" />
                        </span>
                      )}
                    </button>
                  ))
                )}
            </DeviceMenuPortal>
          </div>
        </div>
      </div>
    </div>
  )
}
