// Studies on disk and while they go (src/study.ts says what a study is). A study is a folder under the output
// folder: study.board (the study board as written), study.json (its options, its state and what is known of
// each row), and one run folder per row it has searched. The rows themselves are planned again from
// study.board each time the study is opened, the same way, so study.json keeps only what the plan cannot say:
// each row's check, its run, and whether the study stopped it at its time limit.
//
// A study goes in three overlapping steps, each tick: check rows (the balance check, a few at once), start
// rows that passed (at most `parallel` at once, and never past the app's own limit on searches), and stop rows
// at the time limit. A row whose search an earlier run already did (sameSearch) adopts that run instead.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { engineText, parse } from "../src/board";
import {
	raiseCeiling,
	raiseStop,
	type RaiseRule,
	type RemovedFace,
	type RowState,
	type StudyDetail,
	type StudyEdit,
	type StudyOptions,
	type StudyRow,
	type StudySummary,
} from "../src/bridge";
import {
	aliveKeys,
	cyclicOrders,
	faceTally,
	MAX_ORDERS,
	planStudy,
	rowText,
	sameSearch,
	searchShape,
	splitReason,
	withoutK,
	type RowPlan,
	type StudyPlan,
} from "../src/study";
import { STAMP, type RunFolder, type Runs } from "./runs";

/** What study.json keeps of a row. */
interface SavedRow {
	name: string;
	/** The check before any search: passed (open), or ruled out by a corner no vertex holds (static), the
	 *  balance count, faces that cannot meet (split); the same board as an earlier row; the engine refusing. */
	check?: "open" | "static" | "balance" | "split" | "same" | "error";
	reason?: string;
	/** Its run: relative to the study folder for its own, absolute for an adopted one. */
	run?: string;
	adopted?: boolean;
	/** Stopped by the study at its time limit: not resumed until the limit is lifted. */
	limited?: boolean;
	/** Finishing without the time limit (Finish): the limit stops it no more. */
	free?: boolean;
	/** The run it had before its run was replaced (Raise k): back to it should the new run go unfinished. */
	was?: string;
}

interface Saved {
	version: 1;
	created: string;
	ended?: string;
	state: StudySummary["state"];
	note: string;
	options: StudyOptions;
	rows: SavedRow[];
	/** Optional faces edits took out, with what their rows had found then. */
	removed?: RemovedFace[];
}

/** What a study needs from main.ts each tick. */
export interface Context {
	runs: Runs;
	engine: string;
	/** Start (or resume) a run; an error, or null. */
	start: (id: string, options: Parameters<RunFolder["start"]>[1]) => string | null;
	/** The app's limit on searches at once is reached. */
	full: () => boolean;
}

// the engine on Windows ends its lines with \r\n (census.txt's MAX line among them): read as \n
const read = (f: string) => {
	try {
		return fs.readFileSync(f, "utf8").replace(/\r/g, "");
	} catch {
		return "";
	}
};

/** Balance checks at once, per study. */
const CHECKS = Math.max(2, Math.min(8, os.availableParallelism() - 2));
/** Each check's board file is its own, across studies. */
let checkFiles = 0;

/** What a raise rule judges a row's run by: its tilings, search time, files and k. */
const factsOf = (run: RunFolder) => ({
	total: run.total,
	seconds: run.elapsed,
	bytes: run.files.reduce((t, f) => t + f.bytes, 0),
	k: run.kRange[1],
});

export class Study {
	dir: string;
	template!: string;
	private saved: Saved;
	private plan!: StudyPlan;
	private rows!: RowPlan[];
	/** Rows whose balance check is in flight. */
	private checking = new Set<number>();
	/** The k range of the rows (the first row board's), for the list. */
	private k!: [number, number];
	private dirty = false;
	private lastSave = 0;
	/** Finished runs by frame key, for adoption; built at the first check of a session. */
	private index: Map<string, ({ run: RunFolder } & ReturnType<typeof searchShape>)[]> | null = null;

	private constructor(dir: string, template: string, saved: Saved) {
		this.dir = dir;
		this.saved = saved;
		this.load(template, planStudy(template));
		if (!this.plan.list && saved.state !== "done") {
			this.saved.state = "paused";
			this.saved.note = this.plan.problems[0]?.message ?? "The study board no longer gives its rows.";
		}
	}

