// Run folders and the tilesearch processes in them. Each run is a folder under the output folder:
// input.board, run.json (the options it was started with, so a resume repeats them), then
// solver_<name>/ once the engine starts. census.txt ending in MAX means finished; otherwise roots.done
// lists the finished roots and `tilesearch --resume` runs the rest.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Estimate, OutFile, Run, RunOptions } from "../src/bridge";
import { parse } from "../src/board";

export const MIN_FREE_BYTES = 10 * 2 ** 30;
const LOG_LINES = 2000;

const read = (f: string) => {
	try {
		return fs.readFileSync(f, "utf8");
	} catch {
		return "";
	}
};

// <name>solver_<kk>_<labels>[_o]_<E>.txt
const OUT_FILE = /solver_(\d+)_(.+?)(_o)?_(\d+)\.txt$/;

/**
 * File names print label numbers in hex (A30 is A1e) and free symbols as X<n>. Rewrite them as the
 * board's symbols, longest match first; a name no symbol explains is left as it is.
 */
export function decodeLabels(s: string, symbols: string[], free: Record<string, string>): string {
	const byPrinted = new Map<string, string>([["Pi", "Pi"]]);
	for (const sym of symbols) {
		const m = /^([SMLABCDEFG]?)([1-9][0-9]*|oo)$/.exec(sym);
		if (m) byPrinted.set(m[1] + (m[2] === "oo" ? "oo" : Number(m[2]).toString(16)), sym);
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
	onEstimate: (e: Estimate) => void,
) {
	const child = spawn(exe, args, { cwd, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
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

/** A run folder's own stamp, `<name>-YYYYMMDD-HHMMSS[-n]`, which the list shows as a date. */
const STAMP = /-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)(?:-\d+)?$/;

export class RunFolder {
	/** Where the run lives; renaming or moving the folder changes it. */
	dir: string;
	readonly board: string;
	/** The board's name: the engine writes solver_<name>/ under the run folder. */
	private readonly boardName: string;
	private readonly symbols: string[];
	private kRange: [number, number];
	state: Run["state"] = "stopped";
	note = "";
	counts: Record<number, number> = {};
	total = 0;
	elapsed = 0;
	rate = 0;
	roots = { done: 0, all: 0 };
	options: RunOptions | null = null;
	files: OutFile[] = [];
	log: string[] = [];
	free: Record<string, string> = {};
	stats: string | null = null;
	estimate: Estimate | null = null;
	/** Nodes the engine has visited, when its progress line reports them (`nodes <n>`), with their history. */
	private nodesDone: { t: number; n: number }[] = [];
	private estimator: ChildProcess | null = null;
	private child: ChildProcess | null = null;
	private stopping = false;
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
		this.readDisk();
		try {
			this.estimate = JSON.parse(read(path.join(dir, "estimate.json"))) as Estimate;
		} catch {
			this.estimate = null;
		}
	}

	get out() {
		return path.join(this.dir, "solver_" + this.boardName);
	}

	/** What the files say: a finished run's census, or the sum of roots.done for a stopped one. */
	readDisk() {
		const counts: Record<number, number> = {};
		const census = read(path.join(this.out, "census.txt"));
		const done = read(path.join(this.out, "roots.done")).split("\n").filter(Boolean);
		this.free = Object.fromEntries(
			read(path.join(this.out, "symbols.txt"))
				.split("\n")
				.map((l) => l.trim().split(/\s+/))
				.filter((p) => p.length === 2),
		);
		if (census.endsWith("MAX\n")) {
			for (const m of census.matchAll(/k=(\d+) -- (\d+)/g)) counts[Number(m[1])] = Number(m[2]);
			this.state = "finished";
			this.roots = { done: done.length, all: done.length };
		} else {
			// a stopped run's half-done root is not counted: resuming runs it again from the start
			for (const line of done)
				for (const kv of line.split(" ").slice(1)) {
					const [k, n] = kv.split(":").map(Number);
					if (Number.isFinite(k) && Number.isFinite(n)) counts[k] = (counts[k] ?? 0) + n;
				}
			this.roots.done = done.length;
			if (this.state !== "failed" && this.state !== "running") this.state = "stopped";
		}
		this.counts = counts;
		this.total = Object.values(counts).reduce((a, b) => a + b, 0);
		this.scanFiles();
	}

	scanFiles() {
		let names: string[];
		try {
			names = fs.readdirSync(this.out);
		} catch {
			return;
		}
		this.files = names
			.map((name) => {
				const m = OUT_FILE.exec(name);
				if (!m) return null;
				const p = path.join(this.out, name);
				let bytes = 0;
				try {
					bytes = fs.statSync(p).size;
				} catch {}
				return {
					name,
					path: p,
					k: Number(m[1]),
					labels: decodeLabels(m[2], this.symbols, this.free),
					orientable: !!m[3],
					edges: Number(m[4]),
					bytes,
				};
			})
			.filter((f): f is OutFile => f !== null)
			.sort((a, b) => a.k - b.k || a.labels.localeCompare(b.labels) || a.edges - b.edges);
	}

	start(engine: string, options: RunOptions, estimator?: string): string | null {
		if (this.state === "running" || this.state === "finished") return null;
		const resume = fs.existsSync(this.out);
		if (resume && this.options) options = { ...options, k: this.options.k }; // --resume needs the same k
		fs.writeFileSync(path.join(this.dir, "run.json"), JSON.stringify(options, null, "\t") + "\n");
		this.options = options;
		if (options.k) this.kRange = options.k;
		const windows = process.platform === "win32";
		const args = ["input.board", "--threads", String(options.threads), "--progress"];
		if (options.k) args.push("--k", String(options.k[0]), String(options.k[1]));
		// --nice is setpriority, which Windows lacks; there the app lowers the process priority itself
		if (options.nice && !windows) args.push("--nice", String(options.nice));
		if (resume) args.push("--resume");
		let child: ChildProcess;
		try {
			child = spawn(engine, args, { cwd: this.dir, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
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
		this.elapsed = 0;
		this.rate = 0;
		this.stats = null;
		this.last = { t: 0, n: this.total };
		this.state = "running";
		this.note = resume ? `Resumed with ${this.roots.done} roots already done` : "";
		const onData = (d: Buffer) => this.consume(d.toString("utf8"));
		child.stdout!.on("data", onData);
		child.stderr!.on("data", onData);
		child.on("error", (e) => {
			this.state = "failed";
			this.note = `Cannot start tilesearch: ${e.message}`;
		});
		child.on("exit", (code) => this.finished(code ?? 0));
		this.nodesDone = [];
		if (estimator && fs.existsSync(estimator)) this.startEstimator(estimator);
		return null;
	}

	/** Estimate what is left: the roots not yet in roots.done, whose tilings it adds to theirs. */
	private startEstimator(exe: string) {
		const done = path.join(this.out, "roots.done");
		const args = ["input.board", "--k", String(this.kRange[0]), String(this.kRange[1])];
		args.push("--seconds", String(ESTIMATE_SECONDS), "--threads", "1");
		if (fs.existsSync(done)) args.push("--skip", done);
		const base = { ...this.counts }; // a stopped run's counts are its finished roots' (readDisk)
		this.estimator = runEstimator(exe, this.dir, args, base, (e) => {
			this.estimate = e;
			try {
				fs.writeFileSync(path.join(this.dir, "estimate.json"), JSON.stringify(e) + "\n");
			} catch {}
		});
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
		if (t[0] === "roots" && t.length === 3) {
			this.roots = { done: Number(t[1]) || 0, all: Number(t[2]) || 0 };
			return;
		}
		if (t[0] === "stats") {
			this.stats = t.slice(1).join(" ");
			return;
		}
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
		this.elapsed = Number(t[1]) || this.elapsed;
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
		const failed = !this.stopping && code !== 0;
		if (failed) {
			this.state = "failed";
			const board = this.log.find((l) => l.startsWith("board line "));
			this.note = board ?? `tilesearch stopped with exit code ${code}; see the log`;
		} else this.state = "stopped";
		this.readDisk();
		if (this.stopping && !this.note)
			this.note = `Resume runs the ${Math.max(0, this.roots.all - this.roots.done)} unfinished roots`;
		if ((this.state as Run["state"]) === "finished") this.note = `${this.total.toLocaleString("en")} tilings`;
	}

	snapshot(): Run {
		return {
			id: this.dir,
			dir: this.dir,
			name: path.basename(this.dir).replace(STAMP, "") || path.basename(this.dir),
			created: this.created(),
			board: this.board,
			state: this.state,
			note: this.note,
			counts: { ...this.counts },
			total: this.total,
			elapsed: this.elapsed,
			rate: this.rate,
			roots: { ...this.roots },
			kmin: this.kRange[0],
			kmax: this.kRange[1],
			options: this.options,
			files: this.files,
			log: this.log.slice(-400),
			symbols: this.free,
			stats: this.stats,
			estimate: this.estimate,
			eta: this.state === "running" ? this.eta() : null,
		};
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
	 * Seconds left: the estimated nodes still to visit over the engine's rate in the last 30 s. The range
	 * is the estimate's 95% interval. Null until the engine reports its nodes and the estimate has run.
	 */
	private eta(): Run["eta"] {
		const e = this.estimate;
		const h = this.nodesDone;
		if (!e || h.length < 2) return null;
		const last = h[h.length - 1];
		const first = h.find((p) => p.t >= last.t - 30) ?? h[0];
		const rate = (last.n - first.n) / Math.max(1e-9, last.t - first.t);
		if (!(rate > 0)) return null;
		const left = (x: number) => Math.max(0, x - last.n) / rate;
		const [n, se] = e.nodes;
		return { seconds: left(n), low: left(n - 1.96 * se), high: left(n + 1.96 * se) };
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
	constructor(public root: string) {
		this.rescan();
	}

	rescan() {
		fs.mkdirSync(this.root, { recursive: true });
		const known = new Map(this.runs.map((r) => [r.dir, r]));
		const runs: RunFolder[] = [];
		const folders: string[] = [];
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
					walk(p, depth + 1);
				}
			}
		};
		walk(this.root, 0);
		// a running run whose folder vanished stays listed: its engine is still going
		for (const r of this.runs) if (r.state === "running" && !runs.includes(r)) runs.push(r);
		this.runs = runs.sort((a, b) => path.basename(b.dir).localeCompare(path.basename(a.dir)));
		this.folders = folders.sort((a, b) => a.localeCompare(b));
	}

	/** The runs at `p` or inside it. */
	private within(p: string) {
		return this.runs.filter((r) => r.dir === p || r.dir.startsWith(p + path.sep));
	}

	/** Why `p` cannot be renamed, moved or deleted, or null. Only the output folder's own runs and folders can. */
	private locked(p: string): string | null {
		const rel = path.relative(this.root, p);
		if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(p)) return "That is not in the output folder.";
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
		for (const r of this.within(from)) r.dir = to + r.dir.slice(from.length);
		this.rescan();
		return null;
	}

	rename(p: string, name: string): { path: string } | { error: string } {
		const error = this.locked(p) ?? badName(name);
		if (error) return { error };
		const to = path.join(path.dirname(p), name.trim());
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
		const error = badName(name) ?? (parent === this.root || this.folders.includes(parent) ? null : "That folder no longer exists.");
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

	create(board: string, name: string): RunFolder {
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
		let dir = path.join(this.root, `${name}-${stamp}`);
		for (let i = 2; fs.existsSync(dir); i++) dir = path.join(this.root, `${name}-${stamp}-${i}`);
		fs.mkdirSync(dir, { recursive: true });
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
