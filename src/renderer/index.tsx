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

// Monaco/VSCode 内部的「取消」是按设计取消（导航/视图状态恢复被中断等），不是真错误——
// VSCode 内部也会在 onUnexpectedError 里过滤掉。标准版 Monaco 下它们会冒泡成
// unhandledrejection，这里只吞掉 name/message 为 'Canceled' 的，保持控制台干净。
window.addEventListener('unhandledrejection', e => {
  const reason = e.reason as { name?: string; message?: string } | undefined
  if (reason && (reason.name === 'Canceled' || reason.message === 'Canceled')) {
    e.preventDefault()
  }
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
