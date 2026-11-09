/* Enrich public/reference-atlas.json.br IN PLACE with the vertex-type classification and exact wallpaper
 * symmetry. SURGICAL: only ADDS four fields to each existing entry — never reorders, drops, or
 * re-derives the geometry pipeline. It reconstructs each regular cell from the `exactSource` the entry
 * already carries, so it cannot regress the atlas the multi-phase build produced.
 *
 * Added fields (see lib/services/referenceAtlas.ts):
 *   m: number        — distinct vertex-configuration count (m ≤ k; m = 1 at k=1). m === k is Krötenheerdt.
 *   partition: n[]   — multiplicities of the distinct configs, descending, summing to k (the "511" group).
 *   wallpaperGroup   — exact group (analyzeSymmetry), REGULAR tilings only (star tiles are non-convex;
 *   latticeShape     — NOTES §9.4 — so stars get neither field, by design, and are logged as skipped).
 *
 * Per source:
 *   galebach   — assignOrbits(cell) → per-orbit vertex figures → m/partition; analyzeSymmetry → group.
 *   ctrnact    — m/partition from ctrnact.json vertexConfigs; VALIDATED against its distinctTypePartition
 *                (mismatch = loud failure); analyzeSymmetry → group.
 *   ctrnact-star / myers — m/partition from the star cell files' per-orbit `orbits[]` (k=1 ⇒ m=1);
 *                no group/lattice.
 *
 * Every source also yields `vcs`: the distinct vertex configurations, canonical (lib/services/vertexConfig),
 * in the order of `partition` — vcs[i] occurs partition[i] times. The /library configuration filter
 * reads it. `--vcs-only` adds just that field: no symmetry pass, and m/partition are recomputed only to
 * check them against what the file already carries (a mismatch fails the run and writes nothing).
 *
 * Every unclassified tiling is logged with a count (a characterization gap is a finding, never silent).
 *
 * `--orbits` adds only `edgeOrbits` and `faceOrbits`: the edge and tile orbits under the full symmetry group
 * (KUniformityChecker.edgeFaceOrbits, exact, with its Euler checks), for every entry with an exactSource,
 * stars included. A tiling whose vertex orbits do not come out as its k, or whose checks fail, gets neither
 * field and is listed. It is about half a second a tiling, so each file is split over `--jobs` processes.
 *
 *   pnpm tsx scripts/enrich-reference-atlas.ts [--vcs-only | --orbits [--jobs N]] [files...]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { exactCellOf } from "@/lib/services/orbitsFromExactSource";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import { ringOrderOf } from "@/lib/services/starExactCell";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { CyclotomicRing, setActiveRing, type Cyclotomic } from "@/classes/Cyclotomic";
import { reconstructOracleCell } from "./oracle-match";
import { serializeCell, deserializeCell } from "@/classes/algorithm/cellCodec";
import { assignOrbits } from "../figures/tiling/orbits";
import { seedFromPeriodCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";
import type { LatticeShape, WallpaperGroup } from "@/lib/classes/symmetry/types";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { readDataJson, writeDataFile } from "./atlas/io.mjs";
import { stringifyAtlas } from "./atlas/encode.mjs";
import { canonicalVC, classifyVCs, parseVC } from "@/lib/services/vertexConfig";

const ATLAS_PATH = path.join(process.cwd(), "public", "reference-atlas.json.br");
const CTRNACT_PATH = path.join(process.cwd(), "figures", "data", "ctrnact.json");
const STAR_DIR = path.join(process.cwd(), "experiments", "star-oracle");
const ORBITS = process.argv.includes("--orbits");
const WORKER = process.argv.indexOf("--orbits-worker"); // --orbits-worker <file> <i> <n> <out.json>
const LOG_PATH = path.join(
	process.cwd(),
	"experiments",
	"results",
	ORBITS || WORKER >= 0
		? "reference-atlas-orbits-2026-11-06.log"
		: process.argv.includes("--vcs-only")
			? "reference-atlas-vcs-2026-10-23.log"
			: "reference-atlas-enrich-2026-07-11.log",
);

const localRing = CyclotomicRing.create(24);
setActiveRing(localRing);

// ── logging (synchronous file + stderr, per the experiments logging rule) ──
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
// Every run appends under a dated header (the --orbits workers append too), so a later run on other files
// keeps the earlier lines.
if (WORKER < 0)
	fs.appendFileSync(LOG_PATH, `\n# ${new Date().toLocaleString("sv")} ${process.argv.slice(2).join(" ")}\n`);
const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
function log(msg = ""): void {
	logStream.write(msg + "\n");
	console.error(msg);
}

type ExactSource =
	| { kind: "seed"; T1: number[]; T2: number[]; Seed: number[][] }
	| { kind: "cell"; cell: unknown }
	| { kind: "startiles"; exact: unknown };
interface AtlasEntry {
	id: string;
	source: "galebach" | "ctrnact" | "ctrnact-star" | "myers" | "tilesearch";
	k: number;
	family: string;
	exactSource?: ExactSource;
	m?: number;
	partition?: number[];
	wallpaperGroup?: WallpaperGroup;
	latticeShape?: LatticeShape;
	edgeOrbits?: number;
	faceOrbits?: number;
	[k: string]: unknown;
}

const VCS_ONLY = process.argv.includes("--vcs-only");

// ctrnact's own notation for the gate: "M" when M === k (all singletons), else "M (parts)".
function ctrnactKey(m: number, partition: number[], k: number): string {
	return m === k ? String(m) : `${m} (${partition.join("")})`;
}

// Reconstruct the exact PeriodCell an entry stores, or null with a reason.
function reconstructCell(e: AtlasEntry): { cell: PeriodCell } | { error: string } {
	const src = e.exactSource;
	if (!src) return { error: "no exactSource" };
	if (src.kind === "seed") return reconstructOracleCell(e.id, { T1: src.T1, T2: src.T2, Seed: src.Seed });
	// Star tilings gained an exactSource in 2026-08-07 (kind 'startiles') so the /play overlays can run.
	// This enrichment stays regular-only on purpose: its m/partition path goes through assignOrbits and
	// vertex-figure naming, which assume convex tiles. Skipping keeps behaviour identical to when stars
	// had no exactSource at all. Extending it would give stars wallpaperGroup/latticeShape in the atlas
	// (the library's group and lattice filters would then cover them) — worth doing, separately.
	if (src.kind === "startiles") return { error: "star exactSource: enrichment is regular-only" };
	try {
		return { cell: deserializeCell(localRing, src.cell as never) };
	} catch (err) {
		return { error: `deserializeCell failed: ${err instanceof Error ? err.message : err}` };
	}
}

// ── source-data indexes (loaded once, shared across every target file) ──
if (!ORBITS && WORKER < 0) log("=== load source data ===");

const ctrnactById = new Map<string, { vertexConfigs: number[][]; distinctTypePartition: string }>();
if (!ORBITS && WORKER < 0) {
	const src = JSON.parse(fs.readFileSync(CTRNACT_PATH, "utf8")).tilings as {
		id: string;
		vertexConfigs: number[][];
		distinctTypePartition: string;
	}[];
	for (const r of src)
		ctrnactById.set(r.id, { vertexConfigs: r.vertexConfigs, distinctTypePartition: r.distinctTypePartition });
	log(`ctrnact.json: ${ctrnactById.size} records indexed`);
}

// id → per-orbit config strings (star cells). Strip the trailing symmetry flag so config identity
// matches the regular convention (flag R4/F/A distinguishes symmetry ROLE, not the vertex type).
const starOrbitsById = new Map<string, string[]>();
if (!ORBITS && WORKER < 0) {
	let files = 0;
	for (const f of fs.readdirSync(STAR_DIR).filter((f) => f.endsWith(".cells.json"))) {
		let data: unknown;
		try {
			data = JSON.parse(fs.readFileSync(path.join(STAR_DIR, f), "utf8"));
		} catch {
			continue;
		}
		const arr: unknown[] = Array.isArray(data)
			? data
			: (((data as Record<string, unknown>).tilings as unknown[]) ??
				((data as Record<string, unknown>).cells as unknown[]) ??
				(Object.values(data as Record<string, unknown>).find(Array.isArray) as unknown[]) ??
				[]);
		for (const rec of arr as { id?: string; orbits?: string[] }[]) {
			if (rec.id && Array.isArray(rec.orbits) && rec.orbits.length && !starOrbitsById.has(rec.id)) {
				starOrbitsById.set(
					rec.id,
					rec.orbits.map((s) => s.slice(0, s.lastIndexOf(")") + 1 || undefined)),
				);
			}
		}
		files++;
	}
	log(`star cell files: ${files} read, ${starOrbitsById.size} ids with per-orbit configs`);
}

// ── per-file enrichment ── enrich one atlas file in place (base atlas, or a higher-k shard). All the
// source indexes above are shared, so calling this for several files loads ctrnact.json/star cells once.
function enrichFile(atlasPath: string): void {
	const atlas = decodeAtlas<AtlasEntry>(readDataJson(atlasPath));
	log(`\n=== classify ${path.relative(process.cwd(), atlasPath)} (${atlas.length} entries) ===`);
	const t0 = Date.now();
	const stat = {
		mOk: 0,
		mSkip: 0,
		symOk: 0,
		symSkip: 0,
		gateMismatch: [] as { id: string; src: string; computed: string }[],
		symFail: [] as { id: string; error: string }[],
		mFail: [] as { id: string; reason: string }[],
	};
	const groupHist: Record<string, number> = {};
	// The regular shelf's sources. Čtrnáct's orbits come from ctrnact.json, the others' (Galebach's list and
	// the Tiling Searcher's targeted runs) from the cell's geometry.
	const regular = (e: AtlasEntry) => e.source === "galebach" || e.source === "ctrnact" || e.source === "tilesearch";
	const regularCount = atlas.filter(regular).length;
	let regularDone = 0;

	for (const e of atlas) {
		const isRegular = regular(e);

		// --- reconstruct once (regular only: needed for symmetry, and for galebach orbits) ---
		let cell: PeriodCell | null = null;
		// --vcs-only needs a cell only where the orbits come from geometry; ctrnact's come from
		// ctrnact.json, and reconstructing its k = 8..10 cells for nothing would cost hours.
		if (isRegular && (!VCS_ONLY || e.source !== "ctrnact")) {
			const rec = reconstructCell(e);
			if ("cell" in rec) cell = rec.cell;
			else stat.symFail.push({ id: e.id, error: `reconstruct: ${rec.error}` });
		}
		const cellRing = cell ? (cell.basisExact[0] as unknown as { ring: CyclotomicRing }).ring : null;

		// --- m / partition ---
		let classified: { m: number; partition: number[]; vcs: string[] } | null = null;
		if (e.source === "ctrnact") {
			const src = ctrnactById.get(e.id);
			if (src) {
				classified = classifyVCs(src.vertexConfigs.map((cfg) => canonicalVC(cfg.map(String))));
				const computed = ctrnactKey(classified.m, classified.partition, e.k);
				if (computed !== src.distinctTypePartition)
					stat.gateMismatch.push({ id: e.id, src: src.distinctTypePartition, computed });
			} else stat.mFail.push({ id: e.id, reason: "not in ctrnact.json" });
		} else if (isRegular) {
			if (cell && cellRing) {
				try {
					setActiveRing(cellRing);
					const orb = assignOrbits(serializeCell(cell));
					classified = classifyVCs(orb.vcOfOrbit.map((vc) => canonicalVC(vc.split(","))));
				} catch (err) {
					stat.mFail.push({ id: e.id, reason: `assignOrbits: ${err instanceof Error ? err.message : err}` });
				}
			} else stat.mFail.push({ id: e.id, reason: "no cell" });
		} else {
			// star: per-orbit orbits[] if we have it; k=1 is trivially m=1
			const orbits = starOrbitsById.get(e.id);
			const parsed = orbits?.map(parseVC);
			if (parsed?.every((p): p is string => p !== null)) classified = classifyVCs(parsed);
			else if (orbits) stat.mFail.push({ id: e.id, reason: `unparsed star orbit ${orbits.join(" ")}` });
			else if (e.k === 1) {
				// One orbit, no per-orbit file: the family string IS the one figure when it parses as one.
				const one = parseVC(e.family);
				classified = { m: 1, partition: [1], vcs: one ? [one] : [] };
			} else stat.mFail.push({ id: e.id, reason: "no star orbits + k>1" });
		}
		if (classified && VCS_ONLY) {
			// Gate: the configurations must reproduce the shipped classification exactly.
			const same = e.m === classified.m && JSON.stringify(e.partition) === JSON.stringify(classified.partition);
			if (!same)
				stat.mFail.push({
					id: e.id,
					reason: `vcs gate: shipped m=${e.m} ${e.partition} vs ${classified.m} ${classified.partition}`,
				});
		}
		if (classified) {
			if (!VCS_ONLY) {
				e.m = classified.m;
				e.partition = classified.partition;
			}
			if (classified.vcs.length) e.vcs = classified.vcs;
			else delete e.vcs;
			stat.mOk++;
		} else {
			if (!VCS_ONLY) {
				delete e.m;
				delete e.partition;
			}
			delete e.vcs;
			stat.mSkip++;
		}

		// --- wallpaper group / lattice (regular only) ---
		if (isRegular && cell && cellRing && !VCS_ONLY) {
			try {
				setActiveRing(cellRing);
				const { T1, T2, seed } = seedFromPeriodCell(cell);
				const sym = analyzeSymmetry(cellRing, T1, T2, seed as Cyclotomic[]);
				e.wallpaperGroup = sym.group;
				e.latticeShape = sym.latticeShape;
				groupHist[sym.group] = (groupHist[sym.group] ?? 0) + 1;
				stat.symOk++;
			} catch (err) {
				stat.symFail.push({ id: e.id, error: `analyzeSymmetry: ${err instanceof Error ? err.message : err}` });
				delete e.wallpaperGroup;
				delete e.latticeShape;
			}
		} else if (isRegular) {
			stat.symSkip++;
		}

		if (isRegular) {
			regularDone++;
			if (regularDone % 100 === 0) {
				const elapsed = (Date.now() - t0) / 1000;
				const eta = (elapsed / regularDone) * (regularCount - regularDone);
				log(
					`  [${regularDone}/${regularCount}] regular classified — ${elapsed.toFixed(0)}s elapsed, ETA ${eta.toFixed(0)}s`,
				);
			}
		}
	}

	// ── write back (same entries, same order, + new fields), packed like every shipped shelf ──
	if (VCS_ONLY && stat.mFail.some((f) => f.reason.startsWith("vcs gate"))) {
		log(`\n⚑ vcs gate failed: NOT writing ${path.relative(process.cwd(), atlasPath)}`);
		process.exitCode = 1;
	} else writeDataFile(atlasPath, stringifyAtlas(atlas));

	// ── report ──
	log("\n--- summary ---");
	log(`m/partition:  ${stat.mOk} classified, ${stat.mSkip} unclassified`);
	log(`wallpaper:    ${stat.symOk} classified, ${stat.symSkip} skipped (stars, by design)`);
	const mByK: Record<number, Record<number, number>> = {};
	for (const e of atlas) if (e.m != null) (mByK[e.k] ??= {})[e.m] = (mByK[e.k][e.m] ?? 0) + 1;
	log("\nM distribution by k (k: {M: count}):");
	for (const k of Object.keys(mByK)
		.map(Number)
		.sort((a, b) => a - b))
		log(`  k=${k}: ${JSON.stringify(mByK[k])}`);
	log("\nwallpaper-group histogram:");
	for (const g of Object.keys(groupHist).sort()) log(`  ${g.padEnd(5)} ${groupHist[g]}`);

	if (stat.gateMismatch.length) {
		log(
			`\n⚑ CTRNACT PARTITION GATE: ${stat.gateMismatch.length} MISMATCH(es) — computed ≠ source distinctTypePartition:`,
		);
		for (const g of stat.gateMismatch.slice(0, 40)) log(`    ${g.id}: computed "${g.computed}" vs source "${g.src}"`);
		process.exitCode = 1;
	} else {
		log(
			`\n✓ ctrnact partition gate: all ${atlas.filter((e) => e.source === "ctrnact").length} entries agree with distinctTypePartition`,
		);
	}
	if (stat.mFail.length) {
		log(`\n⚑ ${stat.mFail.length} tiling(s) with NO m/partition (characterization gap):`);
		for (const f of stat.mFail.slice(0, 40)) log(`    ${f.id}: ${f.reason}`);
	}
	if (stat.symFail.length) {
		log(`\n⚑ ${stat.symFail.length} REGULAR tiling(s) failed symmetry classification:`);
		for (const f of stat.symFail.slice(0, 40)) log(`    ${f.id}: ${f.error}`);
	}
	log(`\n★ wrote ${path.relative(process.cwd(), atlasPath)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// Default: enrich the base atlas. With file args: enrich exactly those (e.g. the k=8..10 shards),
// leaving the base atlas untouched. Relative paths resolve from cwd; a `.json` name means its `.json.br`.
// ── --orbits: edge and tile orbits ──

/** [edge orbits, tile orbits], or why there are none. */
function orbitCounts(e: AtlasEntry): [number, number] | string {
	const ring = CyclotomicRing.create(ringOrderOf(e as never));
	setActiveRing(ring);
	const cell = exactCellOf(ring, e.id, e.exactSource as ExactCellSource);
	if (!cell) return "no cell";
	const checker = new KUniformityChecker();
	const [u, v] = cell.basisExact;
	const vertices = checker.vertexOrbits(cell.cellPolygons, u, v);
	if (!vertices) return "no symmetry";
	if (vertices.orbits !== e.k) return `${vertices.orbits} vertex orbits, k = ${e.k}`;
	const ef = checker.edgeFaceOrbits(cell.cellPolygons, u, v, vertices);
	if (!ef) return "not edge-to-edge, or an exact check failed";
	return [ef.edges.count, ef.faces.count];
}

