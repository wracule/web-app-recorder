/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CAPTURE_BORDER_EXTENSION_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
