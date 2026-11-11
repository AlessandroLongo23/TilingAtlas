/**
 * The regular shelf's lazy shards past the base atlas, from the Čtrnáct engine (regular palette): every k-uniform
 * tiling of each k asked for, as public/reference-atlas-k{k}.json.br, or -p{i} parts of PART_SIZE sorted by id.
 * Cells come from tools/ctrnact-oracle/eu_develop on a pruned run (--pruned, the k ≤ 16 run by default), each
 * worker developing its share of a k (--shard) with the tile polygons (EU_FACES) and reading it as it comes; each
 * record carries what the k ≤ 10 records carry: the wallpaper group and lattice from nClassify, the vertex types and
 * edge and face orbits from the Delaney–Dress symbol, the polygon facets from the engine's polygons. A tiling already
 * in a shard under another id (Galebach's eh*, the Searcher's ts-*) keeps its record and the engine's copy is
 * dropped, matched by canonical symbol; every such record must match exactly one. The main process keeps where each
 * record is and its id, sorts those and cuts the parts, which `jobs` processes write. --check builds the ks and
 * compares every field with the shipped records, writing nothing (the gate: k = 8 to 16 reproduce exactly).
 * Progress goes to experiments/results.
 *
 *   NODE_OPTIONS=--max-old-space-size=16000 pnpm tsx scripts/build-regular-shards.ts --ks 11-16 [--jobs 9] [--check]
 *     [--pruned tools/ctrnact-oracle/work/k18-fast/out/pruned] [--out <dir>, public/ by default]
 * It prints the part boundaries for REGULAR_SHARD_PARTS (lib/services/referenceAtlas.ts).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { annotatePolygonFacets } from "@/lib/services/polygonFacets";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";
import { ctrnactAttribution } from "./atlas/attribution";
import { stringifyAtlas } from "./atlas/encode.mjs";
import { readDataJson, writeDataFile } from "./atlas/io.mjs";
import { facts, seedRecord, signature, type Cell, type Rec } from "./atlas/records";

const ROOT = process.cwd();
const ORACLE = path.join(ROOT, "tools", "ctrnact-oracle");
const PRUNED = path.join(ORACLE, "work", "k16-run", "pruned");
const LOG = path.join(ROOT, "experiments", "results", "regular-shards-2026-11-09.log");
const PART_SIZE = 100_000;
const FIELDS = [
	"family",
	"exactSource",
	"discoverer",
	"certification",
	"m",
	"partition",
	"wallpaperGroup",
	"latticeShape",
	"polygonSpecies",
	"tilePeriods",
	"vcs",
	"edgeOrbits",
	"faceOrbits",
] as const;

const log = (s: string) => fs.appendFileSync(LOG, `${new Date().toTimeString().slice(0, 8)}  ${s}\n`);
const PUBLIC = path.join(ROOT, "public");
const shardFiles = (k: number, dir = PUBLIC) =>
	fs
		.readdirSync(dir)
		.filter((f) => new RegExp(`^reference-atlas-k${k}(-p\\d+)?\\.json\\.br$`).test(f))
		.map((f) => path.join(dir, f));

/** One engine tiling as a shelf record, with its canonical key when its signature is one of `sigs`. */
function record(c: Cell, sigs: Set<string>): Rec {
	const { rec, facts: f } = seedRecord(c, "ctrnact", ctrnactAttribution(c.k));
	return sigs.has(signature(c.k, f)) ? { ...rec, key: f.sym.canonicalKey() } : rec;
}

const readLines = (file: string) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean);

/**
 * Worker i of n: its share of k, developed by an eu_develop of its own, one cell a line, as records into `out`, a
 * line each, and `out`.idx saying where each one is ("<id> <offset> <length>"): the main process sorts those, never
 * the records (k = 18's 4.2 M records parsed would be 23 GB). A record with a key, which may be on the shelf under
 * another id, goes to `out`.keyed.
 */
