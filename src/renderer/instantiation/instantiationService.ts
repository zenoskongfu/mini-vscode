import { IInstantiationService, ServiceIdentifier, _util } from "./instantiation";
import { ServiceCollection } from "./serviceCollection";
import { SyncDescriptor } from "./descriptors";

/**
 * InstantiationService — trimmed-down port of VSCode's
 * `vs/platform/instantiation/common/instantiationService.ts`.
 *
 * - `createInstance(Ctor, ...staticArgs)` reads the constructor's recorded
 *   service dependencies and injects them, following VSCode's convention that
 *   service params are the *trailing* constructor parameters.
 * - `get(id)` returns the singleton, instantiating its SyncDescriptor lazily
 *   on first access.
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

		// Services are trailing params: place static args first, then injected services.
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
			// Lazily instantiate, then cache the instance back into the collection.
			const instance = this.createInstance(thing.ctor as never, ...thing.staticArguments);
			this._services.set(id, instance);
			return instance;
		}

		return thing;
	}
}