/** One worker's share of a file: entries i, i + n, … of those with an exactSource. */
function orbitWorker(file: string, i: number, n: number, out: string): void {
	const mine = decodeAtlas<AtlasEntry>(readDataJson(file))
		.filter((e) => e.exactSource)
		.filter((_, j) => j % n === i);
	const result: Record<string, [number, number] | string> = {};
	const t0 = Date.now();
	mine.forEach((e, j) => {
		try {
			result[e.id] = orbitCounts(e);
		} catch (err) {
			result[e.id] = `threw: ${err instanceof Error ? err.message : err}`;
		}
		if ((j + 1) % 250 === 0 || j + 1 === mine.length) {
			const s = (Date.now() - t0) / 1000;
			log(
				`  ${path.basename(file)} worker ${i + 1}/${n}: ${j + 1}/${mine.length}, ${s.toFixed(0)} s, ~${(((s / (j + 1)) * (mine.length - j - 1)) / 60).toFixed(1)} min left`,
			);
		}
	});
	fs.writeFileSync(out, JSON.stringify(result));
}

async function orbitFile(file: string, jobs: number): Promise<void> {
	const t0 = Date.now();
	log(`\n=== edge and tile orbits: ${path.relative(process.cwd(), file)}, ${jobs} processes ===`);
	const outs = Array.from({ length: jobs }, (_, i) => path.join(os.tmpdir(), `orbits-${process.pid}-${i}.json`));
	await Promise.all(
		outs.map(
			(out, i) =>
				new Promise<void>((resolve, reject) =>
					spawn(
						process.execPath,
						[...process.execArgv, process.argv[1], "--orbits-worker", file, String(i), String(jobs), out],
						{
							stdio: ["ignore", "ignore", "inherit"],
						},
					).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}`)))),
				),
		),
	);
	const counts: Record<string, [number, number] | string> = Object.assign(
		{},
		...outs.map((o) => JSON.parse(fs.readFileSync(o, "utf8"))),
	);
	for (const o of outs) fs.rmSync(o);
	const atlas = decodeAtlas<AtlasEntry>(readDataJson(file));
	const gaps: string[] = [];
	const byK: Record<number, Record<string, number>> = {};
	for (const e of atlas) {
		const c = counts[e.id];
		if (Array.isArray(c)) {
			e.edgeOrbits = c[0];
			e.faceOrbits = c[1];
			const row = (byK[e.k] ??= {});
			row[`e${c[0]}`] = (row[`e${c[0]}`] ?? 0) + 1;
		} else {
			delete e.edgeOrbits;
			delete e.faceOrbits;
			gaps.push(`${e.id}: ${c ?? "no exactSource"}`);
		}
	}
	writeDataFile(file, stringifyAtlas(atlas));
	log(`edge orbits by k (k: {e: count}):`);
	for (const k of Object.keys(byK)
		.map(Number)
		.sort((a, b) => a - b))
		log(`  k=${k}: ${JSON.stringify(byK[k])}`);
	if (gaps.length) {
		log(`⚑ ${gaps.length} entr${gaps.length === 1 ? "y" : "ies"} without edge/tile orbits:`);
		for (const g of gaps.slice(0, 60)) log(`    ${g}`);
	}
	log(`★ wrote ${path.relative(process.cwd(), file)} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// Default: enrich the base atlas. With file args: enrich exactly those (e.g. the k=8..10 shards),
// leaving the base atlas untouched. Relative paths resolve from cwd; a `.json` name means its `.json.br`.
if (WORKER >= 0) {
	const [file, i, n, out] = process.argv.slice(WORKER + 1, WORKER + 5);
	orbitWorker(file, Number(i), Number(n), out);
	logStream.end();
} else {
	const jobsAt = process.argv.indexOf("--jobs");
	const jobs = jobsAt >= 0 ? Number(process.argv[jobsAt + 1]) : Math.max(1, os.cpus().length - 2);
	const targets = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--jobs");
	const files = (targets.length ? targets : [ATLAS_PATH]).map((f) =>
		(path.isAbsolute(f) ? f : path.join(process.cwd(), f)).replace(/\.json$/, ".json.br"),
	);
	(async () => {
		for (const f of files) {
			if (ORBITS) await orbitFile(f, jobs);
			else enrichFile(f);
		}
		logStream.end();
	})().catch((err) => {
		log(`⚑ ${err instanceof Error ? err.message : err}`);
		process.exitCode = 1;
		logStream.end();
	});
}
