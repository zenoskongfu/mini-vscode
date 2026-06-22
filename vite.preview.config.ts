import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Vite config used only for browser preview (Claude preview panel).
// The real build uses electron.vite.config.ts.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    // Dedupe React so Allotment (and others) share the app's single React copy
    dedupe: ['react', 'react-dom'],
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      // Force a single React instance (root is src/renderer, so resolve absolutely)
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom')
    }
  },
  // Pre-bundle allotment together with React so they share one instance
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'allotment',
      '@xterm/xterm',
      '@xterm/addon-fit'
    ]
  },
  // Match the Electron renderer build: enable legacy parameter decorators for DI
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true
      }
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
