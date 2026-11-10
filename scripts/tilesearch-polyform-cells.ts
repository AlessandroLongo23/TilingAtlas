/**
 * A Tiling Searcher run of a polyform palette's board, as the exact cells scripts/build-polyform-atlas.ts reads
 * (the file eu_develop writes: {id, k, T1, T2, faces: [{tile, verts}]}, coordinates in the power basis of ζ₁₂).
 *
 * The board comes from tools/ctrnact-oracle/alphabets/board_of_tables.py, where a piece and its mirror image are one
 * face; here each developed tile gets its own piece's name back, by its corner angles read counter-clockwise.
 * The Searcher writes one of a tiling and its mirror image; the builder's mirror closure adds the other.
 *
 *   pnpm tsx scripts/tilesearch-polyform-cells.ts <palette> <run folder> <out.json>
 *
 * <run folder> holds input.board and solver_<name>/. Every cell is checked: unit edges in 30° directions, and
 * every tile one of the palette's pieces. Then: pnpm tsx scripts/build-polyform-atlas.ts <palette> --cells=<out.json>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse } from "@/tools/searcher/app/src/board";
import { certificatesIn, decode, flatCell, geometry, vertexWords } from "@/tools/searcher/app/src/develop";
import { exactWalk, type P } from "./atlas/exactWalk";

const [palette, runDir, out] = process.argv.slice(2);
if (!palette || !runDir || !out)
	throw new Error("usage: tilesearch-polyform-cells.ts <palette> <run folder> <out.json>");
const ORACLE = path.join(process.cwd(), "tools", "ctrnact-oracle");

// each piece's corner angles in degrees, in the tables' corner order (CLASS_NEXT), which is clockwise
const pieces = JSON.parse(
	execFileSync("python3", [
		"-c",
		`import importlib.util, json, sys
s = importlib.util.spec_from_file_location("t", sys.argv[1]); t = importlib.util.module_from_spec(s); s.loader.exec_module(t)
out = {}
for tile, name in enumerate(t.TILE_NAME):
    c0 = t.CLASS_TILE.index(tile); cyc = [c0]
    while t.CLASS_NEXT[cyc[-1]] != c0: cyc.append(t.CLASS_NEXT[cyc[-1]])
    out[name] = [t.CLASS_UNITS[c] * 360 // t.D for c in cyc] * (t.CLASS_L[c0] // len(cyc))
print(json.dumps(out))`,
		path.join(ORACLE, "tables", palette, "tables.py"),
	]).toString(),
) as Record<string, number[]>;
const least = (w: number[]) => w.map((_, i) => [...w.slice(i), ...w.slice(0, i)].join(",")).sort()[0];
const nameOf = new Map(Object.entries(pieces).map(([name, w]) => [least([...w].reverse()), name])); // counter-clockwise

const board = parse(fs.readFileSync(path.join(runDir, "input.board"), "utf8")).board;
const solver = path.join(runDir, "solver_" + board.name);
const cells: unknown[] = [];
for (const f of fs
	.readdirSync(solver)
	.filter((f) => /solver_\d+_.*\.txt$/.test(f))
	.sort()) {
	const k = Number(/solver_(\d+)_/.exec(f)![1]); // the engine's k: vertices of fewer than three corners are not counted
	certificatesIn(fs.readFileSync(path.join(solver, f), "utf8")).forEach((cert, index) => {
		const id = `${f.replace(/\.txt$/, "")}-${index}`;
		const g = geometry(board, vertexWords(cert));
		if (g.kind !== "plane") throw new Error(`${id}: not a plane tiling`);
		const c = flatCell(decode(cert, board), board, g.turn);
		const { base, at, period } = exactWalk(
			(c.p ?? []).map((p) => p.v as number[][]),
			c.b as number[][],
		);
		// ζ₂₄'s even powers are ζ₁₂'s: a 30° direction has no odd coefficient
		const z12 = (q: { num: bigint[]; den: bigint }) => {
			if (q.den !== 1n || q.num.some((n, i) => i % 2 && n !== 0n)) throw new Error(`${id}: a vertex off the 30° grid`);
			return [0, 2, 4, 6].map((i) => Number(q.num[i] ?? 0n));
		};
		const faces = base.map((pts) => {
			const angle = (i: number) => {
				const [a, p, b]: P[] = [pts[(i + pts.length - 1) % pts.length], pts[i], pts[(i + 1) % pts.length]];
				const t = Math.atan2(
					(b.x - p.x) * (a.y - p.y) - (b.y - p.y) * (a.x - p.x),
					(b.x - p.x) * (a.x - p.x) + (b.y - p.y) * (a.y - p.y),
				);
				return Math.round((((t * 180) / Math.PI + 360) % 360) / 30) * 30;
			};
			const tile = nameOf.get(least(pts.map((_, i) => angle(i))));
			if (!tile) throw new Error(`${id}: a tile that is none of the palette's pieces`);
			return { tile, verts: pts.map((q) => z12(at(q) as never)) };
		});
		cells.push({ id, k, T1: z12(period[0] as never), T2: z12(period[1] as never), faces });
	});
}
fs.writeFileSync(out, JSON.stringify(cells));
console.log(`${cells.length} cells from ${solver} → ${out}`);
