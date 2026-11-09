// Run folders and the tilesearch processes in them. Each run is a folder under the output folder:
// input.board, run.json (the options it was started with, so a resume repeats them), then
// solver_<name>/ once the engine starts. census.txt ending in MAX means finished; otherwise roots.done
// lists the finished roots, units.done the finished units of the others (in a run split into units), and
// `tilesearch --resume` runs the rest.
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import type { Estimate, OutFile, RaiseRule, Rule, Run, RunOptions } from "../src/bridge";

/** The environment that forces `rule` on tilesearch and tileestimate. */
export const ruleEnv = (rule?: Rule): Record<string, string> =>
	rule === "fewest" ? { TILESEARCH_FAIL_FIRST: "1" } : rule === "face" ? { TILESEARCH_FACE_FIRST: "1" } : {};
import { engineText, parse } from "../src/board";

export const MIN_FREE_BYTES = 10 * 2 ** 30;
const LOG_LINES = 2000;
/** The engine's `branching: on the face nearest to closing` (or `on the fewest options`) line, as a rule. */
const ruleOf = (line: string): Rule | null =>
	line.startsWith("branching:") ? (line.includes("face") ? "face" : "fewest") : null;

// the engine on Windows ends its lines with \r\n (census.txt's MAX line among them): read as \n
const read = (f: string) => {
	try {
		return fs.readFileSync(f, "utf8").replace(/\r/g, "");
	} catch {
		return "";
	}
};

// Tilings per certificate file, and how many have each number of face orbits, counted when the window shows a
// run's files or tilings (never at startup: the output folder can hold gigabytes), one file at a time, then only
// over the bytes appended since: the engine only appends, except when it undoes a merge cut short, which shrinks
// the file and recounts it. A run keeps its counts in tilings.json, so they are counted once. `bytes` is the size
// counted; `from`, where its last complete certificate ended, is where the next count of a plain file starts.
// A count kept before 9 November 2026 has no `faces`, and is counted again.
type Count = { bytes: number; n: number; faces?: Record<number, number>; from?: number };
const counted = new Map<string, Count>();
const counting = new Set<string>();

/**
 * Every complete certificate in a certificate file, from byte `from` of a plain file (a gzipped one is read
 * whole), with its face orbits: the lines that start with a corner, as `1/0(A3) - *0'/1'(A3) - …` does, one per
 * orbit. `visit` gets the certificate's text when it asks, and answers false to stop. Answers the bytes read and
 * the offset past the last line that left no certificate open.
 */
export async function eachCertificate(
	p: string,
	from: number,
	visit: (faces: number, text: () => string) => boolean | void,
): Promise<{ bytes: number; end: number }> {
	const gz = p.endsWith(".gz");
	const file = fs.createReadStream(p, gz ? {} : { start: from });
	let [at, end, faces] = [gz ? 0 : from, gz ? 0 : from, 0];
	let lines: Buffer[] = [];
	let carry: Buffer = Buffer.alloc(0);
	try {
		for await (const got of gz ? file.pipe(zlib.createGunzip()) : file) {
			const chunk = carry.length ? Buffer.concat([carry, got as Buffer]) : (got as Buffer);
			let i = 0;
			for (let nl; (nl = chunk.indexOf(10, i)) >= 0; i = nl + 1) {
				const c = chunk[i];
				if (c === 0x2d && chunk[i + 1] === 0x2d && chunk[i + 2] === 0x2d) {
					// "---" closes the certificate
					const mine = lines;
					if (visit(faces, () => Buffer.concat(mine).toString("utf8")) === false) return { bytes: at + nl + 1, end: at + nl + 1 };
					[lines, faces] = [[], 0];
				} else if (nl - i > 1 || (nl - i === 1 && c !== 0x0d)) {
					// a line with text (a lone \r is a blank line written on Windows); a digit or * starts a face orbit
					lines.push(chunk.subarray(i, nl + 1));
					if ((c >= 0x30 && c <= 0x39) || c === 0x2a) faces++;
				}
				if (!lines.length) end = at + nl + 1;
			}
			at += i;
			carry = chunk.subarray(i);
		}
	} finally {
		file.destroy();
	}
	return { bytes: at + carry.length, end };
}

async function countTilings(p: string, bytes: number) {
	if (counting.has(p)) return;
	counting.add(p);
	try {
		// a compressed file no longer grows, and is read whole; a plain one from where its last count ended
		const gz = p.endsWith(".gz");
		const had = counted.get(p);
		const on = !gz && had?.faces && typeof had.from === "number" && had.bytes <= bytes ? had : null;
		const faces: Record<number, number> = { ...on?.faces };
		let n = on?.n ?? 0;
		const read = await eachCertificate(p, on?.from ?? 0, (f) => void (n++, (faces[f] = (faces[f] ?? 0) + 1)));
		counted.set(p, gz ? { bytes, n, faces } : { bytes: read.bytes, n, faces, from: read.end });
	} catch {
		// unreadable: not tried again until its size changes
		counted.set(p, { bytes, n: -1 });
	} finally {
		counting.delete(p);
	}
}

/** Past this many roots the overview draws a bar, so the finished ones are not sent one by one. */
const MAX_DRAWN_ROOTS = 4096;

// <name>solver_<kk>_<labels>[_o]_<E>.txt
const OUT_FILE = /solver_(\d+)_(.+?)(_o)?_(\d+)\.txt(?:\.gz)?$/;

