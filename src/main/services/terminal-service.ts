import * as pty from '@homebridge/node-pty-prebuilt-multiarch'
import type { BrowserWindow } from 'electron'
import os from 'os'

type IPty = pty.IPty

/**
 * TerminalService（main 进程）通过 node-pty 持有真实 shell 进程。
 *
 * 每个终端都是一个按 id 索引的 pty。输出通过单向 terminal:data 消息
 * 推送给 renderer（高频流数据，绝不使用 invoke/return）。
 * 这与 VSCode 的技术栈一致：Node 上下文中的 node-pty，renderer 中的 xterm.js。
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

    // 将 shell 输出流式推送到 renderer
    ptyProcess.onData(data => {
      if (mainWindow.isDestroyed()) return
      mainWindow.webContents.send('terminal:data', id, data)
    })

    // shell 退出时通知 renderer
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
      // pty 已结束时忽略 resize
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