async function worker([k, i, n, out, sigFile, pruned]: string[]): Promise<void> {
	const sigs = new Set<string>(JSON.parse(fs.readFileSync(sigFile, "utf8")));
	const [fd, keyed] = [fs.openSync(out, "w"), fs.openSync(`${out}.keyed`, "w")];
	const index: string[] = [];
	let at = 0;
	const args = ["--kmin", k, "--kmax", k, "--pruned", pruned, "--shard", `${i}/${n}`, "--lines", "--out", "-"];
	const develop = spawn(path.join(ORACLE, "eu_develop"), args, {
		env: { ...process.env, EU_FACES: "1" },
		stdio: ["ignore", "pipe", "inherit"],
	});
	const exited = new Promise<number | null>((ok) => develop.on("exit", ok));
	const t0 = Date.now();
	let [done, rebuilt] = [0, 0];
	for await (const line of readline.createInterface({ input: develop.stdout! })) {
		const c = JSON.parse(line) as Cell;
		if (!c.areaOk) rebuilt++; // its polygons rebuilt from the seeds instead
		const r = record(c, sigs);
		const text = JSON.stringify(r) + "\n";
		if (r.key) fs.writeSync(keyed, text);
		else {
			const bytes = fs.writeSync(fd, text);
			index.push(`${r.id} ${at} ${bytes - 1}\n`);
			at += bytes;
		}
		if (++done % 20000 === 0) log(`  worker ${i}: ${done} (${((Date.now() - t0) / done).toFixed(1)} ms each)`);
	}
	const code = await exited;
	if (code !== 0) throw new Error(`worker ${i}: eu_develop exited ${code}`);
	if (rebuilt) log(`  worker ${i}: ${rebuilt} cells failed the engine's area check, rebuilt from their seeds`);
	fs.writeFileSync(`${out}.idx`, index.join(""));
	fs.closeSync(fd);
	fs.closeSync(keyed);
}

/** A part writer: each part file given lists its records as [file, offset, length] in id order; read, encoded and
 *  written as one shard. Parts go to `jobs` of these at once: a part's brotli is 17 s, as long as the records. */
function writeParts([filesJson, ...partFiles]: string[]): void {
	const files = JSON.parse(fs.readFileSync(filesJson, "utf8")) as string[];
	const fds = files.map((f) => fs.openSync(f, "r"));
	for (const pf of partFiles) {
		const { out, rows } = JSON.parse(fs.readFileSync(pf, "utf8")) as { out: string; rows: number[][] };
		const records = rows.map(([fi, off, len]) => {
			const buf = Buffer.alloc(len);
			fs.readSync(fds[fi], buf, 0, len, off);
			return JSON.parse(buf.toString("utf8")) as Rec;
		});
		writeDataFile(out, stringifyAtlas(records) + "\n");
	}
}

