import { InstantiationService } from '../instantiation/instantiationService'
import { ServiceCollection } from '../instantiation/serviceCollection'
import { getSingletonServiceDescriptors } from '../instantiation/extensions'

// 导入服务模块以触发它们的 registerSingleton() 副作用。
// （每个模块会在导入时把自己注册进单例注册表。）
import '../services/storage/storageService'
import '../services/workspace/workspaceService'
import '../services/editor/editorService'
import '../services/layout/layoutService'
import '../services/commands/commandService'
import '../services/keybinding/keybindingService'
import '../services/quickinput/quickInputService'
import '../services/terminal/terminalService'
import '../services/configuration/configurationService'
import '../services/theme/themeService'
import '../services/notification/notificationService'
import '../services/language/languageFeaturesService'
import '../services/extensions/extensionService'
import '../services/diagnostics/diagnosticsService'
import '../services/debug/debugService'

/**
 * 从所有已注册单例构建根 InstantiationService。
 * 服务以懒加载 SyncDescriptor 保存，并在首次 get() 时实例化。
 */
export function createInstantiationService(): InstantiationService {
  const collection = new ServiceCollection()
  for (const [id, descriptor] of getSingletonServiceDescriptors()) {
    collection.set(id, descriptor)
  }
  return new InstantiationService(collection)
}
