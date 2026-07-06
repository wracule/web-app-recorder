/** Matches `setTimeout` before `recordStageVisible` in App.tsx and the camera stage entrance. */
export const RECORD_STAGE_REVEAL_DELAY_MS = 1000

/** File in `public/sounds/` — update if you rename the asset. */
export const RECORD_REVEAL_SOUND_FILENAME =
  'Record enabled - humordome-soft-ui-pop-light-minimal-click-451232.mp3'

function soundUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}sounds/${encodeURIComponent(filename)}`
}

/** Tries your bundled bite first, then optional short names, then synth. */
const RECORD_SOUND_URLS = [
  soundUrl(RECORD_REVEAL_SOUND_FILENAME),
  `${import.meta.env.BASE_URL}sounds/record.wav`,
  `${import.meta.env.BASE_URL}sounds/record.mp3`,
] as const

/** HTMLAudioElement volume (0–1) for bundled MP3/WAV bites. */
const UI_SOUND_VOLUME = 0.26

export function primeRevealAudioContext(ctx: AudioContext): void {
  void ctx.resume()
}

export function playRecordRevealSynth(audioContext: AudioContext): void {
  const t = audioContext.currentTime
  const osc = audioContext.createOscillator()
  const gain = audioContext.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(740, t)
  osc.frequency.exponentialRampToValueAtTime(440, t + 0.1)
  gain.gain.setValueAtTime(0.068, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  osc.connect(gain)
  gain.connect(audioContext.destination)
  osc.start(t)
  osc.stop(t + 0.2)
}

async function playSoundFromUrls(
  audioContext: AudioContext,
  urls: readonly string[],
): Promise<void> {
  for (const src of urls) {
    try {
      const audio = new Audio(src)
      audio.volume = UI_SOUND_VOLUME
      await audio.play()
      return
    } catch {
      /* try next / fall through */
    }
  }
  playRecordRevealSynth(audioContext)
}

export async function playRecordRevealSound(audioContext: AudioContext): Promise<void> {
  await playSoundFromUrls(audioContext, RECORD_SOUND_URLS)
}
