import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mediapipe/selfie_segmentation': path.resolve(
        __dirname,
        'src/shims/mediapipe-selfie-segmentation.ts',
      ),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    host: true,
    open: true,
  },
})
