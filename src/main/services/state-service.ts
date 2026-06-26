import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'

type State = Record<string, unknown>

/**
 * StateService（main 进程）—— 应用状态的后端持久化（state.json）。
 *
 * 与 ConfigService（用户可编辑的 settings.json）不同，这里存的是「应用内部状态」
 * （上次打开的文件夹等），对应 VSCode 把工作区状态放在主进程而非渲染层 storage：
 * 每次 set 立即原子写盘，因此即使渲染层崩溃 / 进程被强杀也不会丢失
 * （渲染层 localStorage 是带缓冲的，强杀会丢未落盘的写入）。
 */
export class StateService {
  private readonly dir = path.join(os.homedir(), '.mini-vscode')
  private readonly file = path.join(this.dir, 'state.json')
  private state: State = {}

  /** 启动时同步读取，让 state:get 可以立即返回 */
  init(): void {
    try {
      if (fs.existsSync(this.file)) {
        this.state = JSON.parse(fs.readFileSync(this.file, 'utf-8'))
      }
    } catch {
      this.state = {}
    }
  }

  get(): State {
    return this.state
  }

  /** 合并部分更新并原子写盘（立即落盘，抗强杀） */
  async set(partial: State): Promise<void> {
    this.state = { ...this.state, ...partial }
    await fsp.mkdir(this.dir, { recursive: true })
    const tmp = `${this.file}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf-8')
    await fsp.rename(tmp, this.file)
  }
}