/**
 * File names print label numbers in hex (A30 is A1e) and free symbols as X<n>. Rewrite them as the
 * board's symbols, longest match first; a name no symbol explains is left as it is.
 */
export function decodeLabels(s: string, symbols: string[], free: Record<string, string>): string {
	const byPrinted = new Map<string, string>([["Pi", "Pi"]]);
	for (const sym of symbols) {
		const m = /^([SMLABCDEFG]?)([1-9][0-9]*|oo)$/.exec(sym);
		// a free symbol prints as itself since runs began naming them, as X<n> before
		byPrinted.set(m ? m[1] + (m[2] === "oo" ? "oo" : Number(m[2]).toString(16)) : sym, sym);
	}
	for (const [x, sym] of Object.entries(free)) byPrinted.set("X" + Number(x.slice(1)).toString(16), sym);
	const keys = [...byPrinted.keys()].sort((a, b) => b.length - a.length);
	const out: string[] = [];
	for (let rest = s; rest; ) {
		const k = keys.find((p) => rest.startsWith(p));
		if (!k) return s;
		out.push(byPrinted.get(k)!);
		rest = rest.slice(k.length);
	}
	return out.join(" ");
}

/**
 * Run tileestimate and hand over each report it prints (one a second). It runs at the lowest priority:
 * the estimate must never slow the search it is estimating.
 */
export function runEstimator(
	exe: string,
	cwd: string,
	args: string[],
	base: Record<number, number>,
	env: Record<string, string>,
	onEstimate: (e: Estimate) => void,
) {
	const child = spawn(exe, args, {
		cwd,
		stdio: ["ignore", "pipe", "ignore"],
		windowsHide: true,
		env: { ...process.env, ...env },
	});
	if (child.pid)
		try {
			os.setPriority(child.pid, 19);
		} catch {}
	let buffer = "";
	let cur: Estimate | null = null;
	child.on("error", () => {});
	child.stdout!.on("data", (d: Buffer) => {
		buffer += d.toString("utf8");
		let nl: number;
		while ((nl = buffer.indexOf("\n")) >= 0) {
			const t = buffer.slice(0, nl).trim().split(/\s+/);
			buffer = buffer.slice(nl + 1);
			const n = (i: number) => Number(t[i]) || 0;
			if (t[0] === "estimate")
				cur = { seconds: n(1), probes: n(2), nodes: [n(4), n(5)], cpu: [n(7), n(8)], perK: {}, base };
			else if (t[0] === "k" && cur) cur.perK[n(1)] = { complete: [n(3), n(4)], unique: [n(6), n(7)] };
			else if (t[0] === "end" && cur) onEstimate(cur);
		}
	});
	return child;
}

const ESTIMATE_SECONDS = 3600;

/**
 * One start or resume of the engine on a run, as sessions.json records it. A tiling found by the run is
 * checkable on its own; that the run found ALL of them is a claim about these sessions, so they name the
 * exact engine (its SHA-256) and how each one ended. An import trusts a k only when every session that
 * worked on it ran the same engine and the last one finished.
 */
export interface Session {
	engine: string;
	app: string;
	platform: string;
	started: string;
	threads: number;
	nice: number;
	k?: [number, number];
	rule?: Rule;
	resumed: boolean;
	ended?: string;
	exit?: number;
	seconds?: number;
	finished?: boolean;
	/** The roots the engine reported, so a stopped run can say how many are left. */
	roots?: number;
}

const engineHashes = new Map<string, string>();
function engineHash(exe: string): string {
	let h = engineHashes.get(exe);
	if (!h) {
		try {
			h = createHash("sha256").update(fs.readFileSync(exe)).digest("hex");
		} catch {
			h = "unknown";
		}
		engineHashes.set(exe, h);
	}
	return h;
}

/** A run folder's own stamp, `<name>-YYYYMMDD-HHMMSS[-n]`, which the list shows as a date. */
export const STAMP = /-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)(?:-\d+)?$/;

/** Bytes in a folder and every folder under it, counted without blocking the main process. */
async function folderBytes(dir: string): Promise<number> {
	let total = 0;
	for (const e of await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) total += await folderBytes(p);
		else total += await fs.promises.lstat(p).then((st) => st.size, () => 0);
	}
	return total;
}

