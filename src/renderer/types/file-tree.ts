/** 工作区文件树中的一个节点 */
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

/** chokidar 检测到变化后由 main 推送的事件 */
export interface FileChangeEvent {
  type: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'
  path: string
}
