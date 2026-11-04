// The Tiling Searcher's main process: the window, and everything the window may not do itself (files, the
// tilesearch processes, dialogs). The window is the Tiling Atlas's own React components (src/), served
// from the bundle, so the app works offline.
import { type ChildProcess, execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, nativeTheme, shell } from "electron";
import { raiseCeiling, raiseStop, type RaiseRule, type Check, type Estimate, type Hook, type Rule, type RunOptions, type Settings, type Status, type StudyOptions } from "../src/bridge";
import { MIN_FREE_BYTES, ruleEnv, runEstimator, Runs, STAMP, type RunFolder } from "./runs";
import { Studies, Study, type Context } from "./studies";

const exe = (name: string) => (process.platform === "win32" ? `${name}.exe` : name);
// packaged: Contents/Resources (mac) or resources\ (Windows); from source: tools/searcher/
const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, "../..");
const ENGINE = path.join(RESOURCES, exe("tilesearch"));
const ESTIMATOR = path.join(RESOURCES, exe("tileestimate"));
const EXAMPLES = path.join(RESOURCES, app.isPackaged ? "examples" : "boards/examples");
const SETTINGS = () => path.join(app.getPath("userData"), "settings.json");
// The app was called TileSearch until 0.3.1: carry its data folder (settings, remembered UI state) over.
// If the new folder already exists (a launch under the new name came first), still carry the settings,
// which say where the runs are.
const OLD_DATA = path.join(app.getPath("appData"), "TileSearch");
// test hook: a launch with its own data folder, beside an installed app that is running
if (process.env.TILESEARCH_DATA) app.setPath("userData", path.resolve(process.env.TILESEARCH_DATA));
else if (fs.existsSync(OLD_DATA)) {
	if (!fs.existsSync(app.getPath("userData"))) fs.cpSync(OLD_DATA, app.getPath("userData"), { recursive: true });
	else if (!fs.existsSync(SETTINGS()) && fs.existsSync(path.join(OLD_DATA, "settings.json")))
		fs.copyFileSync(path.join(OLD_DATA, "settings.json"), SETTINGS());
}

type Saved = Pick<Settings, "root" | "threads" | "nice"> & {
	/** The folder boards were last opened from or saved to: both dialogs start there. */
	boards?: string;
	/** At most this many searches at once (0: no limit); the rest wait in `queue`, in order. */
	maxRunning?: number;
	queue?: { id: string; options: RunOptions }[];
	/** Start again, on launch, the runs the last quit (or a crash) left unfinished. */
	resumeOnLaunch?: boolean;
	/** The runs going when the app last quit, and how they ran. */
	interrupted?: { id: string; options: RunOptions }[];
	/** Gzip a run's tiling files as it finishes; on unless turned off. */
	compressFinished?: boolean;
};
function loadSettings(): Saved {
	const cores = os.availableParallelism();
	const fallback: Saved = { root: path.join(app.getPath("documents"), "The Tiling Searcher"), threads: cores, nice: 10 };
	try {
		return { ...fallback, ...JSON.parse(fs.readFileSync(SETTINGS(), "utf8")) };
	} catch {
		return fallback;
	}
}
let saved: Saved;
const saveSettings = () => fs.writeFileSync(SETTINGS(), JSON.stringify(saved, null, "\t") + "\n");
const settings = (): Settings => ({
	root: saved.root,
	threads: saved.threads,
	nice: saved.nice,
	maxRunning: saved.maxRunning ?? 0,
	resumeOnLaunch: !!saved.resumeOnLaunch,
	compressFinished: saved.compressFinished !== false,
	// the login item is the system's to keep, not settings.json's; a build run from source has none
	openAtLogin: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false,
	canOpenAtLogin: app.isPackaged && process.platform !== "linux",
	cores: os.availableParallelism(),
	platform: process.platform,
	version: app.getVersion(),
});

let win: BrowserWindow | null = null;
let runs: Runs;
const studies = new Studies();
const byDir = () => new Map<string, RunFolder>(runs.runs.map((r) => [r.dir, r]));
const isQueued = (id: string) => queue().some((e) => e.id === id);
const studyContext = (): Context => ({ runs, engine: ENGINE, start: (id, o) => start(id, o, false), full });

