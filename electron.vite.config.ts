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
    esbuild: {
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true
        }
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
