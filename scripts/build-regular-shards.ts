/**
 * The regular shelf's lazy shards past the base atlas, from the Čtrnáct engine (regular palette): every k-uniform
 * tiling of each k asked for, as public/reference-atlas-k{k}.json.br, or -p{i} parts of PART_SIZE sorted by id.
 * Cells come from tools/ctrnact-oracle/eu_develop on the pruned k ≤ 16 run; each record carries what the k ≤ 10
 * records carry: the wallpaper group and lattice from nClassify, the vertex types and edge and face orbits from the
 * Delaney–Dress symbol, the polygon facets from the cell. A tiling already in a shard under another id (Galebach's
 * eh*, the Searcher's ts-*) keeps its record and the engine's copy is dropped, matched by canonical symbol; every
 * such record must match exactly one. --check builds the ks and compares every field with the shipped records,
 * writing nothing (the gate: k = 8 to 10 reproduce exactly). Progress goes to experiments/results.
 *
 *   NODE_OPTIONS=--max-old-space-size=16000 pnpm tsx scripts/build-regular-shards.ts --ks 11-16 [--jobs 9] [--check]
 * It prints the part boundaries for REGULAR_SHARD_PARTS (lib/services/referenceAtlas.ts).
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
const shardFiles = (k: number) =>
	fs
		.readdirSync(path.join(ROOT, "public"))
		.filter((f) => new RegExp(`^reference-atlas-k${k}(-p\\d+)?\\.json\\.br$`).test(f))
		.map((f) => path.join(ROOT, "public", f));

/** The engine's cells in a develop file, every n-th from the i-th. The objects hold no nested objects, so each
 *  runs from a "{" to the next "}". */
async function* cellsOf(file: string, i: number, n: number): AsyncGenerator<Cell> {
	let buf = "";
	let index = 0;
	for await (const chunk of fs.createReadStream(file, { encoding: "utf8" })) {
		buf += chunk;
		let pos = 0;
		for (let end = buf.indexOf("}", pos); end >= 0; end = buf.indexOf("}", pos)) {
			if (index++ % n === i) yield JSON.parse(buf.slice(buf.indexOf("{", pos), end + 1));
			pos = end + 1;
		}
		buf = buf.slice(pos);
	}
}

/** One engine tiling as a shelf record, with its canonical key when its signature is one of `sigs`. */
function record(c: Cell, sigs: Set<string>): Rec {
	const { rec, facts: f } = seedRecord(c, "ctrnact", ctrnactAttribution(c.k));
	return sigs.has(signature(c.k, f)) ? { ...rec, key: f.sym.canonicalKey() } : rec;
}

async function worker([cells, i, n, out, sigFile]: string[]): Promise<void> {
	const sigs = new Set<string>(JSON.parse(fs.readFileSync(sigFile, "utf8")));
	const fd = fs.openSync(out, "w");
	const t0 = Date.now();
	let done = 0;
	for await (const c of cellsOf(cells, +i, +n)) {
		fs.writeSync(fd, JSON.stringify(record(c, sigs)) + "\n");
		if (++done % 5000 === 0) log(`  worker ${i}: ${done} (${((Date.now() - t0) / done).toFixed(1)} ms each)`);
	}
	fs.closeSync(fd);
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
		const cells = path.join(tmp, `cells-${k}.json`);
		execFileSync(path.join(ORACLE, "eu_develop"), [
			"--kmin",
			`${k}`,
			"--kmax",
			`${k}`,
			"--pruned",
			PRUNED,
			"--out",
			cells,
		]);
		await Promise.all(
			Array.from({ length: jobs }, (_, i) =>
				run(["--worker", cells, `${i}`, `${jobs}`, path.join(tmp, `out-${k}-${i}`), sigFile]),
			),
		);
		const engine = Array.from({ length: jobs }, (_, i) =>
			fs
				.readFileSync(path.join(tmp, `out-${k}-${i}`), "utf8")
				.split("\n")
				.filter(Boolean)
				.map((l) => JSON.parse(l) as Rec),
		).flat();
		fs.rmSync(cells);
		log(`k = ${k}: ${engine.length} engine tilings in ${((Date.now() - t0) / 60000).toFixed(1)} min`);

		if (check) {
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

		const matched = new Set<string>();
		const kept = engine.filter((r) => {
			const other = r.key ? keyOf.get(r.key as string) : undefined;
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
		const all = [...kept, ...others].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		const files = Math.ceil(all.length / PART_SIZE);
		for (const f of shardFiles(k)) fs.renameSync(f, path.join(tmp, path.basename(f)));
		for (let p = 0; p < files; p++) {
			const slice = all.slice(p * PART_SIZE, (p + 1) * PART_SIZE);
			const name = files === 1 ? `reference-atlas-k${k}.json.br` : `reference-atlas-k${k}-p${p}.json.br`;
			writeDataFile(path.join(ROOT, "public", name), stringifyAtlas(slice) + "\n");
		}
		if (files > 1) parts[k] = Array.from({ length: files }, (_, p) => all[p * PART_SIZE].id);
		const mb = shardFiles(k).reduce((s, f) => s + fs.statSync(f).size, 0) / 1e6;
		log(
			`  k = ${k}: ${all.length} tilings (${others.length} kept under their own ids), ${files} file(s), ${mb.toFixed(1)} MB; old files moved to ${tmp}`,
		);
	}
	if (Object.keys(parts).length) log(`REGULAR_SHARD_PARTS: ${JSON.stringify(parts)}`);
	log("done");
}

if (process.argv[2] === "--worker") void worker(process.argv.slice(3));
else
	void main().catch((e) => {
		log(`FAILED: ${e instanceof Error ? e.stack : e}`);
		process.exit(1);
	});
