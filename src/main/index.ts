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

	// Launch the isolated extension host (utilityProcess) and broker its port
	extensionHost = new ExtensionHost();
	extensionHost.start(mainWindow);

	app.on("activate", () => {
		// for mac
		if (windowManager.getMainWindow() === null) {
			windowManager.createMainWindow();
		}
	});
});

app.on("window-all-closed", () => {
	// for windows and linux
	if (process.platform !== "darwin") {
		app.quit();
	}
});
