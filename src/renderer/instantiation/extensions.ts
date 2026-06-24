import { ServiceIdentifier } from "./instantiation";
import { SyncDescriptor } from "./descriptors";

/**
 * 单例服务注册表：VSCode `vs/platform/instantiation/common/extensions.ts` 的移植版。
 *
 * 每个服务模块在导入时调用 `registerSingleton(IFooService, FooService)`。
 * 启动阶段读取该注册表，构建根 ServiceCollection（全部以懒加载 SyncDescriptor 保存）。
 */
const _registry: [ServiceIdentifier<unknown>, SyncDescriptor<unknown>][] = [];

export function registerSingleton<T, Services extends unknown[]>(
	id: ServiceIdentifier<T>,
	ctor: new (...services: Services) => T
): void {
	// 第二个参数是SyncDescriptor的实例化
	_registry.push([id as ServiceIdentifier<unknown>, new SyncDescriptor(ctor as never)]);
}

// 获取所有 service 的描述
export function getSingletonServiceDescriptors(): [ServiceIdentifier<unknown>, SyncDescriptor<unknown>][] {
	return _registry;
}
