/**
 * 依赖注入核心：忠实但精简地移植 VSCode
 * `vs/platform/instantiation/common/instantiation.ts`。
 *
 * `ServiceIdentifier<T>` 同时是：
 *   1. 注册/查找服务时使用的唯一 token
 *   2. 构造函数中的参数装饰器：
 *        constructor(@IEditorService private editor: IEditorService) {}
 *
 * 装饰器会把 `{ id, index }` 记录到构造函数的静态元数据上。
 * InstantiationService 随后读取这些元数据来注入依赖，
 * 无需 `emitDecoratorMetadata` / reflect-metadata（与 VSCode 一致）。
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

/** 记录构造函数 `target` 的第 `index` 个参数需要服务 `id` */
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
 * 用唯一字符串 id 创建服务标识符 + 参数装饰器。
 * 使用同一个 id 重复调用会返回同一个标识符（幂等）。
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

/** 便捷类型：把服务标识映射到对应服务接口 */
export type GetLeadingNonServiceArgs<TArgs extends unknown[]> = TArgs

/** InstantiationService 本身也可以被注入 */
export interface IInstantiationService {
  readonly _serviceBrand: undefined
  createInstance<T>(ctor: new (...args: never[]) => T, ...staticArgs: unknown[]): T
  get<T>(id: ServiceIdentifier<T>): T
}

export const IInstantiationService = createDecorator<IInstantiationService>('instantiationService')
