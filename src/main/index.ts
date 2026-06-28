import { app } from "electron";
import { WindowManager } from "./window-manager";
import { IPCRouter } from "./ipc-router";
import { ExtensionHost } from "./extensions/extensionHostProcess";
import { LifecycleMainService } from "./lifecycle-main-service";

let windowManager: WindowManager;
let ipcRouter: IPCRouter | undefined;
let extensionHost: ExtensionHost | undefined;

const lifecycleMainService = new LifecycleMainService();
lifecycleMainService.registerListeners();
lifecycleMainService.onWillShutdown(event => {
	event.join('ipcRouter', ipcRouter?.dispose() ?? Promise.resolve());
	event.join('extensionHost', extensionHost?.dispose() ?? Promise.resolve());
});

app.whenReady().then(() => {
	windowManager = new WindowManager();
	const mainWindow = windowManager.createMainWindow();

	ipcRouter = new IPCRouter(windowManager);
	ipcRouter.register();

	// 启动隔离的扩展宿主（utilityProcess），并转交它的通信端口
	extensionHost = new ExtensionHost();
	extensionHost.start(mainWindow);

	app.on("activate", () => {
		// macOS 专用处理
		if (windowManager.getMainWindow() === null) {
			windowManager.createMainWindow();
		}
	});
});

app.on("window-all-closed", () => {
	// Windows/Linux 专用处理
	if (process.platform !== "darwin") {
		app.quit();
	}
});
