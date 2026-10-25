// What the window may ask of the app (electron/preload.ts exposes it as window.tilesearch). The window
// has no Node: every file, process and dialog goes through these calls, which electron/main.ts serves.

export type RunState = "running" | "stopped" | "finished" | "failed";

export interface OutFile {
	name: string;
	path: string;
	k: number;
	/** The corner labels in the file name, rewritten as the board's own symbols. */
	labels: string;
	orientable: boolean;
	edges: number;
	bytes: number;
}

export interface RunOptions {
	/** --k: the range for this run, when it differs from the board's. */
	k?: [number, number];
	threads: number;
	/** --nice: 0 is normal priority, 19 the lowest. */
	nice: number;
}

/** tileestimate's report: estimates with their standard errors, as [value, se]. */
export interface Estimate {
	seconds: number;
	probes: number;
	nodes: [number, number];
	/** Engine CPU seconds on one thread. */
	cpu: [number, number];
	perK: Record<number, { complete: [number, number]; unique: [number, number] }>;
	/** Exact tilings per k in the roots already finished when the estimate started; it covers the rest. */
	base: Record<number, number>;
}

export interface Run {
	id: string;
	dir: string;
	/** The run folder's name, without the date stamp a new run's folder carries. */
	name: string;
	/** When it was made, in ms. */
	created: number;
	board: string;
	state: RunState;
	note: string;
	counts: Record<number, number>;
	total: number;
	elapsed: number;
	rate: number;
	roots: { done: number; all: number };
	kmin: number;
	kmax: number;
	options: RunOptions | null;
	files: OutFile[];
	log: string[];
	/** symbols.txt: how the free symbols print in certificates (X1 → dent). */
	symbols: Record<string, string>;
	stats: string | null;
	/** The size estimate (tools/searcher/tileestimate.cpp), refined while the run goes. */
	estimate: Estimate | null;
	/** Seconds left, with a low and high end, once the engine reports the nodes it has visited. */
	eta: { seconds: number; low: number; high: number } | null;
}

export interface Settings {
	root: string;
	threads: number;
	nice: number;
	cores: number;
	platform: string;
	version: string;
}

export interface Status {
	/** The output folder, and the folders in it that group runs (absolute paths, sorted). */
	root: string;
	folders: string[];
	runs: Run[];
	freeBytes: number;
	minFreeBytes: number;
}

export type Check = { ok: true; dump: string } | { ok: false; line: number | null; message: string };

export interface Api {
	examples(): Promise<{ name: string; text: string }[]>;
	/** `tilesearch --dump`: the engine's own verdict on a board. */
	check(text: string): Promise<Check>;
	openBoard(): Promise<{ path: string; text: string } | null>;
	saveBoard(text: string, name: string): Promise<string | null>;
	settings(): Promise<Settings>;
	setSettings(s: Partial<Pick<Settings, "threads" | "nice">>): Promise<Settings>;
	chooseRoot(): Promise<Settings>;
	start(board: string, name: string, options: RunOptions): Promise<{ id: string } | { error: string }>;
	resume(id: string, options: RunOptions): Promise<{ error?: string }>;
	stop(id: string): Promise<void>;
	reveal(path: string): Promise<void>;
	/** Rename a run or a folder: its folder on disk. Not while a run in it is going. */
	rename(path: string, name: string): Promise<{ path: string } | { error: string }>;
	/** Move a run or a folder into `folder` (the output folder or one of its folders). */
	move(path: string, folder: string): Promise<{ path: string } | { error: string }>;
	/** Delete a run or a folder and everything in it, permanently. */
	remove(path: string): Promise<{ error?: string }>;
	mkdir(parent: string, name: string): Promise<{ path: string } | { error: string }>;
	/** The start of a file, up to `max` bytes. */
	readFile(path: string, max: number): Promise<string>;
	status(): Promise<Status>;
	/** Estimate a board's size before running it: a few seconds of tileestimate. */
	estimate(board: string, k?: [number, number]): Promise<Estimate | { error: string }>;
	/** Stop every run and quit. */
	quit(): Promise<void>;
	/** The app was asked to quit while runs are going: the window asks whether to stop them. */
	onQuitRequest(cb: () => void): () => void;
	onStatus(cb: (s: Status) => void): () => void;
	/** The test hook (electron/main.ts) drives the window through these. */
	onHook(cb: (h: Hook) => void): () => void;
}

export type Hook = { load: string } | { run: true };

declare global {
	interface Window {
		tilesearch: Api;
	}
}