export class RunFolder {
	/** Where the run lives; renaming or moving the folder changes it. */
	dir: string;
	readonly board: string;
	/** The board's name: the engine writes solver_<name>/ under the run folder. */
	private readonly boardName: string;
	private readonly symbols: string[];
	/** The k range it runs: run.json's when it ran with one, else the board's. */
	kRange: [number, number];
	state: Run["state"] = "stopped";
	note = "";
	counts: Record<number, number> = {};
	total = 0;
	elapsed = 0;
	/** Seconds the engine ran in earlier sessions (elapsed.txt): a resumed run's time adds to them. */
	private before = 0;
	rate = 0;
	roots = { done: 0, all: 0 };
	/** The finished roots by number (roots.done, then `roots` lines), and the ones in hand (`active` lines). */
	private finishedRoots = new Set<number>();
	private active: NonNullable<Run["roots"]["active"]> = [];
	stage: Run["stage"] = null;
	options: RunOptions | null = null;
	/** replaces.txt: the run this one deletes once it finishes (Raise k), by folder; a study's row follows it. */
	replaces: string | null = null;
	/** raised.txt: its raise rule went on to a run of the next k, so it is not raised again. */
	raised = false;
	/** It finished in this session and main has not yet compressed it (compressFinished). */
	fresh = false;
	/** capped.txt: a ceiling of its raise rule stopped it (why); a study counts its row done. */
	capped: string | null = null;
	files: OutFile[] = [];
	/** latest.txt: a tiling the engine found in a root still open, rewritten at most every 30 s. */
		private latest: { text: string; at: number } | null = null;
	/** The folder's size on disk, walked in the background: every 15 s while running, every 2 min otherwise. */
	private disk: { bytes: number | null; at: number; walking: boolean } = { bytes: null, at: 0, walking: false };
	private measure() {
		const wait = this.state === "running" ? 15_000 : 120_000;
		if (this.disk.walking || Date.now() - this.disk.at < wait) return;
		this.disk.walking = true;
		void folderBytes(this.dir).then((bytes) => (this.disk = { bytes, at: Date.now(), walking: false }));
	}
	log: string[] = [];
	free: Record<string, string> = {};
	stats: string | null = null;
	branching: Rule | null = null;
	estimate: Estimate | null = null;
	/** Nodes the engine has visited, when its progress line reports them (`nodes <n>`), with their history. */
	private nodesDone: { t: number; n: number }[] = [];
	private estimator: ChildProcess | null = null;
	private child: ChildProcess | null = null;
	private stopping = false;
	private resumed = false;
	private last = { t: 0, n: 0 };
	private buffer = "";

	static open(dir: string): RunFolder | null {
		const board = read(path.join(dir, "input.board"));
		return board ? new RunFolder(dir, board) : null;
	}

	private constructor(dir: string, board: string) {
		this.dir = dir;
		this.board = board;
		const b = parse(board).board;
		this.boardName = b.name;
		this.symbols = b.angles.map((a) => a.sym);
		this.kRange = [b.kmin, b.kmax];
		try {
			this.options = JSON.parse(read(path.join(dir, "run.json"))) as RunOptions;
			if (this.options?.k) this.kRange = this.options.k;
		} catch {
			this.options = null;
		}
		this.replaces = read(path.join(dir, "replaces.txt")).trim() || null;
		this.raised = fs.existsSync(path.join(dir, "raised.txt"));
		this.capped = read(path.join(dir, "capped.txt")).trim() || null;
		this.readDisk();
		this.elapsed = this.before = Number(read(path.join(dir, "elapsed.txt"))) || this.timeFromFiles();
		this.log = read(path.join(dir, "log.txt")).split("\n").filter(Boolean);
		for (const l of this.log) this.branching = ruleOf(l) ?? this.branching;
		try {
			this.estimate = JSON.parse(read(path.join(dir, "estimate.json"))) as Estimate;
		} catch {
			this.estimate = null;
		}
	}

	get out() {
		return path.join(this.dir, "solver_" + this.boardName);
	}

	/** symbols.txt: how the engine prints the board's free symbols (X3 → A3p). A new run writes it once started. */
	private readSymbols() {
		this.free = Object.fromEntries(
			read(path.join(this.out, "symbols.txt"))
				.split("\n")
				.map((l) => l.trim().split(/\s+/))
				.filter((p) => p.length === 2),
		);
	}

	/** What the files say: a finished run's census, or for a stopped one the sum of roots.done and of units.done
	 *  (the units finished by roots not yet finished; a run without units has none). */
	readDisk() {
		const counts: Record<number, number> = {};
		const census = read(path.join(this.out, "census.txt"));
		const done = read(path.join(this.out, "roots.done")).split("\n").filter(Boolean);
		this.finishedRoots = new Set(done.map((l) => Number(l.split(" ")[0])));
		this.readSymbols();
		if (census.endsWith("MAX\n")) {
			for (const m of census.matchAll(/k=(\d+) -- (\d+)/g)) counts[Number(m[1])] = Number(m[2]);
			this.state = "finished";
			this.roots = { done: done.length, all: done.length };
		} else {
			// a half-done root counts only its finished units: resuming runs the rest
			const seen = new Set<string>();
			const units = read(path.join(this.out, "units.done"))
				.split("\n")
				.filter((l) => {
					const [r, u] = l.split(" ");
					const fresh = !!u && !this.finishedRoots.has(Number(r)) && !seen.has(`${r} ${u}`);
					seen.add(`${r} ${u}`);
					return fresh;
				})
				.map((l) => l.split(" ").slice(1).join(" "));
			for (const line of [...done, ...units])
				for (const kv of line.split(" ").slice(1)) {
					const [k, n] = kv.split(":").map(Number);
					if (Number.isFinite(k) && Number.isFinite(n)) counts[k] = (counts[k] ?? 0) + n;
				}
			this.roots.done = done.length;
			if (!this.roots.all)
				try {
					const told = (JSON.parse(read(path.join(this.dir, "sessions.json")) || "[]") as Session[]).findLast(
						(x) => x.roots,
					);
					this.roots.all = told?.roots ?? 0;
				} catch {}
			if (this.state !== "failed" && this.state !== "running") this.state = "stopped";
		}
		this.counts = counts;
		this.total = Object.values(counts).reduce((a, b) => a + b, 0);
		this.readFind();
		this.scanFiles();
	}