	/** The rows of `template`, planned. study.json keeps rows by name: a plan that comes out different (a later
	 *  app, more faces per row) keeps what still matches, and a new row starts unchecked. */
	private load(template: string, plan: StudyPlan) {
		this.template = template;
		this.plan = plan;
		this.rows = plan.list ?? [];
		const kb = plan.instances[0]?.board ?? parse(template).board;
		this.k = [kb.kmin, kb.kmax];
		const byName = new Map(this.saved.rows.map((r) => [r.name, r]));
		this.saved.rows = this.rows.map((r) => byName.get(r.name) ?? { name: r.name });
	}

	static open(dir: string): Study | null {
		try {
			const saved = JSON.parse(read(path.join(dir, "study.json"))) as Saved;
			const template = read(path.join(dir, "study.board"));
			return template && saved?.rows ? new Study(dir, template, saved) : null;
		} catch {
			return null;
		}
	}

	/** A new study of `template` in `folder`: its folder, study.board and study.json; it starts checking at the next tick. */
	static create(runs: Runs, template: string, name: string, options: StudyOptions, folder?: string): Study | { error: string } {
		const plan = planStudy(template);
		if (plan.problems.length) return { error: plan.problems[0].message };
		if (!plan.list) return { error: `${plan.rows.toLocaleString("en")} rows is more than a study runs at once.` };
		if (!plan.list.length) return { error: "The board gives no rows: mark a face optional, or vary a parameter." };
		const dir = runs.stampedDir(name, folder);
		fs.writeFileSync(path.join(dir, "study.board"), template);
		const saved: Saved = {
			version: 1,
			created: new Date().toISOString(),
			state: "checking",
			note: "",
			options,
			rows: plan.list.map((r) => ({ name: r.name })),
		};
		fs.writeFileSync(path.join(dir, "study.json"), JSON.stringify(saved, null, "\t") + "\n");
		runs.rescan(); // the folder must be one of the output folder's for its rows to go in it
		return new Study(dir, template, saved);
	}

	get state() {
		return this.saved.state;
	}

	private save(now = false) {
		this.dirty = true;
		if (!now && Date.now() - this.lastSave < 1000) return;
		this.flush();
	}
	flush() {
		if (!this.dirty) return;
		this.dirty = false;
		this.lastSave = Date.now();
		try {
			fs.writeFileSync(path.join(this.dir, "study.json.part"), JSON.stringify(this.saved, null, "\t") + "\n");
			fs.renameSync(path.join(this.dir, "study.json.part"), path.join(this.dir, "study.json"));
		} catch {} // a study being moved or deleted: saved again next tick
	}

	private runDir(r: SavedRow) {
		return r.run ? this.place(r.run) : null;
	}
	/** A row's run as study.json keeps it (relative to the study folder for its own, else absolute), and back. */
	private place = (p: string) => (path.isAbsolute(p) ? p : path.join(this.dir, p));
	private kept = (dir: string) => (dir.startsWith(this.dir + path.sep) ? path.relative(this.dir, dir) : dir);

	/**
	 * A row whose run another replaces (Raise k by hand, or the raise rule) follows the new run as it starts, through
	 * any chain of them; it goes back to its first run should the new one be deleted before it finishes. A row whose
	 * run is gone with nothing linking on (replaced by a build that did not follow, the link deleted with the old run)
	 * takes the newest run in the study folder with the same name and board, k aside.
	 */
	private follow(byDir: Map<string, RunFolder>) {
		const s = this.saved;
		const next = new Map<string, RunFolder>();
		for (const run of byDir.values()) if (run.replaces) next.set(run.replaces, run);
		s.rows.forEach((r, i) => {
			const dir = this.runDir(r);
			if (!dir) return;
			if (!byDir.has(dir) && r.was && byDir.has(this.place(r.was))) {
				r.run = r.was;
				delete r.was;
				this.save();
				return;
			}
			if (!byDir.has(dir) && !next.has(dir) && !r.adopted) {
				const name = path.basename(dir).replace(STAMP, "");
				const board = withoutK(rowText(this.plan, this.rows[i]).text);
				const heir = [...byDir.values()]
					.filter((x) => path.dirname(x.dir) === this.dir && path.basename(x.dir).replace(STAMP, "") === name)
					.filter((x) => withoutK(x.board) === board)
					.sort((a, b) => b.dir.localeCompare(a.dir))[0];
				if (heir) {
					r.run = this.kept(heir.dir);
					delete r.was;
					this.save();
				}
				return;
			}
			let to = next.get(dir);
			if (!to) {
				if (r.was && byDir.get(dir)?.state === "finished") {
					delete r.was;
					this.save();
				}
				return;
			}
			while (next.has(to.dir)) to = next.get(to.dir)!;
			r.was ??= r.run;
			r.run = this.kept(to.dir);
			if (r.adopted && to.dir.startsWith(this.dir + path.sep)) delete r.adopted;
			// a finished study goes on while a row searches again
			if (s.state === "done" && to.state !== "finished") {
				s.state = "running";
				delete s.ended;
			}
			this.save();
		});
	}

