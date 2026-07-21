import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'

type FloatingRecordButtonProps = {
  onLaunch: () => void
  hidden?: boolean
}

export function FloatingRecordButton({ onLaunch, hidden }: FloatingRecordButtonProps) {
  if (hidden) return null

  return (
    <div className="web-app-recorder-fab-wrap">
      <button
        type="button"
        className="web-app-recorder-fab"
        onClick={onLaunch}
        aria-label="Record video"
      >
        <span className="web-app-recorder-fab__label">Record</span>
        <span className="web-app-recorder-fab__icon-wrap" aria-hidden>
          <RadioButtonCheckedIcon className="web-app-recorder-fab__icon" />
        </span>
        <span className="web-app-recorder-fab__tooltip" role="tooltip">
          Record &amp; share video
        </span>
      </button>
    </div>
  )
}
