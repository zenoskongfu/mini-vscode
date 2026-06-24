/**
 * SyncDescriptor：服务的懒加载“配方”。
 * 保存构造函数以及静态（非服务）参数；InstantiationService 会在首次访问时实例化它，
 * 从而支持 VSCode 依赖的懒单例行为。
 */
export class SyncDescriptor<T> {
  constructor(
    readonly ctor: new (...args: never[]) => T,
    readonly staticArguments: unknown[] = []
  ) {}
}
