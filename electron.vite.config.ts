import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@types': resolve(__dirname, 'src/types')
      }
    },
    // Ensure esbuild honors legacy parameter decorators used by the DI container.
    // (Vite may not follow tsconfig project references, so set it explicitly.)
    // Two separate esbuild passes need it: the transform pass (esbuild) AND the
    // dependency pre-bundling scanner (optimizeDeps.esbuildOptions).
    esbuild: {
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true
        }
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        tsconfig: resolve(__dirname, 'tsconfig.web.json')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
