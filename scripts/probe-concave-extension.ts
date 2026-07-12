/*
 * probe-concave-extension.ts — does an isotoxal α-family keep tiling PAST the convexity boundary?
 *
 * The exporter clips every family's α-range at convexity (both α,β ∈ (0,180)). AL's conjecture: some
 * families would keep tiling if you pushed α past β=180 into the CONCAVE (star) regime — same edge-to-edge,
 * no gap/overlap. This tests it directly: for each param, sweep α across the full (0,180) open interval,
 * and at each step check the cell's area certificate (Σ|tile area| == |det(basis)|, the exact gap/overlap
 * test the exporter uses). Report the MAXIMAL contiguous α-window where the tiling stays valid, vs the
 * convex sub-window the family currently ships. If valid-window ⊋ convex-window, the family extends into
 * concave — a tiling we're currently truncating.
 *
 *   pnpm tsx scripts/probe-concave-extension.ts [maxK]
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";

const ROOT = process.cwd();
const MAX_K = Number(process.argv[2] ?? 2);

// Concrete cell shape: evaluateParamCell's declared return type keeps cellPolygons as unknown[]; here we
// know the parametric evaluation yields numeric vertex pairs, so pin it for the geometry below.
interface Cell {
	cellPolygons: { n: number; vertices: [number, number][] }[];
	basis: [[number, number], [number, number]];
}
const evalCell = (pc: ParametricCellData, a: number | number[]): Cell => evaluateParamCell(pc, a) as unknown as Cell;

function shoelace(vs: [number, number][]): number {
	let a = 0;
	for (let i = 0; i < vs.length; i++) {
		const [x1, y1] = vs[i];
		const [x2, y2] = vs[(i + 1) % vs.length];
		a += x1 * y2 - x2 * y1;
	}
	return Math.abs(a) / 2;
}
function det2(a: [number, number], b: [number, number]): number {
	return Math.abs(a[0] * b[1] - a[1] * b[0]);
}
/** area certificate residual: |Σ tile area − |det basis|| (0 ⇒ exact tiling at this α). */
function residual(cell: Cell): number {
	const area = cell.cellPolygons.reduce((s, p) => s + shoelace(p.vertices), 0);
	return Math.abs(area - det2(cell.basis[0], cell.basis[1]));
}
/** Is every cell polygon a SIMPLE (non-self-intersecting) polygon? A tile self-intersects at extreme α;
 *  past that the shoelace area is meaningless, so we must stop the valid window there. Segment-crossing test. */
function allSimple(cell: Cell): boolean {
	const cross = (p: number[], q: number[], r: number[], s: number[]): boolean => {
		const d = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
		const d1 = d(p, q, r), d2 = d(p, q, s), d3 = d(r, s, p), d4 = d(r, s, q);
		return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
	};
	for (const poly of cell.cellPolygons) {
		const v = poly.vertices as number[][];
		const n = v.length;
		for (let i = 0; i < n; i++)
			for (let j = i + 1; j < n; j++) {
				// skip adjacent / shared-endpoint edges
				if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;
				if (cross(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n])) return false;
			}
	}
	return true;
}

/** ray-cast point-in-polygon (works for concave simple polygons). */
function inPoly(px: number, py: number, v: number[][]): boolean {
	let inside = false;
	for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
		const [xi, yi] = v[i];
		const [xj, yj] = v[j];
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}
/** Direct gap/overlap test: every point in ONE fundamental domain must be covered exactly once by the
 *  cell tiles + their lattice translates. Sufficient (area+coverage) — catches the "overlap here, gap there,
 *  areas cancel" case the area residual alone would miss. Deterministic 7×7 interior grid, 5×5 translate hood. */
function coveredExactlyOnce(cell: Cell): boolean {
	const [b0, b1] = cell.basis as [[number, number], [number, number]];
	// origin: centroid of all tile vertices, so the sampled domain sits amid the tiles
	let cx = 0, cy = 0, cnt = 0;
	for (const p of cell.cellPolygons) for (const [x, y] of p.vertices) { cx += x; cy += y; cnt++; }
	cx /= cnt; cy /= cnt;
	const M = 7;
	for (let si = 0; si < M; si++)
		for (let ti = 0; ti < M; ti++) {
			const s = (si + 0.5) / M, t = (ti + 0.5) / M;
			const px = cx + s * b0[0] + t * b1[0];
			const py = cy + s * b0[1] + t * b1[1];
			let cover = 0;
			for (let i = -2; i <= 2; i++)
				for (let j = -2; j <= 2; j++) {
					const dx = i * b0[0] + j * b1[0];
					const dy = i * b0[1] + j * b1[1];
					for (const poly of cell.cellPolygons)
						if (inPoly(px - dx, py - dy, poly.vertices as number[][])) cover++;
				}
			if (cover !== 1) return false;
		}
	return true;
}

