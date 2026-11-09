// What the window may ask of the app (electron/preload.ts exposes it as window.tilesearch). The window
// has no Node: every file, process and dialog goes through these calls, which electron/main.ts serves.
import { MAX_K } from "./board";

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
	/** Certificates in the file, null until counted. */
	tilings: number | null;
	/** Of those, how many have each number of face orbits; null until counted. */
	faces: Record<number, number> | null;
	/** Its run's symbols.txt, where a view reads the files of several runs (a study's whole board). */
	symbols?: Record<string, string>;
}

export interface RunOptions {
	/** --k: the range for this run, when it differs from the board's. */
	k?: [number, number];
	threads: number;
	/** --nice: 0 is normal priority, 19 the lowest. */
	nice: number;
	/** The branching rule, forced; left out, the engine measures both and picks one. */
	rule?: Rule;
	/** Look for one tiling meeting every required set (tilesearch --find), with at most `seconds` per k. */
	find?: { seconds: number };
	/** When it finishes, search again to k + 1 unless this rule says to stop (an enumeration only). */
	raise?: RaiseRule;
}
/** Branching on the fewest options (fail first) or on the face nearest to closing. */
export type Rule = "fewest" | "face";

/**
 * Raise k by itself (Marek and AL, 3 November 2026): the searches go one k at a time, the first to the lowest k,
 * each that finishes followed by one to the next k that replaces it (as Raise k does), until a search finds what
 * `found` asks or k reaches `upTo`. Time and disk are ceilings on each search: one that passes either stops there,
 * keeping what it finished, and the raising ends with it (in a study, the row is done and the study goes on).
 */
export interface RaiseRule {
	/** Stop raising once a search, run to its end, found at least this many tilings. */
	found?: number;
	/** A search that runs longer than this many minutes stops there. */
	minutes?: number;
	/** A search whose tiling files pass this many GB stops there. */
	gigabytes?: number;
	/** The highest k a search goes to. */
	upTo: number;
}

/** A raise rule in words: "one k at a time up to k = 20, until a search finds at least 1 tiling; a search stops past 1 min". */
export function describeRaise(r: RaiseRule): string {
	const caps = [r.minutes !== undefined && `${r.minutes} min`, r.gigabytes !== undefined && `${r.gigabytes} GB`].filter(Boolean);
	return `one k at a time up to k = ${r.upTo}${
		r.found !== undefined ? `, until a search finds at least ${r.found} tiling${r.found === 1 ? "" : "s"}` : ""
	}${caps.length ? `; a search stops past ${caps.join(" or ")}` : ""}`;
}

/** What a finished search came to, for its raise rule. */
export interface RaiseFacts {
	total: number;
	seconds: number;
	bytes: number;
	/** The highest k it searched. */
	k: number;
}

/** Why the raising ends after this finished search (said as the run's note), or null to search the next k. */
export function raiseStop(rule: RaiseRule, x: RaiseFacts): string | null {
	if (rule.found !== undefined && x.total >= rule.found)
		return `Stopped raising k at ${x.k}: it found ${x.total.toLocaleString("en")} tiling${x.total === 1 ? "" : "s"}`;
	if (x.k >= Math.min(rule.upTo, MAX_K)) return `Stopped raising k at ${x.k}, the highest it goes to`;
	return null;
}

/** A time limit in minutes, as read: "2 min", or seconds when it is not whole minutes ("30 s"). */
export const minutesText = (m: number) => (Number.isInteger(m) ? `${m} min` : `${Math.round(m * 60)} s`);

