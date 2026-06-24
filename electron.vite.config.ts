import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // 扩展宿主运行在 utilityProcess 中；作为独立入口构建
          // → out/main/extensionHost.js（由 ExtensionHost.start() 拉起）。
          extensionHost: resolve(__dirname, 'src/exthost/extensionHostMain.ts')
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
    // 确保 esbuild 遵守 DI 容器使用的旧版参数装饰器语义。
    // （Vite 不一定会跟随 tsconfig 的项目引用，所以这里显式指定。）
    // 两段独立的 esbuild 流程都需要它：源码转换（esbuild）以及
    // 依赖预打包扫描器（optimizeDeps.esbuildOptions）。
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