	private countsRead = false;
	private countingFiles = false;
	/** Count the tilings of every file not counted at its size, one file at a time; keep them in tilings.json. */
	async countFiles() {
		if (this.countingFiles) return;
		this.countingFiles = true;
		try {
			for (const f of this.files) {
				const c = counted.get(f.path);
				if (c?.bytes !== f.bytes || (c.n >= 0 && !c.faces)) await countTilings(f.path, f.bytes);
			}
			const keep = Object.fromEntries(
				this.files.flatMap((f) => {
					const c = counted.get(f.path);
					return c && c.n >= 0 ? [[f.name, [c.bytes, c.n, c.faces, c.from]]] : [];
				}),
			);
			fs.writeFileSync(path.join(this.out, "tilings.json"), JSON.stringify(keep));
		} catch {
			// a run being deleted or moved: counted again next time
		} finally {
			this.countingFiles = false;
			this.scanFiles();
		}
	}

	scanFiles() {
		let names: string[];
		try {
			names = fs.readdirSync(this.out);
		} catch {
			return;
		}
		// a run started here had no symbols.txt when it was opened: read it once the engine has written it
		if (!Object.keys(this.free).length && names.includes("symbols.txt")) this.readSymbols();
		if (!this.countsRead && names.includes("tilings.json")) {
			this.countsRead = true;
			try {
				const kept = JSON.parse(read(path.join(this.out, "tilings.json"))) as Record<
					string,
					[number, number, Count["faces"]?, number?]
				>;
				for (const [name, [bytes, n, faces, from]] of Object.entries(kept))
					counted.set(path.join(this.out, name), { bytes, n, faces, from });
			} catch {}
		}
		if (!names.includes("latest.txt")) this.latest = null;
		else
			try {
				const at = fs.statSync(path.join(this.out, "latest.txt")).mtimeMs;
				if (at !== this.latest?.at) this.latest = { text: read(path.join(this.out, "latest.txt")), at };
			} catch {}
		this.files = names
			.map((name) => {
				const m = OUT_FILE.exec(name);
				if (!m) return null;
				const p = path.join(this.out, name);
				let bytes = 0;
				try {
					bytes = fs.statSync(p).size;
				} catch {}
				const c = counted.get(p);
				return {
					name,
					path: p,
					k: Number(m[1]),
					labels: decodeLabels(m[2], this.symbols, this.free),
					orientable: !!m[3],
					edges: Number(m[4]),
					bytes,
					tilings: c && c.n >= 0 && c.bytes === bytes ? c.n : null,
					faces: (c && c.n >= 0 && c.bytes === bytes && c.faces) || null,
				};
			})
			.filter((f): f is OutFile => f !== null)
			.sort((a, b) => a.k - b.k || a.labels.localeCompare(b.labels) || a.edges - b.edges);
	}

	private session: Session | null = null;

	private writeSessions(update: (all: Session[]) => void) {
		const f = path.join(this.dir, "sessions.json");
		let all: Session[] = [];
		try {
			all = JSON.parse(read(f) || "[]") as Session[];
		} catch {}
		update(all);
		try {
			fs.writeFileSync(f, JSON.stringify(all, null, "\t") + "\n");
		} catch {}
	}

	start(engine: string, options: RunOptions, estimator?: string, app = ""): string | null {
		if (this.state === "running" || this.state === "finished") return null;
		const resume = fs.existsSync(this.out);
		// --resume needs the same k; the run keeps its own raise rule, and drops it once a ceiling stopped it: a
		// resume then finishes this search and raises no further
		if (resume && this.options) options = { ...options, k: this.options.k, raise: this.capped ? undefined : this.options.raise };
		this.uncap();
		// a find run started again stays one: it has no solver folder until it ends, and skips the steps it finished
		if (this.options?.find && !options.find) options = { ...options, find: this.options.find };
		fs.writeFileSync(path.join(this.dir, "run.json"), JSON.stringify(options, null, "\t") + "\n");
		this.options = options;
		if (options.k) this.kRange = options.k;
		const windows = process.platform === "win32";
		let input: string;
		try {
			input = this.engineInput();
		} catch (e) {
			this.state = "failed";
			return (this.note = `Cannot search this board: ${(e as Error).message}`);
		}
		const args = [input, "--threads", String(options.threads), "--progress"];
		if (options.k) args.push("--k", String(options.k[0]), String(options.k[1]));
		// --nice is setpriority, which Windows lacks; there the app lowers the process priority itself
		if (options.nice && !windows) args.push("--nice", String(options.nice));
		if (options.find) args.push("--find", "--seconds", String(options.find.seconds));
		else if (resume) args.push("--resume");
		let child: ChildProcess;
		try {
			child = spawn(engine, args, {
				cwd: this.dir,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
				env: { ...process.env, ...ruleEnv(options.rule) },
			});
		} catch (e) {
			this.state = "failed";
			return (this.note = `Cannot start tilesearch: ${(e as Error).message}`);
		}
		if (windows && options.nice && child.pid) {
			try {
				os.setPriority(child.pid, Math.min(19, options.nice));
			} catch {}
		}
		this.child = child;
		this.stopping = false;
		this.buffer = "";
		this.elapsed = this.before;
		this.rate = 0;
		this.stats = null;
		this.branching = null; // a resume plans again, and may pick the other rule
		this.stage = null;
		this.last = { t: this.before, n: this.total };
		this.state = "running";
		this.resumed = resume;
		this.note = resume ? `Resumed with ${this.roots.done} roots already done` : "";
		const session: Session = {
			engine: engineHash(engine),
			app,
			platform: `${process.platform}-${process.arch}`,
			started: new Date().toISOString(),
			threads: options.threads,
			nice: options.nice,
			...(options.k ? { k: options.k } : {}),
			...(options.rule ? { rule: options.rule } : {}),
			resumed: resume,
		};
		this.session = session;
		this.writeSessions((all) => all.push(session));
		const onData = (d: Buffer) => this.consume(d.toString("utf8"));
		child.stdout!.on("data", onData);
		child.stderr!.on("data", onData);
		child.on("error", (e) => {
			this.state = "failed";
			this.note = `Cannot start tilesearch: ${e.message}`;
		});
		child.on("exit", (code) => this.finished(code ?? 0));
		this.nodesDone = [];
		if (estimator && fs.existsSync(estimator) && !options.find) this.startEstimator(estimator);
		return null;
	}