function status(): Status {
	studies.rescan(runs);
	const dirs = byDir();
	return {
		root: runs.root,
		folders: runs.folders,
		runs: runs.runs.map((r) => {
			const q = queue().findIndex((e) => e.id === r.dir);
			return { ...r.snapshot(), queued: q < 0 ? null : q + 1 };
		}),
		studies: studies.list().map((s) => s.summary(dirs, isQueued)),
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

// ── the queue: past maxRunning searches, a start waits its turn ──

const queue = () => (saved.queue ??= []);
const full = () => !!saved.maxRunning && running() >= saved.maxRunning;
/** Start a run now, or put it at the back of the queue when maxRunning are already going. */
function launch(id: string, options: RunOptions, estimate = true): { error?: string; queued?: number } {
	if (!full()) {
		const error = start(id, options, estimate);
		return error ? { error } : {};
	}
	if (!queue().some((e) => e.id === id)) queue().push({ id, options });
	saveSettings();
	return { queued: queue().findIndex((e) => e.id === id) + 1 };
}
/** Start queued runs while there is room: each tick, and after a change to the limit. */
function drain() {
	let changed = false;
	while (queue().length && !full()) {
		const { id, options } = queue().shift()!;
		changed = true;
		const run = runs.get(id);
		if (!run || run.state === "running" || run.state === "finished") continue;
		const error = start(id, options);
		if (error) run.note = `Not started from the queue: ${error}`;
	}
	if (changed) saveSettings();
}
/** A renamed or moved folder carries its queued runs along. */
function carry(from: string, to: string) {
	for (const e of queue())
		if (e.id === from || e.id.startsWith(from + path.sep)) e.id = to + e.id.slice(from.length);
	saveSettings();
}

/** Start (or resume) a run; `estimate` runs the size estimator beside it, which a study's many small rows skip. */
function start(id: string, options: RunOptions, estimate = true): string | null {
	const run = runs.get(id);
	if (!run) return "That run no longer exists.";
	if (!fs.existsSync(ENGINE)) return `tilesearch is missing (looked for ${ENGINE}).`;
	if (runs.freeBytes() < MIN_FREE_BYTES) return (run.note = "Not started: under 10 GB free on disk");
	return run.start(ENGINE, options, estimate ? ESTIMATOR : undefined, app.getVersion());
}

/**
 * The vertex lines no periodic tiling of the board can use (tilesearch --balance: the balance LP and the
 * local search from each type, in turn until neither drops one). Usually instant; a newer board cancels
 * the call still running for an older one, which then answers null.
 */
let balancing: ChildProcess | null = null;
function balanceBoard(text: string): Promise<{ dead: number[] } | { error: string } | null> {
	balancing?.kill();
	const f = path.join(os.tmpdir(), `tilesearch-balance-${process.pid}.board`);
	fs.writeFileSync(f, text);
	return new Promise((resolve) => {
		const child = execFile(ENGINE, [f, "--balance"], { timeout: 60_000 }, (err, stdout) => {
			if (balancing === child) balancing = null;
			if (child.killed) return resolve(null);
			try {
				const r = JSON.parse(stdout.split("\n")[0]) as { dead: number[] };
				resolve({ dead: r.dead });
			} catch {
				resolve({ error: (err?.message ?? stdout).trim() });
			}
		});
		balancing = child;
	});
}

function handlers() {
	ipcMain.handle("check", (_, text: string) => checkBoard(text));
	ipcMain.handle("balance", (_, text: string) => balanceBoard(text));
	// a board's size before it runs: a few seconds of tileestimate on all but one core
	ipcMain.handle("estimate", (_, text: string, k?: [number, number], rule?: Rule) => {
		if (!fs.existsSync(ESTIMATOR)) return { error: "tileestimate is missing from the app." };
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tileestimate-"));
		fs.writeFileSync(path.join(dir, "input.board"), text);
		const args = ["input.board", "--seconds", "8", "--threads", String(Math.max(1, os.availableParallelism() - 1))];
		if (k) args.push("--k", String(k[0]), String(k[1]));
		return new Promise<Estimate | { error: string }>((resolve) => {
			let last: Estimate | null = null;
			const child = runEstimator(ESTIMATOR, dir, args, {}, ruleEnv(rule), (e) => (last = e));
			child.on("exit", () => {
				fs.rmSync(dir, { recursive: true, force: true });
				resolve(last ?? { error: "The estimate did not run: check the board." });
			});
		});
	});
	// Open and Save share one folder, the last one either used (Documents until then).
	const boardsDir = () => saved.boards ?? app.getPath("documents");
	const rememberBoards = (file: string) => {
		saved.boards = path.dirname(file);
		saveSettings();
	};
	ipcMain.handle("openBoard", async () => {
		const r = await dialog.showOpenDialog(win!, {
			defaultPath: boardsDir(),
			properties: ["openFile"],
			filters: [
				{ name: "Boards", extensions: ["board", "txt"] },
				{ name: "All files", extensions: ["*"] },
			],
		});
		if (r.canceled || !r.filePaths[0]) return null;
		rememberBoards(r.filePaths[0]);
		return { path: r.filePaths[0], text: fs.readFileSync(r.filePaths[0], "utf8") };
	});
	ipcMain.handle("saveBoard", async (_, text: string, name: string) => {
		const r = await dialog.showSaveDialog(win!, { defaultPath: path.join(boardsDir(), `${name}.board`) });
		if (r.canceled || !r.filePath) return null;
		fs.writeFileSync(r.filePath, text);
		rememberBoards(r.filePath);
		return r.filePath;
	});
	ipcMain.handle("settings", () => settings());
	ipcMain.handle("setSettings", (_, s: Partial<Settings>) => {
		const { threads, nice, maxRunning, resumeOnLaunch, openAtLogin, compressFinished } = s;
		saved = {
			...saved,
			...(threads !== undefined ? { threads } : {}),
			...(nice !== undefined ? { nice } : {}),
			...(maxRunning !== undefined ? { maxRunning: Math.max(0, Math.round(maxRunning)) } : {}),
			...(resumeOnLaunch !== undefined ? { resumeOnLaunch } : {}),
			...(compressFinished !== undefined ? { compressFinished } : {}),
		};
		if (openAtLogin !== undefined && app.isPackaged) app.setLoginItemSettings({ openAtLogin });
		saveSettings();
		drain(); // a higher limit starts what was waiting
		push();
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
	ipcMain.handle("start", (_, board: string, name: string, options: RunOptions, replaces?: string, folder?: string) => {
		const run = runs.create(board, name, folder);
		if (replaces) fs.writeFileSync(path.join(run.dir, "replaces.txt"), (run.replaces = replaces));
		const res = launch(run.dir, options);
		push();
		return { ...res, id: run.dir };
	});
	ipcMain.handle("resume", (_, id: string, options: RunOptions) => {
		const res = launch(id, options);
		push();
		return res;
	});
	ipcMain.handle("createStudy", (_, board: string, name: string, options: StudyOptions, folder?: string) => {
		if (!fs.existsSync(ENGINE)) return { id: "", error: `tilesearch is missing (looked for ${ENGINE}).` };
		const s = Study.create(runs, board, name, options, folder);
		if ("error" in s) return { id: "", error: s.error };
		studies.add(s);
		s.tick(studyContext(), byDir());
		push();
		return { id: s.dir };
	});
	ipcMain.handle("study", (_, id: string) => studies.get(id)?.detail(byDir(), isQueued) ?? null);
	ipcMain.handle("studyAction", (_, id: string, action: "pause" | "resume" | "unlimit" | "unraise") => {
		const s = studies.get(id);
		if (!s) return { error: "That study no longer exists." };
		if (action === "pause") s.pause(byDir());
		else if (action === "resume") s.resume();
		else if (action === "unraise") s.unraise(byDir());
		else s.unlimit(byDir());
		s.tick(studyContext(), byDir());
		push();
		return {};
	});
	ipcMain.handle("studyRaise", (_, id: string, rule: RaiseRule) => {
		const s = studies.get(id);
		if (!s) return { error: "That study no longer exists." };
		const on = s.raise(rule, byDir());
		s.tick(studyContext(), byDir());
		push();
		return { on };
	});
	ipcMain.handle("setRaise", (_, id: string, rule: RaiseRule | null) => {
		runs.get(id)?.setRaise(rule);
		push();
	});
	ipcMain.handle("stop", (_, id: string) => {
		// a queued run leaves the queue; a running one stops
		const q = queue().findIndex((e) => e.id === id);
		if (q >= 0) {
			queue().splice(q, 1);
			saveSettings();
			push();
		} else runs.get(id)?.stop();
	});
	// runs and folders: each answers with the new path or an error the window shows as it is
	const changed = <T>(r: T) => (push(), r);
	const moved = (p: string, r: { path: string } | { error: string }) => (
		"path" in r && (carry(p, r.path), studies.carry(p, r.path)), changed(r)
	);
	ipcMain.handle("rename", (_, p: string, name: string) => moved(p, runs.rename(p, name)));
	ipcMain.handle("move", (_, p: string, folder: string) => moved(p, runs.move(p, folder)));
	ipcMain.handle("remove", (_, p: string) => changed(runs.remove(p)));
	ipcMain.handle("mkdir", (_, parent: string, name: string) => changed(runs.mkdir(parent, name)));
	ipcMain.handle("reveal", (_, p: string) => shell.showItemInFolder(p));
	ipcMain.handle("readFile", (_, p: string, max: number) => {
		// only files inside the output folder: the window names paths, so it must not name any path
		const rel = path.relative(saved.root, p);
		if (rel.startsWith("..") || path.isAbsolute(rel)) return "";
		// certificates written on Windows end their lines with \r\n: the window reads \n
		if (p.endsWith(".gz")) return gunzipHead(p, max).then((t) => t.replace(/\r/g, ""));
		if (max <= 0) return fs.readFileSync(p, "utf8").replace(/\r/g, ""); // the whole file
		const fd = fs.openSync(p, "r");
		try {
			const buf = Buffer.alloc(max);
			return buf.subarray(0, fs.readSync(fd, buf, 0, max, 0)).toString("utf8").replace(/\r/g, "");
		} finally {
			fs.closeSync(fd);
		}
	});
	ipcMain.handle("countFiles", async (_, id: string) => {
		await runs.get(id)?.countFiles();
		push();
	});
		ipcMain.handle("compress", async (_, id: string, unpack?: boolean) => {
		const run = runs.get(id);
		return run ? changed(await run.compress(!!unpack, () => runs.freeBytes())) : { error: "No such run." };
	});
	ipcMain.handle("copyImage", async (e, rect: { x: number; y: number; width: number; height: number }) => {
		const r = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
		const png = (await e.sender.capturePage(r)).toPNG();
		await clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(png)], { type: "image/png" }) })]);
	});
	ipcMain.handle("examples", () =>
		fs
			.readdirSync(EXAMPLES)
			.filter((f) => f.endsWith(".board"))
			.sort()
			.map((f) => {
				const text = fs.readFileSync(path.join(EXAMPLES, f), "utf8");
				return { title: /^#\s*(.*)/.exec(text)?.[1] ?? f, text };
			}),
	);
	ipcMain.handle("status", () => status());
	ipcMain.handle("quit", () => quitNow());
}

