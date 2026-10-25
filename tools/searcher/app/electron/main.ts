// TileSearch's main process: the window, and everything the window may not do itself (files, the
// tilesearch processes, dialogs). The window is the Tiling Atlas's own React components (src/), served
// from the bundle, so the app works offline.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import type { Check, Estimate, Hook, RunOptions, Settings, Status } from "../src/bridge";
import { MIN_FREE_BYTES, runEstimator, Runs } from "./runs";

const exe = (name: string) => (process.platform === "win32" ? `${name}.exe` : name);
// packaged: Contents/Resources (mac) or resources\ (Windows); from source: tools/searcher/
const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, "../..");
const ENGINE = path.join(RESOURCES, exe("tilesearch"));
const ESTIMATOR = path.join(RESOURCES, exe("tileestimate"));
const BOARDS = path.join(RESOURCES, "boards");
const SETTINGS = () => path.join(app.getPath("userData"), "settings.json");

type Saved = Pick<Settings, "root" | "threads" | "nice">;
function loadSettings(): Saved {
	const cores = os.availableParallelism();
	const fallback: Saved = { root: path.join(app.getPath("documents"), "TileSearch"), threads: cores, nice: 10 };
	try {
		return { ...fallback, ...JSON.parse(fs.readFileSync(SETTINGS(), "utf8")) };
	} catch {
		return fallback;
	}
}
let saved: Saved;
const saveSettings = () => fs.writeFileSync(SETTINGS(), JSON.stringify(saved, null, "\t") + "\n");
const settings = (): Settings => ({
	...saved,
	cores: os.availableParallelism(),
	platform: process.platform,
	version: app.getVersion(),
});

let win: BrowserWindow | null = null;
let runs: Runs;

function status(): Status {
	return {
		root: runs.root,
		folders: runs.folders,
		runs: runs.runs.map((r) => r.snapshot()),
		freeBytes: runs.freeBytes(),
		minFreeBytes: MIN_FREE_BYTES,
	};
}

function checkBoard(text: string): Promise<Check> {
	const f = path.join(os.tmpdir(), `tilesearch-check-${process.pid}.board`);
	fs.writeFileSync(f, text);
	return new Promise((resolve) =>
		execFile(ENGINE, [f, "--dump"], { timeout: 10_000 }, (err, stdout, stderr) => {
			if (!err) return resolve({ ok: true, dump: stdout });
			const m = /board line (\d+): (.*)/.exec(stderr);
			resolve(
				m
					? { ok: false, line: Number(m[1]), message: m[2] }
					: { ok: false, line: null, message: (stderr || err.message).trim() },
			);
		}),
	);
}

function start(id: string, options: RunOptions): string | null {
	const run = runs.get(id);
	if (!run) return "That run no longer exists.";
	if (!fs.existsSync(ENGINE)) return `tilesearch is missing (looked for ${ENGINE}).`;
	if (runs.freeBytes() < MIN_FREE_BYTES) return (run.note = "Not started: under 10 GB free on disk");
	return run.start(ENGINE, options, ESTIMATOR);
}

