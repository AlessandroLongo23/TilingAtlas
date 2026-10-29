// The window's only door to the app: the calls in src/bridge.ts, each one an IPC message to main.ts.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { Api, Hook, Status } from "../src/bridge";

const call =
	(name: string) =>
	(...args: unknown[]) =>
		ipcRenderer.invoke(name, ...args);
const listen =
	<T>(channel: string) =>
	(cb: (v: T) => void) => {
		const f = (_: IpcRendererEvent, v: T) => cb(v);
		ipcRenderer.on(channel, f);
		return () => void ipcRenderer.removeListener(channel, f);
	};

const api: Api = {
	check: call("check") as Api["check"],
	openBoard: call("openBoard") as Api["openBoard"],
	saveBoard: call("saveBoard") as Api["saveBoard"],
	settings: call("settings") as Api["settings"],
	setSettings: call("setSettings") as Api["setSettings"],
	chooseRoot: call("chooseRoot") as Api["chooseRoot"],
	start: call("start") as Api["start"],
	resume: call("resume") as Api["resume"],
	stop: call("stop") as Api["stop"],
	reveal: call("reveal") as Api["reveal"],
	rename: call("rename") as Api["rename"],
	move: call("move") as Api["move"],
	remove: call("remove") as Api["remove"],
	mkdir: call("mkdir") as Api["mkdir"],
	readFile: call("readFile") as Api["readFile"],
	status: call("status") as Api["status"],
	estimate: call("estimate") as Api["estimate"],
	onStatus: listen<Status>("status"),
	onHook: listen<Hook>("hook"),
	quit: call("quit") as Api["quit"],
	onQuitRequest: listen<void>("quit-request"),
};
contextBridge.exposeInMainWorld("tilesearch", api);
