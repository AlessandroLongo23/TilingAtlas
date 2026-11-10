/**
 * The face-homogeneous classification's member list (lib/classifications.ts): every edge-to-edge tiling by regular
 * polygons in which no two tile orbits have the same full face figure (the tile with every tile that shares a corner
 * with it; a figure and its mirror image count as one). The list is the face-stars search with no bound on k
 * (tools/ctrnact-oracle/homogeneous.py face-stars --kmax 1000, the cap never reached: 13,144 tilings, k up to 54),
 * read from SEARCH. A member on the regular shelf keeps its record, found by symbol among the shelf records with its
 * signature (k and vertex types); the others are drawn from their symbols (records.ts developSymbol) as fh-{k}-{n},
 * each checked by reading its symbol back off the drawn cell. Fails unless every member with k ≤ REGULAR_COMPLETE_K
 * is on the shelf, which holds every k-uniform tiling there. Shelf files and drawings run --jobs processes at a time.
 *
 * With --simple, the simple-face-homogeneous list: no two tile orbits share a simple face figure (the tile with the
 * tiles across its sides), from the face-simple search (346 tilings, k up to 14, every one on the shelf).
 *
 *   NODE_OPTIONS=--max-old-space-size=16000 pnpm tsx scripts/classify-face-homogeneous.ts [--simple] [--jobs N] > <log>
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { components, DSymbol, edgeOrbits } from "@/lib/classes/algorithm/delaney/DSymbol";
import { REGULAR_COMPLETE_K, REGULAR_SHARD_KS, type ReferenceTiling } from "@/lib/services/referenceAtlas";
import { SOURCES } from "@/lib/vocabulary";
import { developSymbol, facts, seedRecord, signature, symbolSignature } from "./atlas/records";
import { canonicalSymbol, readShelf, regularShelfFiles, writeClassification } from "./atlas/symbols";

const ROOT = process.cwd();
const SIMPLE = process.argv.includes("--simple");
const SEARCH = SIMPLE
	? path.join(ROOT, "experiments", "results", "homogeneous-2026-11-10-simple", "face-simple-all.json")
	: path.join(ROOT, "experiments", "results", "homogeneous-2026-11-09", "face-stars-all.json");
const OUT = path.join(ROOT, "public", "classifications", `${SIMPLE ? "simple-" : ""}face-homogeneous.json.br`);
type Row = { k: number; e: number; dsymbol: [number, ...number[][]] };
type Member = { id: string; k: number; e: number; dsym: string };
const time = () => new Date().toTimeString().slice(0, 8);
const dsymOf = (d: Row["dsymbol"]) => canonicalSymbol([d[0], ...(d.slice(1) as number[][]).flat()]);

/** One shelf file: the records whose symbol is a member's, one JSON line each. Only a record with a member's
 *  signature can be one; the Searcher's records carry no vertex types, so theirs are all read. */
function matchWorker(file: string, wanted: string, out: string): void {
	const { sigs, dsyms } = JSON.parse(fs.readFileSync(wanted, "utf8")) as { sigs: string[]; dsyms: string[] };
	const [S, D] = [new Set(sigs), new Set(dsyms)];
	const lines: string[] = [];
	for (const t of readShelf([file])) {
		const v = t as unknown as { partition?: number[]; vcs?: string[] };
		if (v.vcs && v.partition && !S.has(signature(t.k, { partition: v.partition, vcs: v.vcs }))) continue;
		const f = facts(t as never);
		const dsym = canonicalSymbol(f.sym.canonicalForm());
		if (!D.has(dsym)) continue;
		// The Searcher's records carry no orbit counts or vertex types: the list's copy takes them from the symbol,
		// so the classification counts every member by edge and face orbits.
		Object.assign(t, {
			m: v.vcs ? t.m : f.m,
			partition: v.partition ?? f.partition,
			vcs: v.vcs ?? f.vcs,
			edgeOrbits: t.edgeOrbits ?? edgeOrbits(f.sym).length,
			faceOrbits: t.faceOrbits ?? components(f.sym, 0, 1).length,
		});
		lines.push(JSON.stringify({ dsym, t }));
	}
	fs.writeFileSync(out, lines.join("\n") + "\n");
}

/** Every n-th member to draw from the i-th: its record, its symbol read back, one JSON line each. */
function drawWorker(todo: string, i: number, n: number, out: string): void {
	const rows = JSON.parse(fs.readFileSync(todo, "utf8")) as (Member & { dsymbol: Row["dsymbol"] })[];
	const fd = fs.openSync(out, "w");
	for (let j = i; j < rows.length; j += n) {
		const { id, k, dsym, dsymbol } = rows[j];
		const attribution = { discoverer: "Alessandro Longo", certification: "candidate" };
		const { rec, facts: f } = seedRecord(developSymbol(id, k, dsymbol as number[][]), SOURCES.HOMOGENEOUS, attribution);
		const back = canonicalSymbol(f.sym.canonicalForm());
		if (back !== dsym) throw new Error(`${id}: drawn, its symbol reads back as ${back}, not ${dsym}`);
		fs.writeSync(fd, JSON.stringify(rec) + "\n");
	}
	fs.closeSync(fd);
}

/** Run `args` as workers of this script, `jobs` at a time. */
async function pool(tasks: string[][], jobs: number, done: (i: number) => void): Promise<void> {
	const queue = tasks.map((_, i) => i);
	const next = async (): Promise<void> => {
		for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
			const args = tasks[i];
			await new Promise<void>((ok, fail) =>
				spawn(process.execPath, [...process.execArgv, process.argv[1], ...args], { stdio: "inherit" }).on(
					"exit",
					(code) => (code === 0 ? ok() : fail(new Error(`${args.join(" ")}: worker exited ${code}`))),
				),
			);
			done(i);
		}
	};
	await Promise.all(Array.from({ length: jobs }, next));
}