	/** The run options a row starts (or resumes) with. With a raise rule, a row's first search goes to the lowest
	 *  k only; a resumed run keeps its own k and rule (RunFolder.start). */
	private runOptions() {
		const o = this.saved.options;
		return {
			threads: o.threads,
			nice: o.nice,
			...(o.rule ? { rule: o.rule } : {}),
			...(o.mode === "find"
				? { find: { seconds: o.seconds } }
				: o.raise
					? { k: [this.k[0], this.k[0]] as [number, number], raise: o.raise }
					: {}),
		};
	}

	// ── each tick ──

	tick(ctx: Context, byDir: Map<string, RunFolder>) {
		this.flush();
		this.follow(byDir);
		const s = this.saved;
		// an adopted run deleted or moved away: the row searches for itself again
		for (const r of s.rows)
			if (r.adopted && !byDir.has(this.runDir(r)!)) {
				delete r.adopted;
				delete r.run;
				if (s.state === "done") {
					s.state = "running";
					delete s.ended;
				}
				this.save();
			}
		// a row whose check failed was never searched: its study is not done, and waits for Resume to check it again
		if (s.state === "done" && this.failed()) {
			s.state = "paused";
			s.note = this.failed();
			delete s.ended;
			this.save();
		}
		if (s.state === "paused" || s.state === "done") return;
		this.check(ctx);
		// the time limit: a row past it stops, and is left alone until the limit is lifted
		if (s.options.limit > 0)
			for (const r of s.rows) {
				const run = !r.adopted && this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined;
				if (run?.state === "running" && run.elapsed > s.options.limit && !r.free) {
					run.stop(`Stopped at the study's time limit of ${Math.round(s.options.limit / 60)} min`);
					r.limited = true;
					this.save();
				}
			}
		// start rows: their own runs that stopped first (a pause), then rows never run, in order
		let going = s.rows.filter((r) => !r.adopted && this.runDir(r) && byDir.get(this.runDir(r)!)?.state === "running").length;
		while (going < s.options.parallel && !ctx.full()) {
			const i = this.nextRow(byDir);
			if (i < 0) break;
			const r = s.rows[i];
			const row = this.rows[i];
			let id = this.runDir(r);
			if (!id || !byDir.has(id)) {
				if (row.none) break;
				const run = ctx.runs.create(rowText(this.plan, row).text, row.name, this.dir);
				byDir.set(run.dir, run);
				id = run.dir;
				r.run = path.relative(this.dir, run.dir);
				delete r.adopted;
			}
			const error = ctx.start(id, this.runOptions());
			if (error) {
				s.state = "paused";
				s.note = `Row ${i + 1} (${row.name}) did not start: ${error}`;
				this.save(true);
				return;
			}
			going++;
			this.save();
		}
		// done once every row is settled
		const settled = s.rows.every((r, i) => this.settled(r, i, byDir));
		if (settled && !this.checking.size) {
			s.note = this.failed();
			s.state = s.note ? "paused" : "done";
			if (!s.note) s.ended = new Date().toISOString();
			this.save(true);
		} else if (s.state === "checking" && s.rows.every((r) => r.check)) {
			s.state = "running";
			this.save();
		}
	}

	/** The note for rows whose check failed, or "" when none did. */
	private failed() {
		const n = this.saved.rows.filter((r) => r.check === "error").length;
		return n ? `${n} row${n === 1 ? "" : "s"} could not be checked, so ${n === 1 ? "it was" : "they were"} not searched: see the reason on each. Resume checks them again.` : "";
	}

