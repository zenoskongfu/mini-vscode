import * as pty from '@homebridge/node-pty-prebuilt-multiarch'
import type { BrowserWindow } from 'electron'
import os from 'os'

type IPty = pty.IPty

/**
 * TerminalService (main process) — owns real shell processes via node-pty.
 *
 * Each terminal is a pty keyed by id. Output is pushed to the renderer with a
 * one-way `terminal:data` message (high-frequency stream → never invoke/return).
 * This is the exact stack VSCode ships: node-pty in a Node context, xterm.js in
 * the renderer.
 */
export class TerminalService {
  private terminals = new Map<string, IPty>()

  private defaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'powershell.exe'
    }
    return process.env.SHELL || '/bin/bash'
  }

  create(id: string, cwd: string | undefined, mainWindow: BrowserWindow): void {
    if (this.terminals.has(id)) return

    const shell = this.defaultShell()
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: process.env as Record<string, string>
    })

    // Stream shell output to the renderer
    ptyProcess.onData(data => {
      if (mainWindow.isDestroyed()) return
      mainWindow.webContents.send('terminal:data', id, data)
    })

    // Notify renderer when the shell exits
    ptyProcess.onExit(({ exitCode }) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', id, exitCode)
      }
      this.terminals.delete(id)
    })

    this.terminals.set(id, ptyProcess)
  }

  write(id: string, data: string): void {
    this.terminals.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const term = this.terminals.get(id)
    if (!term) return
    try {
      term.resize(cols, rows)
    } catch {
      // ignore resize on a dead pty
    }
  }

  kill(id: string): void {
    const term = this.terminals.get(id)
    if (!term) return
    term.kill()
    this.terminals.delete(id)
  }

  killAll(): void {
    for (const term of this.terminals.values()) {
      term.kill()
    }
    this.terminals.clear()
  }
}