/** Which of its rule's ceilings a search still going has passed ("ran over 1 min"), or null. */
export function raiseCeiling(rule: RaiseRule, x: Pick<RaiseFacts, "seconds" | "bytes">): string | null {
	if (rule.minutes !== undefined && x.seconds > rule.minutes * 60) return `ran over ${minutesText(rule.minutes)}`;
	if (rule.gigabytes !== undefined && x.bytes > rule.gigabytes * 2 ** 30) return `wrote over ${rule.gigabytes} GB`;
	return null;
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
	/** When it last stopped or finished, in ms; null while running or never run. */
	ended: number | null;
	/** Its place in the queue (1 is next), or null when it is not waiting. */
	queued?: number | null;
	board: string;
	state: RunState;
	note: string;
	/** Its raise rule went on to a run of the next k, which replaces it when that one finishes. */
	raised?: boolean;
	/** The run it deletes once it finishes (replaces.txt): the one its raise rule, Raise k or Improve came from. */
	replaces?: string;
	/** A ceiling of its raise rule stopped it, and why. */
	capped?: string;
	counts: Record<number, number>;
	total: number;
	elapsed: number;
	rate: number;
	roots: {
		done: number;
		all: number;
		/** The roots in hand while running: each with its units finished and found so far (one unit when the run
		 *  is not split into units; the count grows while the root's head finds them). */
		active?: { root: number; done: number; all: number }[];
		/** The finished roots by number, when there are few enough to draw one by one. */
		finished?: number[];
	};
	/** What the engine does before its first root: builds its tables (`tables`, no count), tries the
	 *  start set and branching rule by sampling each (`plan`, done/all = tenths of a second spent, and the most it may spend) and orders the roots (`rank`, done/all = root types sampled). */
	stage: { name: string; done: number; all: number } | null;
	kmin: number;
	kmax: number;
	options: RunOptions | null;
	files: OutFile[];
	/** While running: a tiling found in a root still open (the engine's latest.txt, at most every 30 s), and
	 *  when it was written, in ms. Display only: a stop drops that root's tilings. */
	latest: { text: string; at: number } | null;
	log: string[];
	/** symbols.txt: how the free symbols print in certificates (X1 → dent). */
	symbols: Record<string, string>;
	stats: string | null;
	/** The rule the engine searches with, forced or picked by Auto (its `branching:` line); null until it has chosen. */
	branching: Rule | null;
	/** The size estimate (tools/searcher/tileestimate.cpp), refined while the run goes. */
	estimate: Estimate | null;
	/**
	 * How far the search is by its work, once the engine reports the nodes it has visited and the estimate
	 * has run: the share of the estimated nodes visited (of the roots left at a resume, when `resumed`), and
	 * the seconds left with a low and a high end once there is a rate (none once the visits pass the
	 * estimate, which was then too low: share is 1).
	 */
	work: {
		share: number;
		resumed: boolean;
		left: { seconds: number; low: number; high: number } | null;
	} | null;
		/** Files gzipped (or unpacked, `unpack`) so far while Compress or Decompress runs. */
		packing: { done: number; all: number; unpack: boolean } | null;
	/** A find run's report (find.json, written by tilesearch --find as it goes); null for a complete search. */
		find: FindReport | null;
	/** The run folder's size on disk, null until first measured. */
	disk: number | null;
}

/** tilesearch --find: the targets (the board's required sets, by name) and every step taken so far. */
export interface FindReport {
	targets: string[];
	/** The time limit per k. */
	seconds: number;
	/** The steps drop the vertex types no periodic tiling can use (balance LP). */
	prune: boolean;
	/** Proven: no tiling meets every target below this k (0 until something is proven). */
	proven: number;
	/** k of the tiling found, 0 for none (yet). */
	found: number;
	done: boolean;
	steps: FindStep[];
}

export interface FindStep {
	name: string;
	/** pair: two targets, full board; union: every target, on the vertex lines of pair tilings; full: every
	 *  target, full board; grow: one more target, on the lines of the tilings so far; all: every target at once. */
	kind: "pair" | "union" | "full" | "grow" | "all";
	what: string;
	/** The targets it asks for, by index; empty means all of them. */
	targets: number[];
	/** On the full board, so every k it finished without a tiling proves there is none there. */
	complete: boolean;
	/** Vertex lines on its board. */
	lines: number;
	kfrom: number;
	kto: number;
	/** The k being searched, while running. */
	k: number;
	state: "running" | "found" | "none" | "timed";
	found: number;
	/** The highest k searched to the end without a tiling. */
	through: number;
	/** Taken from an earlier session of this run. */
	kept: boolean;
}