	/** A row that needs nothing more: ruled out, or its run finished, failed, stopped at the limit, or adopted. */
	private settled(r: SavedRow, i: number, byDir: Map<string, RunFolder>) {
		if (!r.check) return false;
		if (r.check !== "open") return true;
		if (r.adopted) return true;
		const run = this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined;
		if (!run) return !!this.rows[i].none;
		return run.state === "finished" || run.state === "failed" || (run.state === "stopped" && (!!r.limited || !!run.capped));
	}

	/** The next row to start, or -1: a row of its own stopped (not at the limit), else the first never run. */
	private nextRow(byDir: Map<string, RunFolder>): number {
		const rows = this.saved.rows;
		const own = (r: SavedRow) => (!r.adopted && this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined);
		const stopped = rows.findIndex((r) => {
			const run = own(r);
			return r.check === "open" && run?.state === "stopped" && !r.limited && !run.capped;
		});
		if (stopped >= 0) return stopped;
		return rows.findIndex((r) => r.check === "open" && !r.adopted && (!this.runDir(r) || !byDir.has(this.runDir(r)!)));
	}

	/**
	 * Whether rows are keyed, to find an earlier row with the same board: only when parameters can make two rows
	 * alike (two subsets of one board never are), so a census of thousands of rows builds no board early. Every
	 * row is keyed then, checked or not, so a row checked in an earlier pass still has its twins found.
	 */
	private get keyed() {
		return this.plan.params.length > 0;
	}

	/** Check rows, a few at once: static rows at once, the others through tilesearch --balance. */
	private check(ctx: Context) {
		const s = this.saved;
		const seen = new Map<string, number>();
		for (let i = 0; i < this.rows.length && this.checking.size < CHECKS; i++) {
			const plan = this.rows[i];
			const r = s.rows[i];
			if (!plan.none && this.keyed) {
				const key = rowText(this.plan, plan).key;
				const twin = seen.get(key);
				if (twin === undefined) seen.set(key, i);
				else if (!r.check) {
					r.check = "same";
					r.reason = `Same board as row ${twin + 1}, ${this.rows[twin].name}.`;
					this.save();
					continue;
				}
			}
			if (r.check || this.checking.has(i)) continue;
			if (plan.none) {
				r.check = "static";
				r.reason = plan.none;
				this.save();
				continue;
			}
			this.checking.add(i);
			void this.balance(ctx, i).finally(() => {
				this.checking.delete(i);
				this.save();
				// the next check starts as soon as one ends, not at the next tick
				if (this.saved.state === "checking" || this.saved.state === "running") this.check(ctx);
			});
		}
	}

	private async balance(ctx: Context, i: number) {
		const plan = this.rows[i];
		const r = this.saved.rows[i];
		if (plan.none) return;
		const text = rowText(this.plan, plan).text;
		const orders = cyclicOrders(parse(text).board);
		if (orders > MAX_ORDERS) {
			r.check = "error";
			r.reason = `Its vertex lines have ${orders.toPrecision(2).replace("e+", "·10^")} orders of corners; the engine lists every one, and past ${MAX_ORDERS.toLocaleString("en")} it cannot.`;
			return;
		}
		const f = path.join(os.tmpdir(), `tilesearch-study-${process.pid}-${checkFiles++}.board`);
		// a tile-orbit row is checked as the engine runs it, swapped: what cannot balance there has no tiling either
		fs.writeFileSync(f, engineText(text));
		// an hour: a check of 10⁵ orders took 12 minutes on a busy machine, and one cut short leaves its row unsearched
		const out = await new Promise<string | null>((resolve) =>
			execFile(ctx.engine, [f, "--balance"], { timeout: 3_600_000, maxBuffer: 1 << 26 }, (err, stdout) =>
				resolve(err && !stdout ? null : stdout),
			),
		);
		fs.rmSync(f, { force: true });
		type Report = { feasible: boolean; alive: number[]; orders?: { word: string; alive: boolean }[] };
		let report: Report | null = null;
		try {
			report = out ? (JSON.parse(out.split("\n")[0]) as Report) : null;
		} catch {}
		if (!report) {
			r.check = "error";
			r.reason = "The engine could not check this row's board.";
			return;
		}
		const b = parse(text).board;
		if (!report.feasible) {
			r.check = "balance";
			r.reason = "The balance check proves no periodic tiling holds every face this row requires.";
		} else {
			const split = splitReason(b, report.alive);
			if (split) {
				// a required corner with no live vertex is the balance check's verdict; faces apart are the split's
				r.check = /balance check leaves no vertex/.test(split) ? "balance" : "split";
				r.reason = split;
			} else r.check = "open";
		}
		this.adopt(ctx, i, b, aliveKeys(b, report));
	}

