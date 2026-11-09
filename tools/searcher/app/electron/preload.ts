// The window's only door to the app: the calls in src/bridge.ts, each one an IPC message to main.ts.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { Api, Hook, Status, StatusPush } from "../src/bridge";

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
	balance: call("balance") as Api["balance"],
	openBoard: call("openBoard") as Api["openBoard"],
	saveBoard: call("saveBoard") as Api["saveBoard"],
	settings: call("settings") as Api["settings"],
	setSettings: call("setSettings") as Api["setSettings"],
	update: call("update") as Api["update"],
	skipUpdate: call("skipUpdate") as Api["skipUpdate"],
	chooseRoot: call("chooseRoot") as Api["chooseRoot"],
	start: call("start") as Api["start"],
	resume: call("resume") as Api["resume"],
	createStudy: call("createStudy") as Api["createStudy"],
	study: call("study") as Api["study"],
	studyAction: call("studyAction") as Api["studyAction"],
	setRaise: call("setRaise") as Api["setRaise"],
	studyRaise: call("studyRaise") as Api["studyRaise"],
	studyLimit: call("studyLimit") as Api["studyLimit"],
	studyResources: call("studyResources") as Api["studyResources"],
	studyEdit: call("studyEdit") as Api["studyEdit"],
	stop: call("stop") as Api["stop"],
	reveal: call("reveal") as Api["reveal"],
	rename: call("rename") as Api["rename"],
	move: call("move") as Api["move"],
	remove: call("remove") as Api["remove"],
	mkdir: call("mkdir") as Api["mkdir"],
	readFile: call("readFile") as Api["readFile"],
	saveShapes: call("saveShapes") as Api["saveShapes"],
	compress: call("compress") as Api["compress"],
	countFiles: call("countFiles") as Api["countFiles"],
	copyImage: call("copyImage") as Api["copyImage"],
	examples: call("examples") as Api["examples"],
	status: call("status") as Api["status"],
	estimate: call("estimate") as Api["estimate"],
	onStatus: listen<StatusPush>("status"),
	onHook: listen<Hook>("hook"),
	quit: call("quit") as Api["quit"],
	onQuitRequest: listen<void>("quit-request"),
	takeBoard: call("takeBoard") as Api["takeBoard"],
};
contextBridge.exposeInMainWorld("tilesearch", api);