	/** The board file the engines read: input.board, or for a tile-orbit search (`search faces`) the board with
	 *  faces and vertices swapped, written beside it as engine.board. */
	private engineInput(): string {
		const text = read(path.join(this.dir, "input.board"));
		const swapped = engineText(text);
		if (swapped === text) return "input.board";
		fs.writeFileSync(path.join(this.dir, "engine.board"), swapped);
		return "engine.board";
	}

	/** Estimate what is left: the roots not yet in roots.done, whose tilings it adds to theirs. */
	private startEstimator(exe: string) {
		const done = path.join(this.out, "roots.done");
		const args = [this.engineInput(), "--k", String(this.kRange[0]), String(this.kRange[1])];
		args.push("--seconds", String(ESTIMATE_SECONDS), "--threads", "1");
		if (fs.existsSync(done)) args.push("--skip", done);
		const base = { ...this.counts }; // a stopped run's counts are its finished roots' (readDisk)
		this.estimator = runEstimator(exe, this.dir, args, base, ruleEnv(this.options?.rule), (e) => {
			this.estimate = e;
			try {
				fs.writeFileSync(path.join(this.dir, "estimate.json"), JSON.stringify(e) + "\n");
			} catch {}
		});
	}

		/** Files compressed (or decompressed, `unpack`) so far while Compress or Decompress runs. */
	packing: { done: number; all: number; unpack: boolean } | null = null;

	/** find.json: a find run's steps, reread when the engine moves to a step or a k (its `stage find` lines). */
	find: Run["find"] = null;
	private readFind() {
		try {
			this.find = JSON.parse(read(path.join(this.dir, "find.json")) || "null") as Run["find"];
		} catch {} // being replaced: the next stage line reads it again
	}

		/**
	 * A finished run's certificate files gzipped in place (.txt → .txt.gz; certificate text shrinks 10 to
	 * 90 times by kind), or with `unpack` back to plain text. Each file is written whole before its original goes,
	 * so a stop midway leaves every file readable. The app and zcat read gzipped files as they are, and the
	 * `gzip` marker tells a resume which kind to write. Unpacking stops while under MIN_FREE_BYTES free.
	 */
	async compress(unpack = false, free = () => Infinity): Promise<{ error?: string }> {
		if (unpack ? this.state === "running" : this.state !== "finished")
			return { error: unpack ? "Stop the run first." : "Only a finished run can be compressed." };
		if (this.packing) return {};
		const todo = this.files.filter((f) => f.path.endsWith(".gz") === unpack);
		this.packing = { done: 0, all: todo.length, unpack };
		try {
			for (const f of todo) {
				if (unpack && free() < MIN_FREE_BYTES) return { error: "Decompressing stopped: under 10 GB free on disk." };
				const to = unpack ? f.path.slice(0, -3) : `${f.path}.gz`;
				const step = unpack ? zlib.createGunzip() : zlib.createGzip({ level: 6 });
				await pipeline(fs.createReadStream(f.path), step, fs.createWriteStream(`${to}.part`));
				fs.renameSync(`${to}.part`, to);
				fs.rmSync(f.path);
				this.packing.done++;
			}
			const marker = path.join(this.out, "gzip");
			if (unpack) fs.rmSync(marker, { force: true });
			else fs.writeFileSync(marker, "");
			return {};
		} catch (e) {
			return { error: `${unpack ? "Decompressing" : "Compressing"} stopped: ${(e as Error).message}` };
		} finally {
			this.packing = null;
			this.disk.at = 0; // measured again on the next status
			this.scanFiles();
		}
	}

	/** Its raise rule, changed or taken off, in run.json (its time kept: an old run's search time is read from it). */
	setRaise(rule: RaiseRule | null) {
		if (!this.options || this.raised) return;
		const { raise: _, ...rest } = this.options;
		this.options = rule ? { ...rest, raise: rule } : rest;
		const f = path.join(this.dir, "run.json");
		try {
			const st = fs.statSync(f);
			fs.writeFileSync(f, JSON.stringify(this.options, null, "\t") + "\n");
			fs.utimesSync(f, st.atime, st.mtime);
		} catch {}
	}

	/** A new priority for its engine while it runs: the system lets it go down, and refuses it going up. */
	renice(nice: number) {
		if (this.state !== "running" || !this.child?.pid) return;
		try {
			os.setPriority(this.child.pid, Math.min(19, nice));
		} catch {}
	}

