import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NEXT_PUBLIC_VERCEL_TOOLBAR_OWNER_ID': JSON.stringify(process.env.VERCEL_ORG_ID ?? ''),
    'process.env.NEXT_PUBLIC_VERCEL_TOOLBAR_PROJECT_ID': JSON.stringify(process.env.VERCEL_PROJECT_ID ?? ''),
  },
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
