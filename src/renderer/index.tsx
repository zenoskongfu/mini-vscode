import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import './styles/globals.css'
// 优先导入，确保扩展宿主 MessagePort 监听器先于其他代码安装，
// 避免在端口交接时错过消息。
import './platform/extHostPort'
import { injectElectronAPIMock } from './mocks/electron-api-mock'
import { setupMonaco } from './services/monaco-setup'

// 浏览器中运行时补一个 window.electronAPI stub（Vite preview / 无 Electron 的 dev server）
injectElectronAPIMock()

// 将 Monaco 接到本地打包实例与本地 web worker（可离线运行）
setupMonaco()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
