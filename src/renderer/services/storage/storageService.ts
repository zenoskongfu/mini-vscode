import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

/**
 * 存储作用域：对应 VSCode 的 StorageScope。
 * GLOBAL 跨所有工作区持久化；WORKSPACE 针对当前打开文件夹。
 */
export const enum StorageScope {
  GLOBAL = 'global',
  WORKSPACE = 'workspace'
}

export interface IStorageService {
  readonly _serviceBrand: undefined

  readonly onDidChange: Event<{ scope: StorageScope; key: string }>

  get(key: string, scope: StorageScope, fallback: string): string
  get(key: string, scope: StorageScope): string | undefined
  getBoolean(key: string, scope: StorageScope, fallback: boolean): boolean
  getObject<T>(key: string, scope: StorageScope, fallback: T): T
  store(key: string, value: string | number | boolean | object, scope: StorageScope): void
  remove(key: string, scope: StorageScope): void
}

export const IStorageService = createDecorator<IStorageService>('storageService')

/**
 * 基于 localStorage 的实现（memento 模式）。
 * key 会按作用域加命名空间，确保 GLOBAL 与 WORKSPACE 不会冲突。
 */
export class StorageService implements IStorageService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChange = new Emitter<{ scope: StorageScope; key: string }>()
  readonly onDidChange = this._onDidChange.event

  private _key(key: string, scope: StorageScope): string {
    return `mini-vscode:${scope}:${key}`
  }

  get(key: string, scope: StorageScope, fallback?: string): string | undefined {
    const raw = localStorage.getItem(this._key(key, scope))
    return raw ?? fallback
  }

  getBoolean(key: string, scope: StorageScope, fallback: boolean): boolean {
    const raw = this.get(key, scope)
    return raw === undefined ? fallback : raw === 'true'
  }

  getObject<T>(key: string, scope: StorageScope, fallback: T): T {
    const raw = this.get(key, scope)
    if (raw === undefined) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  store(key: string, value: string | number | boolean | object, scope: StorageScope): void {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value)
    localStorage.setItem(this._key(key, scope), serialized)
    this._onDidChange.fire({ scope, key })
  }

  remove(key: string, scope: StorageScope): void {
    localStorage.removeItem(this._key(key, scope))
    this._onDidChange.fire({ scope, key })
  }
}

registerSingleton(IStorageService, StorageService)