function push() {
	win?.webContents.send("status", status());
}

/**
 * A finished enumeration whose raise rule does not hold yet searches its board again to k + 1: a new run beside it
 * that replaces it, as Raise k does, with the rule carried on (a study's row follows it). raised.txt keeps a run
 * from being raised twice, also when its successor is deleted. A study's rows skip the size estimator.
 */
function raiseFinished() {
	for (const r of runs.runs) {
		const rule = r.options?.raise;
		if (r.state !== "finished" || !rule || r.raised || r.options?.find) continue;
		const bytes = r.files.reduce((t, f) => t + f.bytes, 0);
		const why = raiseStop(rule, { total: r.total, seconds: r.elapsed, bytes, k: r.kRange[1] });
		if (why) {
			if (!r.note.includes(why)) r.note = r.note ? `${r.note}. ${why}` : why;
			continue;
		}
		const next = runs.create(r.board, path.basename(r.dir).replace(STAMP, "") || path.basename(r.dir), path.dirname(r.dir));
		fs.writeFileSync(path.join(next.dir, "replaces.txt"), (next.replaces = r.dir));
		fs.writeFileSync(path.join(r.dir, "raised.txt"), next.dir);
		r.raised = true;
		r.note = `Raised to k = ${r.kRange[1] + 1} by its rule`;
		const inStudy = studies.list().some((s) => r.dir.startsWith(s.dir + path.sep));
		const res = launch(next.dir, { ...r.options!, k: [r.kRange[0], r.kRange[1] + 1] }, !inStudy);
		if (res.error) next.note = `Not started: ${res.error}`;
	}
}