	/** Point a row at a finished run outside the study that did its search (sameSearch), covering its k. */
	private adopt(ctx: Context, i: number, b: ReturnType<typeof parse>["board"], alive: Set<string>) {
		const r = this.saved.rows[i];
		if (r.run) return;
		if (!this.index) {
			this.index = new Map();
			for (const run of ctx.runs.runs) {
				if (run.state !== "finished" || run.dir.startsWith(this.dir + path.sep)) continue;
				const shape = searchShape(parse(run.board).board);
				this.index.set(shape.frame, [...(this.index.get(shape.frame) ?? []), { run, ...shape }]);
			}
		}
		const row = { ...searchShape(b), alive };
		const find = this.saved.options.mode === "find";
		const covers = (run: RunFolder) => {
			const [lo, hi] = run.kRange;
			if (lo > b.kmin) return false;
			if (run.options?.find) return find && hi >= b.kmax;
			return hi >= b.kmax || (find && run.total > 0 && firstK(run.counts)! <= b.kmax);
		};
		const best = (this.index.get(row.frame) ?? [])
			.filter((c) => covers(c.run) && sameSearch(row, c))
			.sort((x, y) => y.run.kRange[1] - x.run.kRange[1])[0];
		if (best) {
			r.run = best.run.dir;
			r.adopted = true;
		}
	}

	// ── control ──

	pause(byDir: Map<string, RunFolder>) {
		if (this.saved.state === "done") return;
		this.saved.state = "paused";
		this.saved.note = "";
		for (const r of this.saved.rows) {
			const run = !r.adopted && this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined;
			if (run?.state === "running") run.stop("Paused with its study");
		}
		this.save(true);
	}

	resume() {
		for (const r of this.saved.rows) if (r.check === "error") delete r.check, delete r.reason;
		this.saved.state = this.saved.rows.every((r) => r.check) ? "running" : "checking";
		this.saved.note = "";
		delete this.saved.ended;
		this.save(true);
	}

	/** Raise no row's k any more: the rule comes off the study and off every row's run (the k they are on finishes). */
	unraise(byDir: Map<string, RunFolder>) {
		const { raise: _, ...rest } = this.saved.options;
		this.saved.options = rest;
		for (const r of this.saved.rows) if (!r.adopted && this.runDir(r)) byDir.get(this.runDir(r)!)?.setRaise(null);
		this.save(true);
	}

	/**
	 * Finish every search a time limit stopped: each goes on from where it stopped to the end of the k it was on,
	 * with no limit and raising k no further. A disk ceiling still holds. Returns how many go on.
	 */
	finish(byDir: Map<string, RunFolder>): number {
		let on = 0;
		for (const r of this.saved.rows) {
			const run = !r.adopted && this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined;
			if (run?.state !== "stopped") continue;
			if (r.limited) {
				delete r.limited;
				r.free = true;
			} else if (run.capped && !run.capped.includes("wrote over")) run.uncap();
			else continue;
			on++;
		}
		if (on) this.resume();
		return on;
	}

	/**
	 * Rows at once, threads per row and priority, changed while the study goes or waits. A search takes them as it
	 * starts; one going now takes a lower priority at once (the system lets a process's priority go down, not up),
	 * and with `restart` stops and resumes from its finished roots, with the new threads.
	 */
	setResources(o: Pick<StudyOptions, "parallel" | "threads" | "nice">, restart: boolean, byDir: Map<string, RunFolder>) {
		this.saved.options = { ...this.saved.options, ...o };
		for (const r of this.saved.rows) {
			const run = !r.adopted && this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined;
			if (run?.state !== "running") continue;
			if (restart) run.stop(`Restarted with ${o.threads} thread${o.threads === 1 ? "" : "s"}`);
			else run.renice(o.nice);
		}
		this.save(true);
	}