	/** No longer held by a ceiling it passed, going on under `rule`: none when resumed by hand (it finishes its
	 *  search), its own without ceilings when a study lifts its limits, a study's new rule (Study.raise). */
	uncap(rule: RaiseRule | null = null) {
		if (!this.capped) return;
		this.capped = null;
		fs.rmSync(path.join(this.dir, "capped.txt"), { force: true });
		this.setRaise(rule);
	}

	/** Stopped by a ceiling of its raise rule: kept as capped.txt, so a study counts its row done and moves on. */
	cap(why: string) {
		if (this.state !== "running") return;
		fs.writeFileSync(path.join(this.dir, "capped.txt"), why + "\n");
		this.capped = why;
		this.stop(why);
	}

	stop(why = "") {
		if (this.state !== "running") return;
		this.stopping = true;
		this.note = why;
		this.child?.kill();
		this.estimator?.kill();
	}

	private consume(s: string) {
		this.buffer += s;
		let nl: number;
		while ((nl = this.buffer.indexOf("\n")) >= 0) {
			this.handle(this.buffer.slice(0, nl).replace(/\r$/, ""));
			this.buffer = this.buffer.slice(nl + 1);
		}
	}

	private handle(line: string) {
		const t = line.split(" ");
		if (t[0] === "stage" && t.length === 4) {
			this.stage = { name: t[1], done: Number(t[2]) || 0, all: Number(t[3]) || 0 };
			if (t[1] === "find") this.readFind();
			return;
		}
		if (t[0] === "roots" && (t.length === 3 || t.length === 4)) {
			this.stage = null;
			this.roots = { done: Number(t[1]) || 0, all: Number(t[2]) || 0 };
			if (t[3]) this.finishedRoots.add(Number(t[3]));
			return;
		}
		if (t[0] === "active") {
			// <root>:<units done>/<units found>, the roots in hand
			this.active = t.slice(1).map((e) => {
				const [root, done, all] = e.split(/[:/]/).map(Number);
				return { root, done, all };
			});
			return;
		}
		if (t[0] === "stats") {
			this.stats = t.slice(1).join(" ");
			return;
		}
		this.branching = ruleOf(line) ?? this.branching;
		if (t[0] === "progress") {
			// `nodes <n>`, when the engine reports it, is what the ETA runs on
			const i = t.indexOf("nodes");
			if (i > 0 && Number.isFinite(Number(t[i + 1]))) this.nodesDone.push({ t: Number(t[1]), n: Number(t[i + 1]) });
			if (this.nodesDone.length > 600) this.nodesDone.shift();
		}
		if (t[0] !== "progress" || t.length < 3) {
			if (line && !line.startsWith("Created ")) this.log.push(line);
			if (this.log.length > LOG_LINES) this.log.splice(0, this.log.length - LOG_LINES);
			return;
		}
		this.elapsed = this.before + (Number(t[1]) || 0);
		this.total = Number(t[2]) || this.total;
		for (const kv of t.slice(3)) {
			const [k, n] = kv.split(":").map(Number);
			if (Number.isFinite(k) && Number.isFinite(n)) this.counts[k] = n;
		}
		if (this.elapsed > this.last.t + 1) {
			this.rate = (this.total - this.last.n) / (this.elapsed - this.last.t);
			this.last = { t: this.elapsed, n: this.total };
		}
	}

	private finished(code: number) {
		this.child = null;
		this.estimator?.kill();
		this.estimator = null;
		this.before = this.elapsed;
		this.active = [];
		this.stage = null;
		try {
			fs.writeFileSync(path.join(this.dir, "elapsed.txt"), `${this.elapsed.toFixed(1)}\n`);
			fs.writeFileSync(path.join(this.dir, "log.txt"), this.log.join("\n") + "\n");
		} catch {}
		const failed = !this.stopping && code !== 0;
		if (failed) {
			this.state = "failed";
			const board = this.log.find((l) => l.startsWith("board line "));
			this.note = board ?? `tilesearch stopped with exit code ${code}; see the log`;
		} else this.state = "stopped";
		this.readDisk();
		const find = !!this.options?.find;
		if (this.stopping && !this.note)
			this.note = find
				? "Resume skips the steps already finished"
				: `Resume runs the ${Math.max(0, this.roots.all - this.roots.done)} unfinished roots`;
		if ((this.state as Run["state"]) === "finished")
			this.note = find
				? this.total
					? "Found a tiling meeting every required set"
					: (this.log.findLast((l) => l.startsWith("proven") || l.startsWith("no tiling")) ?? "No tiling found")
				: `${this.total.toLocaleString("en")} tiling${this.total === 1 ? "" : "s"}`;
		// finished in this session: main compresses it, or raises its k, once (a tiny run is never seen running)
		if ((this.state as Run["state"]) === "finished") this.fresh = true;
		const s = this.session;
		this.endedAt = undefined;
		if (s) {
			this.session = null;
			this.writeSessions((all) => {
				const mine = all.find((x) => x.started === s.started) ?? s;
				Object.assign(mine, {
					ended: new Date().toISOString(),
					exit: code,
					seconds: Math.round((Date.now() - Date.parse(s.started)) / 100) / 10,
					finished: (this.state as Run["state"]) === "finished",
					roots: this.roots.all || undefined,
				});
			});
		}
	}