async function main(jobs: number): Promise<void> {
	const rows = (JSON.parse(fs.readFileSync(SEARCH, "utf8")) as Row[]).map((r) => ({
		...r,
		dsym: dsymOf(r.dsymbol),
		sig: symbolSignature(new DSymbol(...(r.dsymbol.slice(1) as [number[], number[], number[], number[], number[]]))),
	}));
	rows.sort((a, b) => a.k - b.k || a.e - b.e || (a.dsym < b.dsym ? -1 : a.dsym > b.dsym ? 1 : 0));
	console.log(`${time()}  the search: ${rows.length} tilings, k up to ${rows[rows.length - 1].k}`);
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "face-homogeneous-"));
	const wanted = path.join(tmp, "wanted.json");
	fs.writeFileSync(
		wanted,
		JSON.stringify({ sigs: [...new Set(rows.map((r) => r.sig))], dsyms: rows.map((r) => r.dsym) }),
	);

	// A shard still being built is not on disk: its k's members are drawn for now, and a rerun matches them.
	const ks = REGULAR_SHARD_KS.filter((k) => k <= rows[rows.length - 1].k);
	const absent = ks.filter(
		(k) =>
			!regularShelfFiles([k])
				.slice(1)
				.every((f) => fs.existsSync(f)),
	);
	if (absent.length) console.log(`${time()}  ⚑ not on disk, so drawn and NOT checked against the shelf: k = ${absent}`);
	const files = regularShelfFiles(ks.filter((k) => !absent.includes(k)));
	const t0 = Date.now();
	const min = () => ((Date.now() - t0) / 60000).toFixed(1);
	let n = 0;
	await pool(
		files.map((f, i) => ["--match", f, wanted, path.join(tmp, `match-${i}.jsonl`)]),
		jobs,
		(i) => console.log(`${time()}  shelf ${++n}/${files.length}, ${path.basename(files[i])}, ${min()} min`),
	);
	const onShelf = new Map<string, ReferenceTiling>();
	for (let i = 0; i < files.length; i++)
		for (const line of fs
			.readFileSync(path.join(tmp, `match-${i}.jsonl`), "utf8")
			.split("\n")
			.filter(Boolean)) {
			const { dsym, t } = JSON.parse(line) as { dsym: string; t: ReferenceTiling };
			if (onShelf.has(dsym)) throw new Error(`${t.id} and ${onShelf.get(dsym)!.id} are one tiling`);
			onShelf.set(dsym, t);
		}
	const missing = rows.filter((r) => r.k <= REGULAR_COMPLETE_K && !absent.includes(r.k) && !onShelf.has(r.dsym));
	if (missing.length)
		throw new Error(
			`${missing.length} members with k ≤ ${REGULAR_COMPLETE_K} are not on the shelf, first k = ${missing[0].k}`,
		);
	console.log(`${time()}  on the shelf: ${onShelf.size}, every member with k ≤ ${REGULAR_COMPLETE_K} among them`);

	const perK = new Map<number, number>();
	const members: Member[] = rows.map((r) => {
		const shelf = onShelf.get(r.dsym);
		if (shelf && shelf.k !== r.k) throw new Error(`${shelf.id}: k = ${shelf.k} on the shelf, ${r.k} in the search`);
		perK.set(r.k, (perK.get(r.k) ?? 0) + (shelf ? 0 : 1));
		return { id: shelf?.id ?? `fh-${r.k}-${perK.get(r.k)}`, k: r.k, e: r.e, dsym: r.dsym };
	});
	const todo = members.flatMap((m, i) => (onShelf.has(m.dsym) ? [] : [{ ...m, dsymbol: rows[i].dsymbol }]));
	const todoFile = path.join(tmp, "todo.json");
	fs.writeFileSync(todoFile, JSON.stringify(todo));
	n = 0;
	const slices = todo.length ? jobs * 4 : 0;
	await pool(
		Array.from({ length: slices }, (_, i) => [
			"--draw",
			todoFile,
			`${i}`,
			`${slices}`,
			path.join(tmp, `draw-${i}.jsonl`),
		]),
		jobs,
		() => console.log(`${time()}  drawn ${++n}/${slices} slices of ${todo.length} tilings, ${min()} min`),
	);
	const drawn = Array.from({ length: slices }, (_, i) =>
		fs
			.readFileSync(path.join(tmp, `draw-${i}.jsonl`), "utf8")
			.split("\n")
			.filter(Boolean),
	)
		.flat()
		.map((l) => JSON.parse(l));
	if (drawn.length !== todo.length) throw new Error(`${todo.length} to draw, ${drawn.length} drawn`);
	fs.rmSync(tmp, { recursive: true });
	const records = [...onShelf.values(), ...(drawn as ReferenceTiling[])];
	writeClassification(OUT, members, records);
	const byK = Object.fromEntries(
		[...new Set(members.map((m) => m.k))].map((k) => [k, members.filter((m) => m.k === k).length]),
	);
	console.log(
		`${time()}  wrote ${path.relative(ROOT, OUT)}: ${members.length} tilings, ${onShelf.size} from the shelf, ${drawn.length} drawn; by k ${JSON.stringify(byK)}`,
	);
}

const argv = process.argv.slice(2);
if (argv[0] === "--match") matchWorker(argv[1], argv[2], argv[3]);
else if (argv[0] === "--draw") drawWorker(argv[1], +argv[2], +argv[3], argv[4]);
else
	main(argv.includes("--jobs") ? +argv[argv.indexOf("--jobs") + 1] : os.cpus().length - 1).catch((e) => {
		console.error(e);
		process.exitCode = 1;
	});