	/** The last edit previewed, against the plan it was compared with: applying it does not compare rows again. */
	private pending: { text: string; base: StudyPlan; plan: StudyPlan; changed: Set<string> } | null = null;

	/**
	 * An edited study board, previewed, and with `apply` taken. Rows whose board is the same keep their checks and
	 * searches; a row whose board changed is checked and searched again; rows the board no longer gives leave; new
	 * rows join. An optional face the edit takes out is recorded with what its rows had found, for the census. The
	 * runs of rows that leave or start over stay on disk, and come back in `stop` for main to stop or dequeue. Rows
	 * are compared a few hundred at a time, so the app answers meanwhile on a study of thousands.
	 */
	async edit(
		text: string,
		apply: boolean,
		byDir: Map<string, RunFolder>,
		queued: (id: string) => boolean,
	): Promise<(StudyEdit & { stop: string[] }) | { error: string }> {
		const [base, rows] = [this.plan, this.rows];
		const same = this.pending?.text === text && this.pending.base === base ? this.pending : null;
		const plan = same?.plan ?? planStudy(text);
		if (plan.problems.length) return { error: plan.problems[0].message };
		if (!plan.list) return { error: `${plan.rows.toLocaleString("en")} rows is more than a study runs at once.` };
		const old = new Map(rows.map((r) => [r.name, r]));
		const changed = same?.changed ?? new Set<string>();
		if (!same) {
			for (const [j, r] of plan.list.entries()) {
				if (j % 200 === 199) await new Promise((ok) => setImmediate(ok));
				const o = old.get(r.name);
				if (o && withoutK(rowText(base, o).text) !== withoutK(rowText(plan, r).text)) changed.add(r.name);
			}
			if (this.plan !== base) return { error: "The study changed while its rows were compared: try again." };
			this.pending = { text, base, plan, changed };
		}
		const names = new Set(plan.list.map((r) => r.name));
		const shown = rows.map((_, i) => this.row(i, byDir, queued));
		const gone = shown.filter((r) => !names.has(r.name));
		const at = new Date().toISOString();
		const added = plan.list.filter((r) => !old.has(r.name)).length;
		const out = {
			rows: plan.list.length,
			kept: plan.list.length - added - changed.size,
			changed: changed.size,
			added,
			dropped: gone.length,
			lost: shown
				.filter((r) => r.total > 0 && (!names.has(r.name) || changed.has(r.name)))
				.map((r) => ({ name: r.name, tilings: r.total })),
			removed: base.optional.filter((f) => !plan.optional.includes(f)).map((face) => ({ face, at, ...faceTally(gone, face) })),
			stop: [] as string[],
		};
		if (!apply) return out;
		for (const r of this.saved.rows) {
			if (names.has(r.name) && !changed.has(r.name)) continue;
			if (!r.adopted && r.run) out.stop.push(this.place(r.run));
			// a changed row starts over: checked, then searched in a run of its own
			if (changed.has(r.name)) for (const k of Object.keys(r) as (keyof SavedRow)[]) if (k !== "name") delete r[k];
		}
		fs.writeFileSync(path.join(this.dir, "study.board"), text);
		if (out.removed.length) this.saved.removed = [...(this.saved.removed ?? []), ...out.removed];
		this.pending = null;
		this.load(text, plan);
		if (this.saved.state === "done" && (added || changed.size)) this.resume();
		else this.save(true);
		return out;
	}

	/**
	 * A new time limit on each search, in minutes (null for none), raised or lowered. A study that raises k keeps
	 * it as its rule's ceiling, which a running search reads as it goes; another as its own limit, checked each
	 * tick. A row searching past it stops there; a row a limit stopped goes on while it is under it, and its
	 * search picks up where it stopped. Returns how many rows go on.
	 */
	setLimit(minutes: number | null, byDir: Map<string, RunFolder>): number {
		const o = this.saved.options;
		const { minutes: _, ...rest } = o.raise ?? { upTo: 0 };
		const rule = o.raise ? { ...rest, ...(minutes === null ? {} : { minutes }) } : undefined;
		this.saved.options = { ...o, limit: rule || minutes === null ? 0 : minutes * 60, ...(rule ? { raise: rule } : {}) };
		let on = 0;
		for (const r of this.saved.rows) {
			const run = !r.adopted && this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined;
			if (!run) continue;
			if (r.limited && (minutes === null || run.elapsed < minutes * 60)) {
				delete r.limited;
				on++;
			}
			if (!rule) continue;
			if (!run.capped) run.setRaise(rule);
			else if (!raiseCeiling(rule, factsOf(run))) {
				run.uncap(rule);
				on++;
			}
		}
		if (on && this.saved.state === "done") {
			this.saved.state = "running";
			this.saved.note = "";
			delete this.saved.ended;
		}
		this.save(true);
		return on;
	}