		snapshot(): Run {
		this.measure();
		return {
			id: this.dir,
			dir: this.dir,
			name: path.basename(this.dir).replace(STAMP, "") || path.basename(this.dir),
			created: this.created(),
			ended: this.ended(),
			board: this.board,
			state: this.state,
			note: this.note,
			counts: { ...this.counts },
			total: this.total,
			elapsed: this.elapsed,
			rate: this.rate,
			roots: {
				...this.roots,
				active: this.state === "running" ? this.active : [],
				// by number only while few enough to draw one by one (overview.tsx)
				...(this.finishedRoots.size <= MAX_DRAWN_ROOTS ? { finished: [...this.finishedRoots] } : {}),
			},
			stage: this.state === "running" ? this.stage : null,
			kmin: this.kRange[0],
			kmax: this.kRange[1],
			options: this.options,
			...(this.raised ? { raised: true } : {}),
			...(this.replaces ? { replaces: this.replaces } : {}),
			...(this.capped ? { capped: this.capped } : {}),
			files: this.files,
			latest: this.state === "running" && this.latest ? this.latest : null,
			log: this.log.slice(-400),
			symbols: this.free,
			stats: this.stats,
			branching: this.branching,
			estimate: this.estimate,
			work: this.state === "running" ? this.work() : null,
			packing: this.packing && { ...this.packing },
						find: this.find,
			disk: this.disk.bytes,
		};
	}

	/**
	 * The search time of a finished run from before elapsed.txt: run.json is written as the engine starts
	 * and census.txt as it finishes. A resume rewrites run.json, so when run.json is much younger than the
	 * run itself the earlier sessions are unknown, and this answers 0 (no time shown) instead of a part.
	 */
	private timeFromFiles(): number {
		if (this.state !== "finished") return 0;
		try {
			const start = fs.statSync(path.join(this.dir, "run.json")).mtimeMs;
			const end = fs.statSync(path.join(this.out, "census.txt")).mtimeMs;
			return Math.abs(start - this.created()) < 30_000 && end >= start ? (end - start) / 1000 : 0;
		} catch {
			return 0;
		}
	}

	/** Its last session never recorded an end: the app or the computer went down while it ran. */
	crashed(): boolean {
		try {
			const all = JSON.parse(read(path.join(this.dir, "sessions.json")) || "[]") as Session[];
			return all.length > 0 && !all[all.length - 1].ended;
		} catch {
			return false;
		}
	}

	/** When the run last stopped or finished (ms), read once: the last session's end, else census.txt's time
	 *  for a finished run older than sessions.json. Null while running or never run. */
	private endedAt: number | null | undefined;
	private ended(): number | null {
		if (this.state === "running") return null;
		if (this.endedAt !== undefined) return this.endedAt;
		let at: number | null = null;
		try {
			const last = (JSON.parse(read(path.join(this.dir, "sessions.json")) || "[]") as Session[]).findLast((s) => s.ended);
			if (last?.ended) at = Date.parse(last.ended);
		} catch {}
		if (at === null && this.state === "finished")
			try {
				at = fs.statSync(path.join(this.out, "census.txt")).mtimeMs;
			} catch {}
		return (this.endedAt = at);
	}

	/** When the run was made: its folder's stamp, which outlives a rename that keeps it, else the folder's birth. */
	private created(): number {
		const m = STAMP.exec(path.basename(this.dir));
		if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
		try {
			return fs.statSync(this.dir).birthtimeMs;
		} catch {
			return 0;
		}
	}

	/**
	 * The share of the estimated nodes visited, and the seconds left: the nodes still to visit over the
	 * engine's rate in the last 30 s, with the estimate's 95% interval as the range. The estimate covers the
	 * roots not done when this session started, as the engine's count does. Null until both exist.
	 */
	private work(): Run["work"] {
		const e = this.estimate;
		const h = this.nodesDone;
		if (!e || !h.length || !(e.nodes[0] > 0)) return null;
		const last = h[h.length - 1];
		const [n, se] = e.nodes;
		const work = { share: Math.min(1, last.n / n), resumed: this.resumed, left: null };
		if (last.n >= n) return work; // past the estimate: it was low, and no time left can be read from it
		const first = h.find((p) => p.t >= last.t - 30) ?? h[0];
		const rate = (last.n - first.n) / Math.max(1e-9, last.t - first.t);
		if (!(rate > 0)) return work;
		const left = (x: number) => Math.max(0, x - last.n) / rate;
		return { ...work, left: { seconds: left(n), low: left(n - 1.96 * se), high: left(n + 1.96 * se) } };
	}
}

