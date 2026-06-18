import { app } from "electron";
import { WindowManager } from "./window-manager";
import { IPCRouter } from "./ipc-router";

let windowManager: WindowManager;

app.whenReady().then(() => {
	windowManager = new WindowManager();
	windowManager.createMainWindow();

	const ipcRouter = new IPCRouter(windowManager);
	ipcRouter.register();

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
