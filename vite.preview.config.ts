import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Vite config used only for browser preview (Claude preview panel).
// The real build uses electron.vite.config.ts.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  // Claude Preview injects PORT env var — Vite needs it explicitly wired here
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5175,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'out/preview'),
    emptyOutDir: true
  }
})
