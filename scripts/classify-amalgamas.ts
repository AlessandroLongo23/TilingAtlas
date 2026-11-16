/**
 * The amalgamas classification's member list (lib/classifications.ts): tilings that hold every vertex type of their
 * palette, from complete Tiling Searcher runs (each run's board requires every vertex line, and its census ends in
 * MAX, so the list is every amalgama to the run's k). The members are on no shelf (the regular shelf ends at k = 23,
 * the isotoxal one at 4), so the list carries their records, as the face-homogeneous list does above k = 16: the
 * Searcher's own float cells (tools/searcher/app/src/develop.ts), each checked to develop in the plane and to hold
 * every line of its board, with its wallpaper group. Ids are am-<palette>-<k>-<n>, n counting within the palette.
 *
 *   pnpm tsx scripts/classify-amalgamas.ts <palette>=<run folder> ...
 *
 * As built on 2026-11-16 (DEVELOPMENT_NOTES "The amalgamas in the Atlas"), the run folders in AL's Searcher output:
 * regular=…/regulars/amalgama-20261111-141726, a12p60=…/stars/amalgama/12/A12p60_(17)-20261111-161621,
 * a6p30=…/stars/amalgama/6/A6p30_(17)-20261116-112023, a12p90=…/stars/amalgama/12/A12p90_(21)-20261116-123150.
 * When the regular shelf takes k >= 24, its records of these tilings replace the list's (match them, as
 * scripts/classify-face-homogeneous.ts does), so no tiling appears twice.
 */
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { canonicalVC } from "@/lib/services/vertexConfig";
import { vertexTypePoints } from "@/lib/tilings/vertexTypes";
import { parse } from "@/tools/searcher/app/src/board";
import {
	certificatesIn,
	decode,
	flatCellWithOverlays,
	geometry,
	vertexWords,
	withSymbols,
} from "@/tools/searcher/app/src/develop";
import { writeClassification } from "./atlas/symbols";

const OUT = path.join(process.cwd(), "public", "classifications", "amalgamas.json.br");
const runs = process.argv.slice(2).map((a) => a.split("=") as [string, string]);
if (!runs.length || runs.some(([p, d]) => !p || !d))
	throw new Error("usage: classify-amalgamas.ts <palette>=<run folder> ...");

const key = (w: string[]) =>
	[w, [...w].reverse()].flatMap((x) => x.map((_, i) => [...x.slice(i), ...x.slice(0, i)].join("."))).sort()[0];
const read = (f: string) =>
	f.endsWith(".gz") ? gunzipSync(fs.readFileSync(f)).toString("utf8") : fs.readFileSync(f, "utf8");

/** A board symbol as a canonical token: A<n> the regular n-gon's corner "n", A<n>p<a> and A<n>d<a> a star's point and dent. */
const token = (c: string) => c.replace(/^A(\d+)$/, "$1").replace(/^A(\d+)([pd])(\d+)$/, "$1*$2$3");
const vcOf = (w: string[]) => canonicalVC(w.map(token));

const members: { id: string; k: number; part: string }[] = [];
const records: Record<string, unknown>[] = [];
for (const [palette, dir] of runs) {
	const board = parse(fs.readFileSync(path.join(dir, "input.board"), "utf8")).board;
	const solver = path.join(dir, `solver_${board.name}`);
	if (!/MAX\s*$/.test(fs.readFileSync(path.join(solver, "census.txt"), "utf8")))
		throw new Error(`${dir}: the run did not finish`);
	const symbols = Object.fromEntries(
		read(path.join(solver, "symbols.txt"))
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((l) => l.split(" ")),
	);
	const lines = new Set(board.vertices.map((v) => key(v.word)));
	const started = fs.statSync(dir).birthtime.toISOString().slice(0, 10);
	let n = 0;
	for (const f of fs
		.readdirSync(solver)
		.filter((f) => /solver_\d+_.*\.txt(\.gz)?$/.test(f))
		.sort())
		for (const cert of certificatesIn(read(path.join(solver, f))).map((c) => withSymbols(c, symbols))) {
			const k = Number(/solver_(\d+)_/.exec(f)![1]);
			const words = vertexWords(cert);
			const held = new Set(words.map(key));
			if ([...lines].some((l) => !held.has(l))) throw new Error(`${f}: misses a vertex line of ${board.name}`);
			const g = geometry(board, words);
			if (g.kind !== "plane") throw new Error(`${f}: does not develop in the plane`);
			const out = flatCellWithOverlays(decode(cert, board), board, g.turn);
			const group = out.symmetry?.()?.group;
			if (!group) throw new Error(`${f}: no wallpaper group`);
			const polys = (out.cell.p ?? []) as { v: number[][]; n: number; star?: boolean }[];
			const labels = [...new Set(polys.map((p) => (p.star ? `${p.n}*` : String(p.n))))];
			const id = `am-${palette}-${k}-${++n}`;
			// every vertex type with its orbits here, most first, in the shelf's canonical form: the vcs filter
			// and the orbit row read them, and the tiling view lists and lights them (lib/tilings/vertexTypes.ts)
			const orbits = new Map<string, number>();
			for (const w of words) orbits.set(vcOf(w), (orbits.get(vcOf(w)) ?? 0) + 1);
			const types = [...orbits]
				.map(([vc, n]) => ({ vc, orbits: n }))
				.sort((a, b) => b.orbits - a.orbits || (a.vc < b.vc ? -1 : 1));
			const renderCell = {
				cellPolygons: polys.map((p) => ({ n: p.n, vertices: p.v, ...(p.star ? { star: true } : {}) })),
				basis: out.cell.b,
			};
			const drawn = [...vertexTypePoints(renderCell as never).keys()].sort().join(" ");
			if (drawn !== [...orbits.keys()].sort().join(" "))
				throw new Error(`${f}: the cell's vertex types (${drawn}) are not the certificate's`);
			members.push({ id, k, part: palette });
			records.push({
				id,
				source: "tilesearch",
				k,
				family: labels.sort((a, b) => parseInt(a) - parseInt(b) || a.length - b.length).join("."),
				discoverer: `Čtrnáct engine (Tiling Searcher), ${started}`,
				certification: "candidate",
				wallpaperGroup: group,
				m: types.length,
				partition: types.map((t) => t.orbits),
				vcs: types.map((t) => t.vc),
				amalgama: { palette, types },
				renderCell,
				tilesearch: { board: board.name, file: f },
			});
		}
	console.log(
		`${palette}: ${n} amalgamas, k ${Math.min(...members.filter((m) => m.id.startsWith(`am-${palette}-`)).map((m) => m.k))} and up`,
	);
}
writeClassification(OUT, members, records as never);
console.log(`${members.length} members -> ${path.relative(process.cwd(), OUT)}`);
