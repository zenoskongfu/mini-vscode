import { IInstantiationService, ServiceIdentifier, _util } from "./instantiation";
import { ServiceCollection } from "./serviceCollection";
import { SyncDescriptor } from "./descriptors";

/**
 * InstantiationService：VSCode
 * `vs/platform/instantiation/common/instantiationService.ts` 的精简移植版。
 *
 * - `createInstance(Ctor, ...staticArgs)` 会读取构造函数记录的服务依赖并注入它们，
 *   遵循 VSCode 的约定：服务参数位于构造函数参数末尾。
 * - `get(id)` 返回单例，并在首次访问时懒实例化对应的 SyncDescriptor。
 */
export class InstantiationService implements IInstantiationService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly _services: ServiceCollection = new ServiceCollection()) {
		// TODO: 这里为什么要把自己放进去，为了自己也可以被当作依赖注入
		this._services.set(IInstantiationService, this);
	}

	createInstance<T>(ctor: new (...args: never[]) => T, ...staticArgs: unknown[]): T {
		const dependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);

		const serviceArgs: unknown[] = [];
		for (const dependency of dependencies) {
			serviceArgs.push(this._getOrCreateServiceInstance(dependency.id));
		}

		// 服务参数位于末尾：先放静态参数，再追加注入服务。
		const firstServiceArgPos = dependencies.length > 0 ? dependencies[0].index : staticArgs.length;
		const args = staticArgs.slice(0, firstServiceArgPos);

		return new ctor(...(args as never[]), ...(serviceArgs as never[]));
	}

	get<T>(id: ServiceIdentifier<T>): T {
		return this._getOrCreateServiceInstance(id);
	}

	private _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>): T {
		const thing = this._services.get(id);

		if (thing === undefined) {
			throw new Error("[DI] Unknown service: " + id.toString());
		}

		if (thing instanceof SyncDescriptor) {
			// 懒实例化后，把实例缓存回 service collection。
			const instance = this.createInstance(thing.ctor as never, ...thing.staticArguments);
			this._services.set(id, instance);
			return instance;
		}

		return thing;
	}
}
