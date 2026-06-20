import { ServiceIdentifier } from "./instantiation";
import { SyncDescriptor } from "./descriptors";

/**
 * Singleton service registry — port of VSCode's
 * `registerSingleton` from `vs/platform/instantiation/common/extensions.ts`.
 *
 * Each service module calls `registerSingleton(IFooService, FooService)` at
 * import time. At startup we read the registry to build the root
 * ServiceCollection (all as lazy SyncDescriptors).
 */
const _registry: [ServiceIdentifier<unknown>, SyncDescriptor<unknown>][] = [];

export function registerSingleton<T, Services extends unknown[]>(
	id: ServiceIdentifier<T>,
	ctor: new (...services: Services) => T
): void {
	// 第二个参数是SyncDescriptor的实例化
	_registry.push([id as ServiceIdentifier<unknown>, new SyncDescriptor(ctor as never)]);
}

// 获取所有service 的描述
export function getSingletonServiceDescriptors(): [ServiceIdentifier<unknown>, SyncDescriptor<unknown>][] {
	return _registry;
}