export interface Settings {
	root: string;
	threads: number;
	nice: number;
	/** At most this many searches at once; 0 is no limit. Past it, a new search waits in the queue. */
	maxRunning: number;
	/** On launch, start again the runs the last quit, or a crash, left unfinished. */
	resumeOnLaunch: boolean;
	/** Gzip a run's tiling files as it finishes. */
	compressFinished: boolean;
	/** Ask, at launch, whether a newer version is out. */
	checkUpdates: boolean;
	/** Open the app when the user logs in (the system's login item). */
	openAtLogin: boolean;
	/** Whether this build can register a login item: a packaged app on macOS or Windows. */
	canOpenAtLogin: boolean;
	cores: number;
	platform: string;
	version: string;
}

/** A version newer than this one, from the release's version.json (electron/main.ts). */
export interface Update {
	version: string;
	/** Its "What's new", a line a change, with **label:** and `code` as the release notes write them. */
	notes: string[];
	os: "mac" | "windows";
	/** The atlas's page that downloads it. */
	url: string;
}

export interface Status {
	/** The output folder, and the folders in it that group runs (absolute paths, sorted). */
	root: string;
	folders: string[];
	runs: Run[];
	/** The studies under the output folder (study.ts): each a folder whose rows are runs. */
	studies: StudySummary[];
	freeBytes: number;
	minFreeBytes: number;
}

// ── studies: one board, a row per combination of its optional faces and parameter values ──

/** Count every tiling of each row up to k, or prove for each row that one exists. */
export type StudyMode = "enumerate" | "find";

export interface StudyOptions {
	mode: StudyMode;
	/** find: the time limit per k, in each step. */
	seconds: number;
	/** Stop a row after this many seconds of search, 0 for none. A stopped row can go on later. */
	limit: number;
	/** Rows searched at once. */
	parallel: number;
	/** Threads for each row. */
	threads: number;
	nice: number;
	rule?: Rule;
	/** Each row's run raises its k by this rule (an enumeration study only). */
	raise?: RaiseRule;
}

/**
 * Where a row stands. Ruled out: a check before any search proved it has no tiling at any k. Same: an
 * earlier row has the same board. Found / none: its search finished (none means none up to `through`).
 * Limit: stopped at the study's time limit. Conflict: ruled out, yet an adopted run found tilings: a bug.
 */
export type RowState =
	| "checking"
	| "ruled-out"
	| "same"
	| "waiting"
	| "queued"
	| "running"
	| "found"
	| "none"
	| "limit"
	| "stopped"
	| "failed"
	| "conflict";

export interface StudyRow {
	index: number;
	name: string;
	/** The optional faces it holds, by name. */
	faces: string[];
	values: Record<string, number>;
	state: RowState;
	/** Why it is ruled out, which row it repeats, or why it failed. */
	reason?: string;
	/** What ruled it out: a corner no vertex holds (static), the balance count, or faces that cannot meet. */
	by?: "static" | "balance" | "split";
	/** Its run, when it has one; `adopted` when that run was made outside the study. */
	run?: string;
	adopted?: boolean;
	counts: Record<number, number>;
	total: number;
	/** k of its first tiling. */
	first?: number;
	/** The highest k searched to the end without a tiling. */
	through?: number;
	/** The highest k its run went to: the top of its k range, or for a find run the k it found or proved up to. */
	reached?: number;
	elapsed: number;
	roots?: { done: number; all: number };
	/** Raised (Raise k): its new search, unfinished, to k; the row shows what the search before it found. */
	raising?: { state: "running" | "queued" | "stopped"; k: number };
}

/** A status as pushed: a run unchanged since the push before comes as its id. */
export type StatusPush = Omit<Status, "runs"> & { runs: (Run | string)[] };

