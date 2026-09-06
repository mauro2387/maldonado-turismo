/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_MAPBOX_TOKEN: string
  readonly VITE_MAP_CENTER_LAT: string
  readonly VITE_MAP_CENTER_LNG: string
  readonly VITE_MAP_DEFAULT_ZOOM: string
  readonly VITE_ENABLE_VERLYX: string
  readonly VITE_ENABLE_ANALYTICS: string
  readonly VITE_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
