import { InstantiationService } from '../instantiation/instantiationService'
import { ServiceCollection } from '../instantiation/serviceCollection'
import { getSingletonServiceDescriptors } from '../instantiation/extensions'

// Import service modules for their registerSingleton() side-effects.
// (Each module registers itself into the singleton registry at import time.)
import '../services/storage/storageService'
import '../services/workspace/workspaceService'
import '../services/editor/editorService'
import '../services/layout/layoutService'
import '../services/commands/commandService'
import '../services/keybinding/keybindingService'
import '../services/quickinput/quickInputService'

/**
 * Build the root InstantiationService from all registered singletons.
 * Services are stored as lazy SyncDescriptors and instantiated on first get().
 */
export function createInstantiationService(): InstantiationService {
  const collection = new ServiceCollection()
  for (const [id, descriptor] of getSingletonServiceDescriptors()) {
    collection.set(id, descriptor)
  }
  return new InstantiationService(collection)
}