	/**
	 * A new raise rule for the whole study (Raise k on its page). Rows not run yet start under it. A row whose run
	 * finished goes on when the rule now asks more of it (a higher k, more tilings): main raises its run and the row
	 * follows. A row a ceiling stopped goes on when it is under the new ceilings. A row that adopted a run the rule
	 * finds short lets it go and searches for itself (adopted runs are someone else's: never raised, never
	 * replaced). Ruled-out rows stay. Returns how many rows go on.
	 */
	raise(rule: RaiseRule, byDir: Map<string, RunFolder>): number {
		if (this.saved.options.mode === "find") return 0;
		this.saved.options = { ...this.saved.options, raise: rule };
		let on = 0;
		for (const r of this.saved.rows) {
			const run = r.check === "open" && this.runDir(r) ? byDir.get(this.runDir(r)!) : undefined;
			if (!run) continue;
			const facts = factsOf(run);
			const more = run.state === "finished" && !raiseStop(rule, facts);
			if (r.adopted) {
				if (more) {
					delete r.adopted;
					delete r.run;
					on++;
				}
			} else if (run.capped) {
				if (!raiseCeiling(rule, facts)) {
					run.uncap(rule);
					on++;
				}
			} else {
				run.setRaise(rule);
				if (more) on++;
			}
		}
		if (on && this.saved.state === "done") {
			this.saved.state = "running";
			this.saved.note = "";
			delete this.saved.ended;
		}
		this.save(true);
		return on;
	}

	/** On launch without resumeOnLaunch, a study that was going waits to be resumed. */
	holdAfterQuit() {
		if (this.saved.state === "checking" || this.saved.state === "running") {
			this.saved.state = "paused";
			this.saved.note = "Paused when the Tiling Searcher quit";
			this.save(true);
		}
	}

	// ── what the window sees ──

	private row(i: number, byDir: Map<string, RunFolder>, queued: (id: string) => boolean): StudyRow {
		const plan = this.rows[i];
		const r = this.saved.rows[i];
		const dir = this.runDir(r);
		const run = dir ? byDir.get(dir) : undefined;
		// raised: until its new search finishes (or a limit stops it), the row shows what the search before it found,
		// every k up to its own; the new search's partial counts would hide that the row has tilings
		const prior =
			r.was && run && !run.options?.find && (run.state === "running" || (run.state === "stopped" && !run.capped && !r.limited))
				? byDir.get(this.place(r.was))
				: undefined;
		const before = prior?.state === "finished" ? prior : undefined;
		const shown = before ?? run;
		// from the study's lowest k up to wherever its run went: k raised past the study's, or an adopted run's
		const counts = Object.fromEntries(Object.entries(shown?.counts ?? {}).filter(([k]) => +k >= this.k[0])) as Record<
			number,
			number
		>;
		const base: StudyRow = {
			index: i,
			name: plan.name,
			faces: plan.faces,
			values: plan.values,
			state: "checking",
			counts,
			total: Object.values(counts).reduce((t, x) => t + x, 0),
			reached: run?.options?.find ? run.find?.found || Math.max(0, (run.find?.proven ?? 0) - 1) || undefined : shown?.kRange[1],
			elapsed: run && !r.adopted ? run.elapsed + (before?.elapsed ?? 0) : 0,
			...(r.reason ? { reason: r.reason } : {}),
			...(run ? { run: run.dir, ...(r.adopted ? { adopted: true } : {}) } : {}),
		};
		const ruled = r.check === "static" || r.check === "balance" || r.check === "split";
		if (ruled) {
			base.by = r.check as StudyRow["by"];
			base.state = run && run.total > 0 ? "conflict" : "ruled-out";
			if (base.state === "conflict") base.reason = `${r.reason} Yet its run found ${run!.total} tilings: report this.`;
			return base;
		}
		if (r.check === "same") return { ...base, state: "same" };
		if (r.check === "error") return { ...base, state: "failed" };
		if (!r.check) return base;
		if (!run) return { ...base, state: "waiting" };
		if (before) {
			const raising = { state: run.state === "running" ? "running" : queued(run.dir) ? "queued" : "stopped", k: run.kRange[1] } as const;
			const first = firstK(counts);
			return first ? { ...base, state: "found", first, raising } : { ...base, state: "none", through: before.kRange[1], raising };
		}
		const find = !!run.options?.find;
		const first = (find && run.find?.found) || firstK(counts);
		if (run.state === "running") return { ...base, state: "running", roots: { ...run.roots } };
		if (run.state === "failed") return { ...base, state: "failed", reason: run.note || "The search failed; see its log." };
		if (run.state === "finished")
			return first
				? { ...base, state: "found", first }
				: {
						...base,
						state: "none",
						through: find ? Math.max(0, (run.find?.proven ?? 0) - 1) || undefined : run.kRange[1],
					};
		// stopped part way: its counts are its finished roots', so the least k among them is not the first k
		if (run.capped) return { ...base, state: "limit", reason: run.capped, roots: { ...run.roots } };
		return { ...base, state: r.limited ? "limit" : queued(run.dir) ? "queued" : "stopped", roots: { ...run.roots } };
	}