function handlers() {
	ipcMain.handle("examples", () =>
		fs.existsSync(BOARDS)
			? fs
					.readdirSync(BOARDS)
					.filter((f) => f.endsWith(".board"))
					.sort()
					.map((f) => ({ name: f.replace(/\.board$/, ""), text: fs.readFileSync(path.join(BOARDS, f), "utf8") }))
			: [],
	);
	ipcMain.handle("check", (_, text: string) => checkBoard(text));
	// a board's size before it runs: a few seconds of tileestimate on all but one core
	ipcMain.handle("estimate", (_, text: string, k?: [number, number]) => {
		if (!fs.existsSync(ESTIMATOR)) return { error: "tileestimate is missing from the app." };
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tileestimate-"));
		fs.writeFileSync(path.join(dir, "input.board"), text);
		const args = ["input.board", "--seconds", "8", "--threads", String(Math.max(1, os.availableParallelism() - 1))];
		if (k) args.push("--k", String(k[0]), String(k[1]));
		return new Promise<Estimate | { error: string }>((resolve) => {
			let last: Estimate | null = null;
			const child = runEstimator(ESTIMATOR, dir, args, {}, (e) => (last = e));
			child.on("exit", () => {
				fs.rmSync(dir, { recursive: true, force: true });
				resolve(last ?? { error: "The estimate did not run: check the board." });
			});
		});
	});
	ipcMain.handle("openBoard", async () => {
		const r = await dialog.showOpenDialog(win!, {
			properties: ["openFile"],
			filters: [
				{ name: "Boards", extensions: ["board", "txt"] },
				{ name: "All files", extensions: ["*"] },
			],
		});
		if (r.canceled || !r.filePaths[0]) return null;
		return { path: r.filePaths[0], text: fs.readFileSync(r.filePaths[0], "utf8") };
	});
	ipcMain.handle("saveBoard", async (_, text: string, name: string) => {
		const r = await dialog.showSaveDialog(win!, { defaultPath: `${name}.board` });
		if (r.canceled || !r.filePath) return null;
		fs.writeFileSync(r.filePath, text);
		return r.filePath;
	});
	ipcMain.handle("settings", () => settings());
	ipcMain.handle("setSettings", (_, s: Partial<Saved>) => {
		saved = { ...saved, ...s, root: saved.root };
		saveSettings();
		return settings();
	});
	ipcMain.handle("chooseRoot", async () => {
		const r = await dialog.showOpenDialog(win!, {
			defaultPath: saved.root,
			properties: ["openDirectory", "createDirectory"],
		});
		if (!r.canceled && r.filePaths[0]) {
			saved.root = r.filePaths[0];
			saveSettings();
			runs.root = saved.root;
			runs.rescan();
			push();
		}
		return settings();
	});
	ipcMain.handle("start", (_, board: string, name: string, options: RunOptions) => {
		const run = runs.create(board, name);
		const error = start(run.dir, options);
		push();
		return error ? { error, id: run.dir } : { id: run.dir };
	});
	ipcMain.handle("resume", (_, id: string, options: RunOptions) => {
		const error = start(id, options);
		push();
		return error ? { error } : {};
	});
	ipcMain.handle("stop", (_, id: string) => {
		runs.get(id)?.stop();
	});
	// runs and folders: each answers with the new path or an error the window shows as it is
	const changed = <T>(r: T) => (push(), r);
	ipcMain.handle("rename", (_, p: string, name: string) => changed(runs.rename(p, name)));
	ipcMain.handle("move", (_, p: string, folder: string) => changed(runs.move(p, folder)));
	ipcMain.handle("remove", (_, p: string) => changed(runs.remove(p)));
	ipcMain.handle("mkdir", (_, parent: string, name: string) => changed(runs.mkdir(parent, name)));
	ipcMain.handle("reveal", (_, p: string) => shell.showItemInFolder(p));
	ipcMain.handle("readFile", (_, p: string, max: number) => {
		// only files inside the output folder: the window names paths, so it must not name any path
		const rel = path.relative(saved.root, p);
		if (rel.startsWith("..") || path.isAbsolute(rel)) return "";
		const fd = fs.openSync(p, "r");
		try {
			const buf = Buffer.alloc(max);
			return buf.subarray(0, fs.readSync(fd, buf, 0, max, 0)).toString("utf8");
		} finally {
			fs.closeSync(fd);
		}
	});
	ipcMain.handle("status", () => status());
	ipcMain.handle("quit", () => quitNow());
}

function push() {
	win?.webContents.send("status", status());
}

// Twice a second: progress to the window, and the free-disk guard. Every second: rescan output files.
// Every 4 s: the output folder itself, so folders made or removed in Finder or Explorer show up.
let ticks = 0;
function tick() {
	const free = runs.freeBytes();
	for (const r of runs.runs)
		if (r.state === "running") {
			if (ticks % 2 === 0) r.scanFiles();
			if (free < MIN_FREE_BYTES) r.stop("Stopped: under 10 GB free on disk");
		}
	if (ticks % 8 === 0) runs.rescan();
	ticks++;
	push();
}