export interface StudySummary {
	id: string;
	dir: string;
	name: string;
	created: number;
	ended: number | null;
	state: "checking" | "running" | "paused" | "done";
	note: string;
	options: StudyOptions;
	kmin: number;
	kmax: number;
	params: { name: string; values: number[] }[];
	/** The optional faces, by name, and how many a row holds. */
	optional: string[];
	sizes: [number, number];
	/** Required groups a row's optional faces each meet: a subset that misses one is no row. */
	required: number;
	rowCount: number;
	/** Rows checked before any search, of rowCount. */
	checked: number;
	tally: Partial<Record<RowState, number>>;
	/** Search time of the study's own rows. */
	elapsed: number;
	/** Rows whose raised search has not finished (StudyRow.raising). */
	raising: number;
}

export interface StudyDetail extends StudySummary {
	rows: StudyRow[];
	/** The study board, as written. */
	template: string;
	/** Optional faces an edit of the board took out, oldest first. */
	removed: RemovedFace[];
}

/** What a study's rows found for one optional face (faceTally in study.ts). */
export interface FaceTally {
	rows: number;
	/** Rows with tilings, and their tilings. */
	found: number;
	tilings: number;
	/** Rows without tilings that are not searched to the end yet. */
	left: number;
	/** The least k every other row without tilings was searched to, when none is left. */
	through?: number;
	/** Every row was ruled out before any search: no tiling at any k. */
	proven: boolean;
}

/** An optional face an edit took out of a study, with what its rows had found then. */
export interface RemovedFace extends FaceTally {
	face: string;
	/** When, as an ISO date. */
	at: string;
}

/** What an edit of a study's board does to its rows (Study.edit). */
export interface StudyEdit {
	rows: number;
	/** Rows whose board is the same: they keep their checks and searches. */
	kept: number;
	/** Rows whose board changed: checked and searched again. */
	changed: number;
	added: number;
	dropped: number;
	/** Dropped or changed rows that have tilings: what the study stops holding. */
	lost: { name: string; tilings: number }[];
	removed: RemovedFace[];
}

export type Check = { ok: true; dump: string } | { ok: false; line: number | null; message: string };