	summary(byDir: Map<string, RunFolder>, queued: (id: string) => boolean): StudySummary {
		const tally: Partial<Record<RowState, number>> = {};
		let elapsed = 0;
		// the study's k reaches as far as any row's run went
		let kmax = this.k[1];
		let raising = 0;
		for (let i = 0; i < this.rows.length; i++) {
			const row = this.row(i, byDir, queued);
			if (row.run) kmax = Math.max(kmax, byDir.get(row.run)?.kRange[1] ?? 0);
			tally[row.state] = (tally[row.state] ?? 0) + 1;
			elapsed += row.elapsed;
			if (row.raising) raising++;
		}
		const m = STAMP.exec(path.basename(this.dir));
		return {
			id: this.dir,
			dir: this.dir,
			name: path.basename(this.dir).replace(STAMP, "") || path.basename(this.dir),
			created: m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : Date.parse(this.saved.created),
			ended: this.saved.ended ? Date.parse(this.saved.ended) : null,
			state: this.saved.state,
			note: this.saved.note,
			options: this.saved.options,
			kmin: this.k[0],
			kmax,
			params: this.plan.params.map((p) => ({ name: p.name, values: p.values })),
			optional: this.plan.optional,
			sizes: this.plan.sizes,
			required: this.plan.required,
			rowCount: this.rows.length,
			checked: this.saved.rows.filter((r) => r.check).length,
			tally,
			elapsed,
			raising,
		};
	}

	detail(byDir: Map<string, RunFolder>, queued: (id: string) => boolean): StudyDetail {
		const rows = this.rows.map((_, i) => this.row(i, byDir, queued));
		return { ...this.summary(byDir, queued), rows, template: this.template, removed: this.saved.removed ?? [] };
	}
}

const firstK = (counts: Record<number, number>) => {
	const ks = Object.entries(counts)
		.filter(([, n]) => n > 0)
		.map(([k]) => Number(k));
	return ks.length ? Math.min(...ks) : undefined;
};

/** Every study under the output folder, kept across rescans so a study's checks in flight are not lost. */
export class Studies {
	private all = new Map<string, Study>();

	rescan(runs: Runs) {
		const next = new Map<string, Study>();
		for (const dir of runs.studies) {
			const s = this.all.get(dir) ?? Study.open(dir);
			if (s) next.set(dir, s);
		}
		this.all = next;
	}

	add(s: Study) {
		this.all.set(s.dir, s);
	}

	get(id: string) {
		return this.all.get(id);
	}

	list() {
		return [...this.all.values()];
	}

	/** A renamed or moved folder carries the studies in it along. */
	carry(from: string, to: string) {
		for (const s of [...this.all.values()])
			if (s.dir === from || s.dir.startsWith(from + path.sep)) {
				this.all.delete(s.dir);
				s.dir = to + s.dir.slice(from.length);
				this.all.set(s.dir, s);
			}
	}
}
