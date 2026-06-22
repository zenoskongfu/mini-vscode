import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useService } from '../../platform/ServicesContext'
import { ITerminalService } from '../../services/terminal/terminalService'
import './TerminalView.css'

interface TerminalViewProps {
  id: string
}

/**
 * Mounts one xterm.js instance bound to a pty (by id).
 *
 * Data flow:
 *   user types → term.onData → terminalService.write → IPC → pty.write
 *   pty output → IPC → terminalService fan-out → term.write(data)
 *
 * All resources (xterm, data subscription, ResizeObserver) are torn down on
 * unmount — Disposable discipline.
 */
export function TerminalView({ id }: TerminalViewProps): React.JSX.Element {
  const terminalService = useService(ITerminalService)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: 'var(--font-family-mono)',
      fontSize: 13,
      cursorBlink: true,
      // Map xterm theme to the workbench palette
      theme: {
        background: getCssVar('--color-bg-panel', '#1e1e1e'),
        foreground: getCssVar('--color-fg-default', '#cccccc'),
        cursor: getCssVar('--color-editor-cursor', '#aeafad'),
        selectionBackground: getCssVar('--color-editor-selection', '#264f78')
      }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    // user input → pty
    const inputSub = term.onData(data => terminalService.write(id, data))

    // pty output → terminal
    const unsubData = terminalService.onTerminalData(id, data => term.write(data))

    // initial size sync
    terminalService.resize(id, term.cols, term.rows)

    // resize handling
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        terminalService.resize(id, term.cols, term.rows)
      } catch {
        // container not measurable yet
      }
    })
    resizeObserver.observe(container)

    term.focus()

    return () => {
      resizeObserver.disconnect()
      unsubData()
      inputSub.dispose()
      term.dispose()
    }
  }, [id, terminalService])

  return <div className="terminal-view" ref={containerRef} />
}

function getCssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
