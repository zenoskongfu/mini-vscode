import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 仅用于浏览器预览的独立 Vite 配置（Claude 预览面板）。
// 真实 Electron 构建使用 electron.vite.config.ts。
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    // 去重 React，让 Allotment 等依赖共享应用的同一份 React 实例
    dedupe: ['react', 'react-dom'],
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      // 强制使用单一 React 实例（root 是 src/renderer，因此用绝对路径解析）
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom')
    }
  },
  // 将 allotment 与 React 一起预打包，确保它们共享同一实例
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'allotment',
      '@xterm/xterm',
      '@xterm/addon-fit'
    ],
    // optimizeDeps 的依赖扫描器用独立 esbuild 实例，不读上面的 esbuild.tsconfigRaw，
    // 因此必须单独指向带 experimentalDecorators 的 tsconfig，否则扫到 DI 参数装饰器会报错。
    // （与 electron.vite.config.ts 保持一致；两个旋钮缺一不可。）
    esbuildOptions: {
      tsconfig: resolve(__dirname, 'tsconfig.web.json')
    }
  },
  // 对齐 Electron renderer 构建：为 DI 启用旧版参数装饰器
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true
      }
    }
  },
  // Claude Preview 会注入 PORT 环境变量；Vite 需要在这里显式接入
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5175,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'out/preview'),
    emptyOutDir: true
  }
})