const run = (args: string[]) =>
	new Promise<void>((ok, fail) =>
		spawn(process.execPath, [...process.execArgv, process.argv[1], ...args], { stdio: "inherit" }).on("exit", (code) =>
			code === 0 ? ok() : fail(new Error(`worker ${args.join(" ")} exited ${code}`)),
		),
	);

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const [lo, hi] = argv[argv.indexOf("--ks") + 1].split("-").map(Number);
	const jobs = argv.includes("--jobs") ? +argv[argv.indexOf("--jobs") + 1] : os.cpus().length - 1;
	const check = argv.includes("--check");
	const pruned = argv.includes("--pruned") ? path.resolve(argv[argv.indexOf("--pruned") + 1]) : PRUNED;
	const outDir = argv.includes("--out") ? path.resolve(argv[argv.indexOf("--out") + 1]) : PUBLIC; // the shards, the shelf's by default
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "regular-shards-"));
	const parts: Record<number, string[]> = {};
	log(`=== ${check ? "check" : "build"} k = ${lo} to ${hi}, ${jobs} processes, scratch ${tmp} ===`);
	for (let k = lo; k <= (hi || lo); k++) {
		const t0 = Date.now();
		const shipped = shardFiles(k).flatMap((f) => decodeAtlas<Rec>(readDataJson(f)));
		// Another id for an engine tiling: kept, and matched to the engine's copy by symbol.
		const others = check ? [] : shipped.filter((r) => r.source !== "ctrnact" && r.source !== "ctrnact-star");
		const keyOf = new Map<string, Rec>();
		for (const r of others) {
			const f = facts(r);
			const key = f.sym.canonicalKey();
			if (keyOf.has(key)) throw new Error(`${r.id} and ${keyOf.get(key)!.id} are one tiling`);
			keyOf.set(key, r);
			r.sig = signature(k, f);
		}
		const sigFile = path.join(tmp, "sigs.json");
		fs.writeFileSync(sigFile, JSON.stringify(others.map((r) => r.sig)));
		const outs = Array.from({ length: jobs }, (_, i) => path.join(tmp, `out-${k}-${i}`));
		await Promise.all(outs.map((out, i) => run(["--worker", `${k}`, `${i}`, `${jobs}`, out, sigFile, pruned])));

		if (check) {
			const engine = outs.flatMap((f) => [...readLines(f), ...readLines(`${f}.keyed`)].map((l) => JSON.parse(l) as Rec));
			log(`k = ${k}: ${engine.length} engine tilings in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
			const byId = new Map(shipped.map((r) => [r.id, r]));
			const diff: Record<string, number> = {};
			let missing = 0;
			let rebased = 0;
			for (const r of engine) {
				const s = byId.get(r.id);
				if (!s) missing++;
				else
					for (const f of FIELDS) {
						if (JSON.stringify(r[f]) === JSON.stringify(s[f])) continue;
						// eu_develop may reduce to another basis than develop.py did: the same tiling, one symbol.
						if (f === "exactSource" && facts(r).sym.canonicalKey() === facts(s).sym.canonicalKey()) rebased++;
						else diff[f] = (diff[f] ?? 0) + 1;
					}
			}
			const shippedEngine = shipped.filter((r) => r.source === "ctrnact").length;
			log(
				`  check: ${shippedEngine} shipped, ${missing} not shipped, ${rebased} the same tiling on another basis, differing fields ${JSON.stringify(diff)}`,
			);
			if (missing || shippedEngine !== engine.length || Object.keys(diff).length) process.exitCode = 1;
			continue;
		}

		// The keyed records: one the shelf has under another id is dropped, the rest kept. They and the shelf's own go
		// into one more file of lines, beside the workers'.
		const matched = new Set<string>();
		const kept = outs.flatMap((f) => readLines(`${f}.keyed`).map((l) => JSON.parse(l) as Rec)).filter((r) => {
			const other = keyOf.get(r.key as string);
			delete r.key;
			if (!other) return true;
			if (matched.has(other.id)) throw new Error(`${other.id} matches two engine tilings`);
			matched.add(other.id);
			return false;
		});
		const unmatched = others.filter((r) => !matched.has(r.id));
		if (unmatched.length)
			throw new Error(`k = ${k}: not among the engine's tilings: ${unmatched.map((r) => r.id).join(", ")}`);
		for (const r of others) delete r.sig;
		annotatePolygonFacets(hydrateRenderCells(others.filter((r) => !r.polygonSpecies)) as never[]);
		const files = [...outs, path.join(tmp, `out-${k}-extra`)];
		const [ids, file, off, len] = [[], [], [], []] as [string[], number[], number[], number[]];
		const add = (id: string, fi: number, o: number, l: number) => {
			ids.push(id);
			file.push(fi);
			off.push(o);
			len.push(l);
		};
		let at = 0;
		const extra = [...kept, ...others].map((r) => {
			const text = JSON.stringify(r);
			add(r.id, outs.length, at, Buffer.byteLength(text));
			at += Buffer.byteLength(text) + 1;
			return text + "\n";
		});
		fs.writeFileSync(files[outs.length], extra.join(""));
		outs.forEach((f, fi) => {
			for (const line of readLines(`${f}.idx`)) {
				const [id, o, l] = line.split(" ");
				add(id, fi, +o, +l);
			}
		});
		log(`k = ${k}: ${ids.length} tilings in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

		// In id order, cut into parts, written by `jobs` processes at once.
		const order = Array.from(ids.keys()).sort((a, b) => (ids[a] < ids[b] ? -1 : ids[a] > ids[b] ? 1 : 0));
		const count = Math.ceil(order.length / PART_SIZE);
		const filesJson = path.join(tmp, `files-${k}.json`);
		fs.writeFileSync(filesJson, JSON.stringify(files));
		const lists: string[][] = Array.from({ length: jobs }, () => []);
		for (let p = 0; p < count; p++) {
			const name = count === 1 ? `reference-atlas-k${k}.json.br` : `reference-atlas-k${k}-p${p}.json.br`;
			const rows = order.slice(p * PART_SIZE, (p + 1) * PART_SIZE).map((j) => [file[j], off[j], len[j]]);
			const pf = path.join(tmp, `part-${k}-${p}.json`);
			fs.writeFileSync(pf, JSON.stringify({ out: path.join(outDir, name), rows }));
			lists[p % jobs].push(pf);
		}
		for (const f of shardFiles(k, outDir)) fs.renameSync(f, path.join(tmp, path.basename(f)));
		await Promise.all(lists.filter((l) => l.length).map((l) => run(["--write", filesJson, ...l])));
		if (count > 1) parts[k] = Array.from({ length: count }, (_, p) => ids[order[p * PART_SIZE]]);
		const mb = shardFiles(k, outDir).reduce((s, f) => s + fs.statSync(f).size, 0) / 1e6;
		log(
			`  k = ${k}: ${order.length} tilings (${others.length} kept under their own ids), ${count} file(s), ${mb.toFixed(1)} MB, in ${((Date.now() - t0) / 60000).toFixed(1)} min; old files moved to ${tmp}`,
		);
	}
	if (Object.keys(parts).length) log(`REGULAR_SHARD_PARTS: ${JSON.stringify(parts)}`);
	log("done");
}

if (process.argv[2] === "--worker") void worker(process.argv.slice(3));
else if (process.argv[2] === "--write") writeParts(process.argv.slice(3));
else
	void main().catch((e) => {
		log(`FAILED: ${e instanceof Error ? e.stack : e}`);
		process.exit(1);
	});