/** A search past a ceiling of its raise rule (minutes, GB) stops there, and the raising ends with it. */
function capRunning() {
	for (const r of runs.runs) {
		const rule = r.options?.raise;
		if (r.state !== "running" || !rule || r.options?.find) continue;
		const why = raiseCeiling(rule, { seconds: r.elapsed, bytes: r.files.reduce((t, f) => t + f.bytes, 0) });
		if (why) r.cap(`Stopped by its rule at k ≤ ${r.kRange[1]}: it ${why}. Resume finishes this search, raising no further`);
	}
}

/** Gzip each run as it finishes (compressFinished), once: a run unpacked by hand stays so, and a run its raise
 *  rule replaces is left as it is, to be deleted. */
function compressFinished() {
	for (const r of runs.runs) {
		if (!r.fresh) continue;
		r.fresh = false;
		if (!r.raised && saved.compressFinished !== false) void r.compress().then(push);
	}
}

/**
 * A run started to replace another (Improve) deletes it once it has finished, through the same guarded
 * remove as the Delete button. A stopped or failed run keeps its replaces.txt, so nothing is lost; the file
 * survives quitting, so a run finished in a later session still does it.
 */
function replaceFinished() {
	const due = runs.runs.filter((r) => r.state === "finished" && fs.existsSync(path.join(r.dir, "replaces.txt")));
	for (const r of due) {
		const file = path.join(r.dir, "replaces.txt");
		const old = fs.readFileSync(file, "utf8").trim();
		const error = old && old !== r.dir && fs.existsSync(old) ? runs.remove(old).error : undefined;
		if (error) r.note = `Could not delete the run it replaces: ${error}`;
		else {
			fs.rmSync(file, { force: true });
			r.replaces = null;
		}
	}
}

