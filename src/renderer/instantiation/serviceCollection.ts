import { ServiceIdentifier } from './instantiation'
import { SyncDescriptor } from './descriptors'

/**
 * A map of service id → instance OR SyncDescriptor (not yet instantiated).
 * Mirrors VSCode's `vs/platform/instantiation/common/serviceCollection.ts`.
 */
export class ServiceCollection {
  private _entries = new Map<ServiceIdentifier<unknown>, unknown>()

  constructor(...entries: [ServiceIdentifier<unknown>, unknown][]) {
    for (const [id, service] of entries) {
      this._entries.set(id, service)
    }
  }

  set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
    const result = this._entries.get(id) as T | SyncDescriptor<T>
    this._entries.set(id, instanceOrDescriptor)
    return result
  }

  has(id: ServiceIdentifier<unknown>): boolean {
    return this._entries.has(id)
  }

  get<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> | undefined {
    return this._entries.get(id) as T | SyncDescriptor<T> | undefined
  }
}
