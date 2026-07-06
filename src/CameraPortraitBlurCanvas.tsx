import { useEffect, useRef, type RefObject } from 'react'
import * as bodySegmentation from '@tensorflow-models/body-segmentation'
import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>
  active: boolean
}

const BOKEH_FOREGROUND_THRESHOLD = 0.5
const BOKEH_BACKGROUND_BLUR = 14
const BOKEH_EDGE_BLUR = 4

export function CameraPortraitBlurCanvas({ videoRef, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false
    let segmenter: bodySegmentation.BodySegmenter | null = null
    let rafId = 0

    const boot = async () => {
      try {
        await tf.ready()
        try {
          await tf.setBackend('webgl')
        } catch {
          await tf.setBackend('cpu')
        }
        await tf.ready()
      } catch {
        /* fall through — segmenter may still work */
      }

      segmenter = await bodySegmentation.createSegmenter(
        bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
        {
          runtime: 'tfjs',
          modelType: 'general',
        },
      )

      if (cancelled) {
        segmenter.dispose()
        return
      }

      const tick = async () => {
        if (cancelled || !segmenter) return
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) {
          rafId = requestAnimationFrame(() => void tick())
          return
        }
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          rafId = requestAnimationFrame(() => void tick())
          return
        }

        try {
          const people = await segmenter.segmentPeople(video)
          await bodySegmentation.drawBokehEffect(
            canvas,
            video,
            people,
            BOKEH_FOREGROUND_THRESHOLD,
            BOKEH_BACKGROUND_BLUR,
            BOKEH_EDGE_BLUR,
            false,
          )
        } catch {
          /* skip bad frames (e.g. video resizing) */
        }

        if (!cancelled) {
          rafId = requestAnimationFrame(() => void tick())
        }
      }

      rafId = requestAnimationFrame(() => void tick())
    }

    void boot()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      segmenter?.dispose()
    }
  }, [active, videoRef])

  return (
    <canvas
      ref={canvasRef}
      className="prototype-browser-window__record-stage-canvas-bokeh"
      aria-hidden
    />
  )
}
