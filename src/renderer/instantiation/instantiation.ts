/**
 * Dependency-injection core — a faithful, trimmed-down port of VSCode's
 * `vs/platform/instantiation/common/instantiation.ts`.
 *
 * A `ServiceIdentifier<T>` is simultaneously:
 *   1. a unique token used to register/look up a service, and
 *   2. a *parameter decorator* used in constructors:
 *        constructor(@IEditorService private editor: IEditorService) {}
 *
 * The decorator records `{ id, index }` onto the constructor's static metadata.
 * The InstantiationService later reads that metadata to inject dependencies —
 * NO `emitDecoratorMetadata` / reflect-metadata required (exactly like VSCode).
 */

export namespace _util {
  export const serviceIds = new Map<string, ServiceIdentifier<unknown>>()

  export const DI_TARGET = '$di$target'
  export const DI_DEPENDENCIES = '$di$dependencies'

  export function getServiceDependencies(
    ctor: unknown
  ): { id: ServiceIdentifier<unknown>; index: number }[] {
    return (ctor as Record<string, unknown>)[DI_DEPENDENCIES] as
      | { id: ServiceIdentifier<unknown>; index: number }[]
      | undefined ?? []
  }
}

export interface ServiceIdentifier<T> {
  (target: object, key: string | undefined, index: number): void
  type: T
}

/** Record that constructor `target` needs service `id` at parameter `index` */
function storeServiceDependency(id: ServiceIdentifier<unknown>, target: object, index: number): void {
  const t = target as Record<string, unknown>
  if (t[_util.DI_TARGET] === target) {
    ;(t[_util.DI_DEPENDENCIES] as { id: ServiceIdentifier<unknown>; index: number }[]).push({ id, index })
  } else {
    t[_util.DI_DEPENDENCIES] = [{ id, index }]
    t[_util.DI_TARGET] = target
  }
}

/**
 * Create a service identifier + parameter decorator under a unique string id.
 * Calling it twice with the same id returns the same identifier (idempotent).
 */
export function createDecorator<T>(serviceId: string): ServiceIdentifier<T> {
  const existing = _util.serviceIds.get(serviceId)
  if (existing) return existing as ServiceIdentifier<T>

  const id = function (target: object, _key: string | undefined, index: number): void {
    if (arguments.length !== 3) {
      throw new Error('@' + serviceId + ' can only be used to decorate a constructor parameter')
    }
    storeServiceDependency(id as ServiceIdentifier<unknown>, target, index)
  } as ServiceIdentifier<T>

  id.toString = () => serviceId

  _util.serviceIds.set(serviceId, id as ServiceIdentifier<unknown>)
  return id
}

/** Convenience type: maps a service identifier to its service interface */
export type GetLeadingNonServiceArgs<TArgs extends unknown[]> = TArgs

/** The instantiation service itself is injectable */
export interface IInstantiationService {
  readonly _serviceBrand: undefined
  createInstance<T>(ctor: new (...args: never[]) => T, ...staticArgs: unknown[]): T
  get<T>(id: ServiceIdentifier<T>): T
}

export const IInstantiationService = createDecorator<IInstantiationService>('instantiationService')
