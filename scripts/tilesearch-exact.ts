/**
 * A Tiling Searcher run of regular polygons onto the regular shelf above k = 10, with exact cells.
 *
 * The Searcher develops a certificate into a float cell. Every edge of a regular-polygon tiling is a unit step
 * in one of 24 directions, so walking the edges from one vertex gives every vertex exactly in ℤ[ζ₂₄], and the
 * cell's exact polygons and periods with them. Each cell is checked before it is written: the exact polygons
 * reproduce the float ones, and the vertex orbits under the full symmetry group come out as the run's k.
 *
 *   pnpm tsx scripts/tilesearch-exact.ts <board> <run folder> [<id>=<solver file>:<index> ...] [--all] [--jobs N]
 *
 * The named tilings, or with --all every tiling of the run above REGULAR_COMPLETE_K, go into public/reference-atlas-k<k>.json.br (created if
 * absent; an entry already there is kept as it is); below it the shelf is complete already. A named one is a tiling
 * Galebach published first (his edge-homogeneous list) and keeps the id given; the rest are the engine's, id
 * ts-<solver file>-<index>. A tiling that fails a check is logged and not written. Progress goes to
 * experiments/results/tilesearch-exact.log. Then run scripts/enrich-reference-atlas.ts on the shards written,
 * plain and with --orbits, for vcs, m, wallpaper group and edge and tile orbits.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { serializeCell } from "@/classes/algorithm/cellCodec";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { REGULAR_COMPLETE_K } from "@/lib/services/referenceAtlas";
import { parse } from "@/tools/searcher/app/src/board";
import {
	certificatesIn,
	decode,
	flatCell,
	geometry,
	parseCertificate,
	vertexWords,
} from "@/tools/searcher/app/src/develop";
import { readDataJson, writeDataFile } from "./atlas/io.mjs";
import { stringifyAtlas } from "./atlas/encode.mjs";
import { exactWalk, key } from "./atlas/exactWalk";

setActiveRing(CyclotomicRing.create(24));

/** The exact cell of a float cell of unit-edge regular polygons, or why there is none. */
export function exactCell(polys: number[][][], basis: number[][]): PeriodCell {
	const { base, at, dirOf, period } = exactWalk(polys, basis);
	const cellPolygons = base.map((pts) => {
		const p = RegularPolygon.fromAnchorAndDirExact(pts.length, at(pts[0]), dirOf(pts[0], pts[1]));
		p.exactVertices!.forEach((z, t) => {
			if (key(z.toVector()) !== key({ x: pts[t].x - base[0][0].x, y: pts[t].y - base[0][0].y }))
				throw new Error("exact polygon off its float one");
		});
		return p;
	});
	return { cellPolygons, basisExact: period } as unknown as PeriodCell;
}

// ── CLI ──

type Rec = Record<string, unknown> & { id: string; k: number };
const LOG = path.join(process.cwd(), "experiments", "results", "tilesearch-exact.log");
const log = (m: string) => {
	const line = `${new Date().toTimeString().slice(0, 8)}  ${m}`;
	fs.appendFileSync(LOG, line + "\n");
	console.error(line);
};
const flag = (name: string) => process.argv.indexOf(name);
const WORKER = flag("--worker"); // --worker <i> <n>
// the positional arguments: everything before --worker, less --jobs and its value
const args = process.argv
	.slice(2, WORKER >= 0 ? WORKER : undefined)
	.filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--jobs");
const [boardFile, runDir, ...picks] = args;
if (!boardFile || !runDir)
	throw new Error(
		"usage: tilesearch-exact.ts <board> <run folder> [<id>=<solver file>:<index> ...] [--all] [--jobs N]",
	);
const board = parse(fs.readFileSync(boardFile, "utf8")).board;
const named = new Map(
	picks.map((p) => {
		const [id, where] = p.split("=");
		return [`${path.basename(where.slice(0, where.lastIndexOf(":")))}:${where.slice(where.lastIndexOf(":") + 1)}`, id];
	}),
);
const RUN_DATE = fs.statSync(runDir).birthtime.toISOString().slice(0, 10);
// every certificate of the run, in a fixed order: solver file by name, then position in the file
const files = fs
	.readdirSync(runDir)
	.filter((f) => /solver_.*\.txt$/.test(f))
	.sort();
const certs = files.flatMap((f) =>
	certificatesIn(fs.readFileSync(path.join(runDir, f), "utf8")).map((cert, index) => ({ f, index, cert })),
);

const ALL = flag("--all") >= 0;
const wanted = (c: (typeof certs)[number]) =>
	ALL ? parseCertificate(c.cert).k > REGULAR_COMPLETE_K : named.has(`${c.f}:${c.index}`);

