import { app } from "electron";
import { WindowManager } from "./window-manager";
import { IPCRouter } from "./ipc-router";
import { ExtensionHost } from "./extensions/extensionHostProcess";

let windowManager: WindowManager;
let extensionHost: ExtensionHost;

app.whenReady().then(() => {
	windowManager = new WindowManager();
	const mainWindow = windowManager.createMainWindow();

	const ipcRouter = new IPCRouter(windowManager);
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