const TOL = 1e-6;
const STEP = 0.25; // degrees

interface Row {
	id: string;
	k: number;
	P: number;
	convex: [number, number];
	valid: [number, number]; // maximal contiguous tiling-valid window containing the convex range
	extendsLo: number; // degrees gained below the convex range (into concave)
	extendsHi: number; // degrees gained above
}

function validWindow(pc: ParametricCellData, paramIdx: number): [number, number] | null {
	// hold other params at default, sweep param `paramIdx` across (0,180)
	const base = pc.params.map((p) => p.defaultAlphaDeg);
	const test = (a: number): boolean => {
		const alphas = base.slice();
		alphas[paramIdx] = a;
		const cell = evalCell(pc, pc.params.length === 1 ? alphas[0] : alphas);
		return residual(cell) < TOL && allSimple(cell) && coveredExactlyOnce(cell);
	};
	// start from the convex default (guaranteed valid), grow both ways until it breaks
	const start = pc.params[paramIdx].defaultAlphaDeg;
	if (!test(start)) return null; // sanity: default must tile
	let lo = start,
		hi = start;
	for (let a = start - STEP; a > 0 + 1e-9; a -= STEP) {
		if (test(a)) lo = a;
		else break;
	}
	for (let a = start + STEP; a < 180 - 1e-9; a += STEP) {
		if (test(a)) hi = a;
		else break;
	}
	return [lo, hi];
}

function main(): void {
	const files = [
		"public/reference-atlas-isotoxal.json",
		...(MAX_K >= 3 ? ["public/reference-atlas-isotoxal-k3.json"] : []),
		...(MAX_K >= 4 ? ["public/reference-atlas-isotoxal-k4.json"] : []),
	];
	const recs: { id: string; k: number; paramCell: ParametricCellData }[] = [];
	for (const f of files) {
		const p = path.join(ROOT, f);
		if (!fs.existsSync(p)) continue;
		for (const t of JSON.parse(fs.readFileSync(p, "utf8")) as { id: string; k: number; paramCell?: ParametricCellData }[])
			if (t.paramCell && t.k <= MAX_K) recs.push({ id: t.id, k: t.k, paramCell: t.paramCell });
	}
	const rows: Row[] = [];
	let extendCount = 0;
	for (const r of recs) {
		const pc = r.paramCell;
		// evaluate the FIRST param's extension (representative). convex range = that param's open range.
		const convex = pc.params[0].alphaRangeDegOpen;
		const w = validWindow(pc, 0);
		if (!w) continue;
		const extendsLo = Math.max(0, convex[0] - w[0]);
		const extendsHi = Math.max(0, w[1] - convex[1]);
		if (extendsLo > STEP || extendsHi > STEP) extendCount++;
		rows.push({ id: r.id, k: r.k, P: pc.params.length, convex, valid: w, extendsLo, extendsHi });
	}
	// summary
	console.log(`probed ${rows.length} parametric families (k≤${MAX_K}), sweep step ${STEP}°, tol ${TOL}`);
	console.log(`families that extend into the concave regime (>${STEP}° past convexity, either side): ${extendCount}\n`);
	const byK = new Map<number, { n: number; ext: number }>();
	for (const r of rows) {
		const e = byK.get(r.k) ?? { n: 0, ext: 0 };
		e.n++;
		if (r.extendsLo > STEP || r.extendsHi > STEP) e.ext++;
		byK.set(r.k, e);
	}
	for (const [k, e] of [...byK.entries()].sort((a, b) => a[0] - b[0]))
		console.log(`  k=${k}: ${e.ext}/${e.n} families extend into concave`);
	console.log("\nlargest concave gains (convex → valid window):");
	rows
		.map((r) => ({ ...r, gain: r.extendsLo + r.extendsHi }))
		.sort((a, b) => b.gain - a.gain)
		.slice(0, 20)
		.forEach((r) =>
			console.log(
				`  ${r.id}  convex [${r.convex[0].toFixed(0)},${r.convex[1].toFixed(0)}]  →  valid [${r.valid[0].toFixed(1)},${r.valid[1].toFixed(1)}]  (+${r.extendsLo.toFixed(1)}° lo, +${r.extendsHi.toFixed(1)}° hi)  P=${r.P}`,
			),
		);
}

main();
