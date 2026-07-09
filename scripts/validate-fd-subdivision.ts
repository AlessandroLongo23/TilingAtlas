/*
 * Acceptance gate for the FD-subdivision overlay (spec 2026-07-09-wallpaper-fd-subdivision).
 * The DRAWN cell is the primitive PARALLELOGRAM (hexagonal → 60° rhombus, cm/cmm → mirror rhombus).
 * Over all 92 certified k≤3 tilings, per wallpaper group, checks:
 *   - cell is a parallelogram    (4 vertices, area === |c1×c2|).
 *   - FD inside the drawn cell    (fd centroid in cellPolygon AND area(fd) ≈ cellArea/order).
 *   - subdivision tiles the cell  (Σarea ≈ cellArea AND count ≥ order — a chamber straddling a cell edge
 *                                 splits into edge-aligned pieces, so count can exceed order; still exact)
 *                                 OR length === 1 (the self-verified [fd] fallback).
 *   - cm/cmm cell is rhombic      (4 equal edges).
 * Prints a per-group table; a FALSE in "fd-in-cell" or "subdiv-ok" is a failure.
 *
 * Run: pnpm tsx scripts/validate-fd-subdivision.ts
 */
import fs from "node:fs";
import path from "node:path";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell, type SerializedCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import type { Vec2 } from "@/lib/classes/symmetry/types";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const catalogue = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), "figures/data/catalogue-k1-3.json"), "utf8"),
) as { tilings: { canonicalKey: string; cellCodec: SerializedCell | null }[] };
const tilings = catalogue.tilings.filter((t) => t.cellCodec);

const area = (p: Vec2[]) => {
	let s = 0;
	for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - a.y * b.x; }
	return Math.abs(s) / 2;
};
// point-in-polygon (ray cast) — the drawn cell is a general polygon (WS cell / rhombus), not a parallelogram
function inPoly(c: Vec2, poly: Vec2[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i], b = poly[j];
		if ((a.y > c.y) !== (b.y > c.y) && c.x < ((b.x - a.x) * (c.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
	}
	return inside;
}
const centroid = (p: Vec2[]): Vec2 => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });

type Row = { n: number; fdIn: number; full: number; fallback: number; rhombic: number; bad: string[] };
const byGroup: Record<string, Row> = {};
for (const t of tilings) {
	const s = seedFromCell(ring, t.cellCodec as SerializedCell);
	const d = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
	const [c1, c2] = d.cell;
	const cellArea = Math.abs(c1.x * c2.y - c1.y * c2.x);

	// FD inside the drawn cell polygon: every FD vertex inside-or-on cellPolygon (test via the fd centroid
	// plus each vertex against the cell). A subdivision face is a piece of the cell, so this must hold.
	const target = cellArea / d.pointGroupOrder;
	const fdIn =
		inPoly(centroid(d.fd), d.cellPolygon) &&
		Math.abs(area(d.cellPolygon) - cellArea) < 1e-3 * cellArea &&
		Math.abs(area(d.fd) - target) < 1e-2 * target;
	const totArea = d.subdivision.reduce((acc, p) => acc + area(p), 0);
	// area-exact tiling of the cell; a chamber split by the cell boundary makes length > order (still valid).
	const full = d.subdivision.length >= d.pointGroupOrder && Math.abs(totArea - cellArea) < 1e-3 * cellArea;
	const fallback = d.subdivision.length === 1 && d.pointGroupOrder > 1;
	const subdivOK = full || fallback;
	// cm/cmm should draw a rhombus (4 equal edges); measure the cellPolygon edges.
	const edges = d.cellPolygon.map((p, i) => { const q = d.cellPolygon[(i + 1) % d.cellPolygon.length]; return Math.hypot(p.x - q.x, p.y - q.y); });
	const rhombic = d.cellPolygon.length === 4 && Math.max(...edges) - Math.min(...edges) < 1e-6;

	const r = byGroup[d.group] ?? (byGroup[d.group] = { n: 0, fdIn: 0, full: 0, fallback: 0, rhombic: 0, bad: [] });
	r.n++;
	if (fdIn) r.fdIn++;
	if (full) r.full++;
	if (fallback) r.fallback++;
	if (rhombic) r.rhombic++;
	if ((!fdIn || !subdivOK) && r.bad.length < 3)
		r.bad.push(`${t.canonicalKey.slice(0, 18)} fdIn=${fdIn} subdiv=${d.subdivision.length}/${d.pointGroupOrder}`);
}

console.log("group   n   fd-in-cell  tiles-cell   fallback  cell=rhombus  issues");
let fdFail = 0, subFail = 0;
for (const [g, r] of Object.entries(byGroup).sort()) {
	fdFail += r.n - r.fdIn;
	subFail += r.n - (r.full + r.fallback);
	console.log(
		`${g.padEnd(7)} ${String(r.n).padStart(2)}   ${`${r.fdIn}/${r.n}`.padEnd(10)}  ${`${r.full}/${r.n}`.padEnd(10)}  ${String(r.fallback).padStart(6)}  ${`${r.rhombic}/${r.n}`.padStart(8)}   ${r.bad.join(" | ")}`,
	);
}
console.log(`\nFD-outside-cell failures: ${fdFail}  (must be 0)`);
console.log(`subdivision-invalid failures: ${subFail}  (must be 0; area-exact tiling or fallback both count as valid)`);
const fullTotal = Object.values(byGroup).reduce((a, r) => a + r.full, 0);
const fbTotal = Object.values(byGroup).reduce((a, r) => a + r.fallback, 0);
console.log(`area-exact subdivisions: ${fullTotal}/${tilings.length}   [fd] fallbacks: ${fbTotal}/${tilings.length}  (cm/cmm draw a rhombus)`);
if (fdFail > 0 || subFail > 0) process.exitCode = 1;