export interface Api {
	/** `tilesearch --dump`: the engine's own verdict on a board. */
	check(text: string): Promise<Check>;
	/** `tilesearch --balance`: the board's vertex lines (1-based) that no periodic tiling can use, by the
	 *  balance LP and the local search from each type. A newer call cancels an older one, which answers null. */
	balance(text: string): Promise<{ dead: number[] } | { error: string } | null>;
	openBoard(): Promise<{ path: string; text: string } | null>;
	saveBoard(text: string, name: string): Promise<string | null>;
	settings(): Promise<Settings>;
	setSettings(
		s: Partial<
			Pick<Settings, "threads" | "nice" | "maxRunning" | "resumeOnLaunch" | "openAtLogin" | "compressFinished" | "checkUpdates">
		>,
	): Promise<Settings>;
	/** A newer version, asked once a launch; null when there is none, the check is off, or GitHub can't be reached. */
	update(): Promise<Update | null>;
	/** Don't offer this version again. */
	skipUpdate(version: string): Promise<void>;
	chooseRoot(): Promise<Settings>;
	/** Start a run, in `folder` (the output folder when absent), or queue it past the limit (`queued`: its place).
	 *  With `replaces`, that run is deleted once this one finishes (replaces.txt in its folder). */
	start(
		board: string,
		name: string,
		options: RunOptions,
		replaces?: string,
		folder?: string,
	): Promise<{ id: string; error?: string; queued?: number }>;
	resume(id: string, options: RunOptions): Promise<{ error?: string; queued?: number }>;
	/** Start a study of a study board (study.ts), in `folder` (the output folder when absent). */
	createStudy(board: string, name: string, options: StudyOptions, folder?: string): Promise<{ id: string; error?: string }>;
	/** A study with its rows; null when it no longer exists. */
	study(id: string): Promise<StudyDetail | null>;
	/** Pause a study (its running rows stop, and go on when it resumes), resume it, stop raising k, or finish the
	 *  searches a time limit stopped (studies.ts finish: how many go on). */
	studyAction(id: string, action: "pause" | "resume" | "unraise" | "finish"): Promise<{ error?: string; on?: number }>;
	/** Rows at once, threads per row and priority for a study; `restart` restarts the searches going now. */
	studyResources(
		id: string,
		o: Pick<StudyOptions, "parallel" | "threads" | "nice">,
		restart: boolean,
	): Promise<{ error?: string }>;
	/** What an edited study board does to the study's rows (studies.ts edit); with `apply`, the study takes it. */
	studyEdit(id: string, text: string, apply: boolean): Promise<StudyEdit | { error: string }>;
	/** A new time limit on each search, in minutes, or none (studies.ts setLimit): how many rows go on. */
	studyLimit(id: string, minutes: number | null): Promise<{ error?: string; on?: number }>;
	/** A new raise rule for a whole study, and the rows it sends on (studies.ts raise): how many go on. */
	studyRaise(id: string, rule: RaiseRule): Promise<{ error?: string; on?: number }>;
	/** A run's raise rule changed, or taken off (null): the k it is on still finishes. */
	setRaise(id: string, rule: RaiseRule | null): Promise<void>;
	stop(id: string): Promise<void>;
	reveal(path: string): Promise<void>;
	/** Rename a run or a folder: its folder on disk. Not while a run in it is going. */
	rename(path: string, name: string): Promise<{ path: string } | { error: string }>;
	/** Move a run or a folder into `folder` (the output folder or one of its folders). */
	move(path: string, folder: string): Promise<{ path: string } | { error: string }>;
	/** Delete a run or a folder and everything in it, permanently. */
	remove(path: string): Promise<{ error?: string }>;
	mkdir(parent: string, name: string): Promise<{ path: string } | { error: string }>;
	/** The start of a file, up to `max` bytes (of its text, for a gzipped file); the whole file for 0. With `faces`,
	 *  a certificate file's certificates of that many face orbits only, whole, until they pass `max` bytes. */
	readFile(path: string, max: number, faces?: number): Promise<string>;
	/** Writes a finished run's shape colour order, shapes.json, into its folder. */
	saveShapes(dir: string, text: string): Promise<void>;
	/** Count the tilings in a run's files (OutFile.tilings), for the Files tab. */
	countFiles(id: string): Promise<void>;
		/** Gzip a finished run's certificate files in place, or with `unpack` turn them back into plain text. */
	compress(id: string, unpack?: boolean): Promise<{ error?: string }>;
	/** The window's pixels in `rect` (CSS px), onto the clipboard as an image. */
	copyImage(rect: { x: number; y: number; width: number; height: number }): Promise<void>;
	/** The boards that come with the app, each with its first line's title. */
	examples(): Promise<{ title: string; text: string }[]>;
	status(): Promise<Status>;
	/** Estimate a board's size before running it: a few seconds of tileestimate. */
	estimate(board: string, k?: [number, number], rule?: Rule): Promise<Estimate | { error: string }>;
	/** Stop every run and quit. */
	quit(): Promise<void>;
	/** The app was asked to quit while runs are going: the window asks whether to stop them. */
	onQuitRequest(cb: () => void): () => void;
	/** A board an atlas link brought before the window listened; null if none. Asked once, on mount. */
	takeBoard(): Promise<string | null>;
	/** Pushed every tick: the runs unchanged since the last push come by id (main.ts push). */
	onStatus(cb: (s: StatusPush) => void): () => void;
	/** The test hook (electron/main.ts) drives the window through these. */
	onHook(cb: (h: Hook) => void): () => void;
}

export type Hook = { load: string } | { run: true };

declare global {
	interface Window {
		tilesearch: Api;
	}
}
