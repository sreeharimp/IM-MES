import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

// Read version from package.json at build time — single source of truth
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  define: {
    // Injected at build time — use as __APP_VERSION__ in any .ts/.tsx file
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'IM-MES Production',
        short_name: 'IM-MES',
        description: 'Industrial Execution System (MES)',
        theme_color: '#0d0f12',
        background_color: '#0d0f12',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ],
})

