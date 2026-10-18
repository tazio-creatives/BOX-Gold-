import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // dist/client/.vite/manifest.json — read by server/index.js to put the
    // CSS of code-split, server-rendered pages (src/seo/staticPages.tsx)
    // into their HTML, so they don't flash unstyled before JS loads.
    manifest: true,
  },
})
