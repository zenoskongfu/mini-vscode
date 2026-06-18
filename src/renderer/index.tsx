import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import './styles/globals.css'
import { injectElectronAPIMock } from './mocks/electron-api-mock'
import { setupMonaco } from './services/monaco-setup'

// Stub window.electronAPI when running in browser (Vite preview / dev server without Electron)
injectElectronAPIMock()

// Wire Monaco to bundled instance + local web workers (offline-capable)
setupMonaco()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