/** The first `max` bytes of a gzipped file's text, unpacking no more of it than that; all of it for 0. */
function gunzipHead(p: string, max: number): Promise<string> {
	if (max <= 0) max = Infinity;
	return new Promise((resolve) => {
		const parts: Buffer[] = [];
		let got = 0;
		const src = fs.createReadStream(p);
		const gz = zlib.createGunzip();
		const done = () => (src.destroy(), gz.destroy(), resolve(Buffer.concat(parts).subarray(0, max).toString("utf8")));
		gz.on("data", (b: Buffer) => (parts.push(b), (got += b.length) >= max && done()));
		gz.on("end", done);
		gz.on("error", done);
		src.pipe(gz);
	});
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
	capRunning();
	raiseFinished();
	compressFinished();
	if (ticks % 2 === 0) replaceFinished();
	drain();
	// studies start their rows after the queue: a search started by hand goes first
	const dirs = byDir();
	for (const s of studies.list()) s.tick(studyContext(), dirs);
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
	studies.rescan(runs);
	if (!saved.resumeOnLaunch) for (const s of studies.list()) s.holdAfterQuit();
	handlers();
	resumeInterrupted();
	const [w, h] = (process.env.TILESEARCH_SIZE ?? "1440x900").split("x").map(Number);
	win = new BrowserWindow({
		width: w,
		height: h,
		minWidth: 1040,
		minHeight: 680,
		title: "The Tiling Searcher",
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

/**
 * On launch, with resumeOnLaunch: the runs the last quit stopped, and any whose last session never
 * recorded an end (the app or the computer went down mid-search), go back on, through the queue.
 * Without it, nothing restarts and the queue is let go: those runs wait in Unfinished.
 */
function resumeInterrupted() {
	const was = saved.interrupted ?? [];
	saved.interrupted = [];
	if (!saved.resumeOnLaunch) {
		saved.queue = [];
		saveSettings();
		return;
	}
	const crashed = runs.runs
		.filter((r) => r.state === "stopped" && r.options && r.crashed())
		.map((r) => ({ id: r.dir, options: r.options! }));
	const queued = new Set(queue().map((e) => e.id));
	for (const e of [...was, ...crashed]) if (!queued.has(e.id)) (queued.add(e.id), launch(e.id, e.options));
	saveSettings();
}

/** Stop every run, wait for its engine to exit (at most 5 s), then quit. */
async function quitNow() {
	quitting = true;
	// what was going, so the next launch can start it again (resumeOnLaunch); the queue keeps its own list
	saved.interrupted = runs.runs.filter((r) => r.state === "running").map((r) => ({ id: r.dir, options: r.options! }));
	saveSettings();
	for (const s of studies.list()) s.flush();
	for (const r of runs.runs) r.stop("Stopped when the Tiling Searcher quit");
	for (let t = 0; running() && t < 50; t++) await new Promise((ok) => setTimeout(ok, 100));
	app.quit();
}
app.on("before-quit", askToQuit);
app.on("browser-window-created", (_, w) => w.on("close", askToQuit));
app.on("window-all-closed", () => app.quit());