/** A name for a run or a folder: one path segment, no hidden file, nothing Windows refuses. */
export function badName(name: string): string | null {
	if (!name.trim()) return "Give it a name.";
	if (/[/\\:*?"<>|]/.test(name)) return 'A name cannot contain / \\ : * ? " < > or |.';
	if (name.startsWith(".")) return "A name cannot start with a dot.";
	if (name.length > 120) return "That name is too long.";
	return null;
}

/**
 * Every run under the output folder, newest first, and the folders that group them. A folder with an
 * input.board is a run; any other folder is a group, and may hold runs and further groups.
 */
export class Runs {
	runs: RunFolder[] = [];
	folders: string[] = [];
	/** The folders holding a study (study.json): each is also a folder, and its rows are runs inside it. */
	studies: string[] = [];
	constructor(public root: string) {
		this.rescan();
	}

	rescan() {
		fs.mkdirSync(this.root, { recursive: true });
		const known = new Map(this.runs.map((r) => [r.dir, r]));
		const runs: RunFolder[] = [];
		const folders: string[] = [];
		const studies: string[] = [];
		const walk = (dir: string, depth: number) => {
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const d of entries) {
				if (!d.isDirectory() || d.name.startsWith(".")) continue;
				const p = path.join(dir, d.name);
				const run = known.get(p) ?? RunFolder.open(p);
				if (run) runs.push(run);
				else if (depth < 6) {
					folders.push(p);
					if (fs.existsSync(path.join(p, "study.json"))) studies.push(p);
					walk(p, depth + 1);
				}
			}
		};
		walk(this.root, 0);
		// a running run whose folder vanished stays listed: its engine is still going
		for (const r of this.runs) if (r.state === "running" && !runs.includes(r)) runs.push(r);
		this.runs = runs.sort((a, b) => path.basename(b.dir).localeCompare(path.basename(a.dir)));
		this.folders = folders.sort((a, b) => a.localeCompare(b));
		this.studies = studies;
	}

	/** The runs at `p` or inside it. */
	private within(p: string) {
		return this.runs.filter((r) => r.dir === p || r.dir.startsWith(p + path.sep));
	}

	/** Why `p` cannot be renamed, moved or deleted, or null. Only the output folder's own runs and folders can. */
	private locked(p: string): string | null {
		const rel = path.relative(this.root, p);
		if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(p))
			return "That is not in the output folder.";
		const busy = this.within(p).filter((r) => r.state === "running");
		if (busy.length)
			return busy.length === 1 && busy[0].dir === p ? "Stop the run first." : "Stop the runs inside it first.";
		return null;
	}

	/** Move `from` to `to`, carrying the runs inside along so their logs and notes survive. */
	private relocate(from: string, to: string): string | null {
		if (fs.existsSync(to)) return `There is already a folder named “${path.basename(to)}” there.`;
		try {
			fs.renameSync(from, to);
		} catch (e) {
			return `Could not move it: ${(e as Error).message}`;
		}
		// the file list holds full paths: list it again from the new place, or reading a tiling fails
		for (const r of this.within(from)) {
			r.dir = to + r.dir.slice(from.length);
			r.scanFiles();
		}
		this.rescan();
		return null;
	}

	rename(p: string, name: string): { path: string } | { error: string } {
		const error = this.locked(p) ?? badName(name);
		if (error) return { error };
		// a run keeps its stamp: the date it was made is not the app's to change, only the name before it
		const stamped = fs.existsSync(path.join(p, "run.json")) || fs.existsSync(path.join(p, "study.json"));
		const stamp = stamped ? (STAMP.exec(path.basename(p))?.[0] ?? "") : "";
		const to = path.join(path.dirname(p), name.trim() + stamp);
		if (to === p) return { path: p };
		return this.wrap(this.relocate(p, to), to);
	}

	/** Move a run or a folder into `folder` (the output folder itself, or one of its folders). */
	move(p: string, folder: string): { path: string } | { error: string } {
		const error = this.locked(p);
		if (error) return { error };
		if (folder !== this.root && !this.folders.includes(folder)) return { error: "That folder no longer exists." };
		if (folder === p || folder.startsWith(p + path.sep)) return { error: "A folder cannot go inside itself." };
		const to = path.join(folder, path.basename(p));
		if (to === p) return { path: p };
		return this.wrap(this.relocate(p, to), to);
	}

	/** Delete a run or a folder, with everything in it. Permanent: the window asks first. */
	remove(p: string): { error?: string } {
		const error = this.locked(p);
		if (error) return { error };
		try {
			fs.rmSync(p, { recursive: true });
		} catch (e) {
			this.rescan();
			return { error: `Could not delete it all: ${(e as Error).message}` };
		}
		this.rescan();
		return {};
	}

	mkdir(parent: string, name: string): { path: string } | { error: string } {
		const error =
			badName(name) ?? (parent === this.root || this.folders.includes(parent) ? null : "That folder no longer exists.");
		if (error) return { error };
		const p = path.join(parent, name.trim());
		if (fs.existsSync(p)) return { error: `There is already a folder named “${name.trim()}” there.` };
		fs.mkdirSync(p);
		this.rescan();
		return { path: p };
	}

	private wrap(error: string | null, p: string) {
		return error ? { error } : { path: p };
	}

	/** A new, empty folder `<name>-<date stamp>` in `folder` when that is one of the output folder's folders. */
	stampedDir(name: string, folder?: string): string {
		const parent = folder && this.folders.includes(folder) ? folder : this.root;
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
		let dir = path.join(parent, `${name}-${stamp}`);
		for (let i = 2; fs.existsSync(dir); i++) dir = path.join(parent, `${name}-${stamp}-${i}`);
		fs.mkdirSync(dir, { recursive: true });
		return dir;
	}

	/** A new run folder for `board`, in `folder` when that is one of the output folder's folders. */
	create(board: string, name: string, folder?: string): RunFolder {
		const dir = this.stampedDir(name, folder);
		fs.writeFileSync(path.join(dir, "input.board"), board);
		const run = RunFolder.open(dir)!;
		this.runs.unshift(run);
		return run;
	}

	get(id: string) {
		return this.runs.find((r) => r.dir === id);
	}

	freeBytes(): number {
		try {
			const s = fs.statfsSync(this.root);
			return s.bavail * s.bsize;
		} catch {
			return 0;
		}
	}
}
