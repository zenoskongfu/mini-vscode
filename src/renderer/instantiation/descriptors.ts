/**
 * SyncDescriptor — a lazy "recipe" for a service.
 * Holds the constructor + any static (non-service) arguments. The
 * InstantiationService instantiates it on first access, enabling the
 * lazy/singleton behaviour VSCode relies on.
 */
export class SyncDescriptor<T> {
  constructor(
    readonly ctor: new (...args: never[]) => T,
    readonly staticArguments: unknown[] = []
  ) {}
}
