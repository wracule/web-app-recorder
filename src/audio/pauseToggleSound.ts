/** Place `pause unpause.mp3` in `public/sounds/`. */
export const PAUSE_TOGGLE_SOUND_FILENAME = 'pause unpause.mp3'

const UI_SOUND_VOLUME = 0.26

function pauseToggleSoundUrl(): string {
  return `${import.meta.env.BASE_URL}sounds/${encodeURIComponent(PAUSE_TOGGLE_SOUND_FILENAME)}`
}

/** Pause / resume — same clip as in your asset filename. */
export function playPauseToggleSound(): void {
  const audio = new Audio(pauseToggleSoundUrl())
  audio.volume = UI_SOUND_VOLUME
  void audio.play().catch(() => {
    /* autoplay policy / decode — ignored */
  })
}
