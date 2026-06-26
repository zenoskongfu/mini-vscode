import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useService } from '../../platform/ServicesContext'
import { ITerminalService } from '../../services/terminal/terminalService'
import { IThemeService } from '../../services/theme/themeService'
import './TerminalView.css'

interface TerminalViewProps {
  id: string
}

/**
 * 挂载一个绑定到 pty id 的 xterm.js 实例。
 *
 * 数据流：
 *   用户输入 → term.onData → terminalService.write → IPC → pty.write
 *   pty 输出 → IPC → terminalService 分发 → term.write(data)
 *
 * 所有资源（xterm、数据订阅、ResizeObserver）都会在卸载时释放，
 * 遵守 Disposable 生命周期纪律。
 */
export function TerminalView({ id }: TerminalViewProps): React.JSX.Element {
  const terminalService = useService(ITerminalService)
  const themeService = useService(IThemeService)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: 'var(--font-family-mono)',
      fontSize: 13,
      cursorBlink: true,
      // 将 xterm 主题映射到 workbench 调色板
      theme: buildXtermTheme()
    })

    // 跟随主题切换更新 xterm 配色（修复：首个终端在主题应用前创建会停留在深色）
    const themeSub = themeService.onDidChangeTheme(() => {
      term.options.theme = buildXtermTheme()
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    // 用户输入 → pty
    const inputSub = term.onData(data => terminalService.write(id, data))

    // pty 输出 → terminal
    const unsubData = terminalService.onTerminalData(id, data => term.write(data))

    // 初始尺寸同步
    terminalService.resize(id, term.cols, term.rows)

    // resize 处理
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        terminalService.resize(id, term.cols, term.rows)
      } catch {
        // 容器暂时还无法测量
      }
    })
    resizeObserver.observe(container)

    term.focus()

    return () => {
      resizeObserver.disconnect()
      unsubData()
      inputSub.dispose()
      themeSub.dispose()
      term.dispose()
    }
  }, [id, terminalService, themeService])

  return <div className="terminal-view" ref={containerRef} />
}

/** 从当前 :root CSS 调色板构造 xterm 主题（主题切换后变量已更新） */
function buildXtermTheme(): { background: string; foreground: string; cursor: string; selectionBackground: string } {
  return {
    background: getCssVar('--color-bg-panel', '#1e1e1e'),
    foreground: getCssVar('--color-fg-default', '#cccccc'),
    cursor: getCssVar('--color-editor-cursor', '#aeafad'),
    selectionBackground: getCssVar('--color-editor-selection', '#264f78')
  }
}

function getCssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
