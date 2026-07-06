/** File in `public/sounds/` — update if you rename the asset. */
export const COUNTDOWN_TICK_SOUND_FILENAME =
  'Count down - soundshelfstudio-ui-click-deep-512211.mp3'

/** Plays when “1” scales/fades out after the hold beat. */
export const COUNTDOWN_FINAL_FADE_SOUND_FILENAME = '1-count.mp3'

const UI_SOUND_VOLUME = 0.26

function tickSoundUrl(): string {
  return `${import.meta.env.BASE_URL}sounds/${encodeURIComponent(COUNTDOWN_TICK_SOUND_FILENAME)}`
}

function finalFadeSoundUrl(): string {
  return `${import.meta.env.BASE_URL}sounds/${encodeURIComponent(COUNTDOWN_FINAL_FADE_SOUND_FILENAME)}`
}

/** Short UI tick once per countdown beat (3 … 1). */
export function playCountdownTick(): void {
  const audio = new Audio(tickSoundUrl())
  audio.volume = UI_SOUND_VOLUME
  void audio.play().catch(() => {
    /* autoplay policy / decode — ignored */
  })
}

/** Sound when the hex + “1” fade-out animation runs (after the full-second beat on 1). */
export function playCountdownFinalFadeSound(): void {
  const audio = new Audio(finalFadeSoundUrl())
  audio.volume = UI_SOUND_VOLUME
  void audio.play().catch(() => {
    /* autoplay policy / decode — ignored */
  })
}