function record({ f, index, cert }: (typeof certs)[number]): Rec {
	const k = parseCertificate(cert).k;
	const g = geometry(board, vertexWords(cert));
	if (g.kind !== "plane") throw new Error("not a plane tiling");
	const c = flatCell(decode(cert, board), board, g.turn);
	const cell = exactCell(
		(c.p ?? []).map((p) => p.v as number[][]),
		c.b as number[][],
	);
	const [uE, vE] = cell.basisExact;
	const orbits = new KUniformityChecker().vertexOrbits(cell.cellPolygons, uE, vE)?.orbits;
	if (orbits !== k) throw new Error(`${orbits} vertex orbits, the run says k = ${k}`);
	const name = named.get(`${f}:${index}`);
	return {
		id: name ?? `ts-${f.replace(/\.txt$/, "")}-${index}`,
		source: name ? "galebach" : "tilesearch",
		k,
		family: [...new Set(cell.cellPolygons.map((p) => p.n))].sort((a, b) => a - b).join("."),
		discoverer: name ? "Brian Galebach" : `Čtrnáct engine (Tiling Searcher), ${RUN_DATE}`,
		certification: name ? "reproduced" : "candidate",
		exactSource: { kind: "cell", cell: serializeCell(cell) },
		tilesearch: { board: path.basename(boardFile), file: f, index },
	};
}

// Each worker appends every tiling it finishes to its own JSONL under DONE, so a stopped run resumes where it was
// (a run of ~60,000 tilings takes hours, and the first one lost three of them to a session that ended).
const DONE = path.join(process.cwd(), "experiments", "results", "tilesearch-exact", path.basename(boardFile, ".board"));
type Line = { key: string; rec?: Rec; failed?: string };
const doneLines = (): Line[] =>
	fs.existsSync(DONE)
		? fs
				.readdirSync(DONE)
				.filter((f) => f.endsWith(".jsonl"))
				.flatMap((f) =>
					fs
						.readFileSync(path.join(DONE, f), "utf8")
						.split("\n")
						.filter(Boolean)
						.map((l) => JSON.parse(l) as Line),
				)
		: [];

if (WORKER >= 0) {
	const [i, n] = process.argv.slice(WORKER + 1, WORKER + 3);
	const skip = new Set(doneLines().map((l) => l.key));
	const mine = certs.filter((c, j) => j % Number(n) === Number(i) && wanted(c) && !skip.has(`${c.f}:${c.index}`));
	const out = path.join(DONE, `w${i}.jsonl`);
	const t0 = Date.now();
	mine.forEach((c, j) => {
		const key = `${c.f}:${c.index}`;
		let line: Line;
		try {
			line = { key, rec: record(c) };
		} catch (err) {
			line = { key, failed: `${key}: ${err instanceof Error ? err.message : err}` };
		}
		fs.appendFileSync(out, JSON.stringify(line) + "\n");
		if ((j + 1) % 25 === 0 || j + 1 === mine.length) {
			const s = (Date.now() - t0) / 1000;
			log(
				`  worker ${Number(i) + 1}/${n}: ${j + 1}/${mine.length}, ${s.toFixed(0)} s, ~${(((s / (j + 1)) * (mine.length - j - 1)) / 60).toFixed(1)} min left`,
			);
		}
	});
} else {
	const jobs = flag("--jobs") >= 0 ? Number(process.argv[flag("--jobs") + 1]) : Math.max(1, os.cpus().length - 2);
	const above = certs.filter(wanted).length;
	fs.mkdirSync(DONE, { recursive: true });
	log(
		`=== ${path.basename(runDir)}: ${certs.length} tilings, ${above} to write (${ALL ? `every one above k = ${REGULAR_COMPLETE_K}` : "the named ones"}), ${doneLines().length} done before, ${jobs} processes ===`,
	);
	(async () => {
		await Promise.all(
			Array.from(
				{ length: jobs },
				(_, i) =>
					new Promise<void>((resolve, reject) =>
						spawn(
							process.execPath,
							[
								...process.execArgv,
								process.argv[1],
								...args,
								...(ALL ? ["--all"] : []),
								"--worker",
								String(i),
								String(jobs),
							],
							{ stdio: ["ignore", "ignore", "inherit"] },
						).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}`)))),
					),
			),
		);
		const byKey = new Map(certs.map((c) => [`${c.f}:${c.index}`, c]));
		const lines = doneLines().filter((l) => byKey.has(l.key) && wanted(byKey.get(l.key)!));
		const failed = lines.flatMap((l) => (l.failed ? [l.failed] : []));
		for (const f of failed) log(`  ⚑ not written, ${f}`);
		const byShard = new Map<number, Rec[]>();
		for (const { rec: r } of lines) if (r) (byShard.get(r.k) ?? byShard.set(r.k, []).get(r.k)!).push(r);
		for (const [k, recs] of [...byShard].sort((a, b) => a[0] - b[0])) {
			const file = path.join(process.cwd(), "public", `reference-atlas-k${k}.json.br`);
			const have = fs.existsSync(file) ? decodeAtlas<{ id: string }>(readDataJson(file)) : [];
			// A record already in the shard stays as it is: it may carry the enrichment (m, orbits, wallpaper
			// group) that a fresh one would lose.
			const haveIds = new Set(have.map((r) => r.id));
			const fresh = recs.filter((r) => !haveIds.has(r.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
			if (fresh.length) writeDataFile(file, stringifyAtlas([...have, ...fresh]));
			log(`  ${path.relative(process.cwd(), file)}: ${have.length} kept, ${fresh.length} added`);
		}
		log(`★ ${byShard.size} shards, ${lines.length - failed.length} tilings written, ${failed.length} not`);
	})().catch((err) => {
		log(`⚑ ${err instanceof Error ? err.message : err}`);
		process.exitCode = 1;
	});
}