// Test hook, for checking the window without Screen Recording permission (the shell that builds this
// has none): TILESEARCH_BOARD=<file> loads a board, TILESEARCH_RUN=<output folder> runs it there,
// TILESEARCH_STOP / _RESUME / _QUIT=<seconds> stop it, resume it and quit, TILESEARCH_EVAL=<js> runs
// in the window once it has loaded, and TILESEARCH_SNAPSHOT=<prefix> writes <prefix>-<s>.png of the
// window at each of TILESEARCH_SHOTS (default 2,6,15) seconds. TILESEARCH_SIZE=<w>x<h> sizes the window,
// TILESEARCH_HIDDEN=1 keeps it off screen, and TILESEARCH_ROOT=<folder> is the output folder for this
// launch only (TILESEARCH_RUN sets it too).
function testHook(w: BrowserWindow) {
	const env = process.env;
	const hook = (h: Hook) => w.webContents.send("hook", h);
	const at = (key: string, f: () => void) => {
		const s = Number(env[key]);
		if (env[key] && Number.isFinite(s)) setTimeout(f, s * 1000);
	};
	if (env.TILESEARCH_BOARD) hook({ load: fs.readFileSync(env.TILESEARCH_BOARD, "utf8") });
	if (env.TILESEARCH_RUN) setTimeout(() => hook({ run: true }), 1000);
	if (env.TILESEARCH_EVAL) void w.webContents.executeJavaScript(env.TILESEARCH_EVAL);
	at("TILESEARCH_STOP", () => runs.runs[0]?.stop());
	at("TILESEARCH_RESUME", () => {
		const r = runs.runs[0];
		if (r) start(r.dir, r.options ?? { threads: saved.threads, nice: saved.nice });
	});
	at("TILESEARCH_QUIT", () => void quitNow());
	if (!env.TILESEARCH_SNAPSHOT) return;
	for (const s of (env.TILESEARCH_SHOTS ?? "2,6,15").split(",").map(Number).filter(Number.isFinite))
		setTimeout(async () => {
			const img = await w.webContents.capturePage();
			fs.writeFileSync(`${env.TILESEARCH_SNAPSHOT}-${s}.png`, img.toPNG());
		}, s * 1000);
}

app.whenReady().then(() => {
	saved = loadSettings();
	const root = process.env.TILESEARCH_RUN ?? process.env.TILESEARCH_ROOT;
	if (root) saved.root = path.resolve(root); // not saved: saveSettings runs only on a change in the window
	runs = new Runs(saved.root);
	handlers();
	const [w, h] = (process.env.TILESEARCH_SIZE ?? "1440x900").split("x").map(Number);
	win = new BrowserWindow({
		width: w,
		height: h,
		minWidth: 1040,
		minHeight: 680,
		title: "TileSearch",
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#1a1b1e" : "#fafaf9",
		show: !process.env.TILESEARCH_HIDDEN,
		webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
	});
	// links open in the browser, never inside the app
	win.webContents.setWindowOpenHandler(({ url }) => (void shell.openExternal(url), { action: "deny" }));
	win.webContents.on("will-navigate", (e) => e.preventDefault());
	void win.loadFile(path.join(__dirname, "renderer/index.html"));
	win.webContents.once("did-finish-load", () => testHook(win!));
	setInterval(tick, 500);
});

// a search must not outlive the app that started it
// A search must not outlive the app that started it, and quitting must not stop one by surprise: with
// runs going, closing the window or Cmd+Q asks first (the window's modal), and only then stops them.
let quitting = false;
const running = () => runs?.runs.filter((r) => r.state === "running").length ?? 0;
function askToQuit(e: Electron.Event) {
	if (quitting || !running()) return;
	e.preventDefault();
	if (win && !win.isDestroyed()) win.webContents.send("quit-request");
	else void quitNow(); // no window to ask in
}

/** Stop every run, wait for its engine to exit (at most 5 s), then quit. */
async function quitNow() {
	quitting = true;
	for (const r of runs.runs) r.stop("Stopped when TileSearch quit");
	for (let t = 0; running() && t < 50; t++) await new Promise((ok) => setTimeout(ok, 100));
	app.quit();
}
app.on("before-quit", askToQuit);
app.on("browser-window-created", (_, w) => w.on("close", askToQuit));
app.on("window-all-closed", () => app.quit());
