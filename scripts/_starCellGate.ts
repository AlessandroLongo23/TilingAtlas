/*
 * ST-9 — the independent G1-G4 cell-correctness gate, factored out of `spike-star-4j-cell.ts`
 * (Harness 2) so it can run on ANY emitted star cell with one call (4(p) per the ST-9 work order;
 * the fill-requiring positive test in `tests/star-fill-positive.test.ts`).
 *
 * The §23 TA-contract rationale stands: an emitted cell is an UNVALIDATED INPUT, so it must pass a
 * gate built ONLY from the independently unit-tested primitives (cornerAngleUnits A1,
 * exactPolygonsOverlap B2, polygonAreaSurd A4) — NOT from the validators under test
 * (isCompleteTiling / KUniformityChecker) — before any post-fill row is trusted.
 *
 *   G1 no proper overlap · G2 every interior vertex 2π & well-typed (t≥3 real or t=2 dent-fill) ·
 *   G3 exact area = |det Λ| (Surd equality) · G4 edge-to-edge (every edge reverse-matched).
 *
 * `spike-star-4j-cell.ts` keeps its own inline copy on purpose — it is the recorded §23 evidence
 * artifact; this helper is byte-equivalent in logic (generalized cell input, no console output).
 */
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { polygonAreaSurd, detSurd } from '@/classes/algorithm/exact/Surd';
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';
import type { Polygon } from '@/classes/polygons/Polygon';

export type StarCellGateResult = {
	pass: boolean;
	overlaps: number; //   G1 — overlapping pairs among nearby block tiles
	badSum: number; //     G2 — interior points not at 2π
	badT: number; //       G2 — 1-tile 2π points (impossible)
	realVerts: number; //  G2 — ≥3-tile vertices seen
	dentFills: number; //  G2 — t=2 dent-fill non-vertices seen
	areaExact: boolean; // G3 — Σ shoelace = |det Λ| exactly
	unmatched: number; //  G4 — directed edges without a reverse match
	nStars: number;
	composition: string;
};

/** Run the independent G1-G4 gate on an emitted cell. Pure; no console output. */
export function independentCellGate(cell: PeriodCell): StarCellGateResult {
	const [u, v] = cell.basisExact;
	const tiles = cell.cellPolygons;

	const nStars = tiles.filter((p) => p.isStar).length;
	const composition = tiles.map((p) => p.getName()).sort().join(',');

	// G3 — exact area = |det Λ| (Surd equality)
	let area = polygonAreaSurd(tiles[0].exactVertices!);
	for (let i = 1; i < tiles.length; i++) area = area.add(polygonAreaSurd(tiles[i].exactVertices!));
	const detAbs = detSurd(u, v).abs();
	const areaExact = area.equals(detAbs);

	// replicate the cell over Λ
	const R = 2;
	const block: Polygon[] = [];
	const seenB = new Set<string>();
	for (let mi = -R; mi <= R; mi++) for (let ni = -R; ni <= R; ni++) {
		const t = u.scaleRational(BigInt(mi), 1n).add(v.scaleRational(BigInt(ni), 1n));
		for (const cp of tiles) { const q = cp.clone(); q.translateExact(t); const k = q.exactKey(); if (!seenB.has(k)) { seenB.add(k); block.push(q); } }
	}
	const cellDiam = Math.max(Math.hypot(u.toVector().x, u.toVector().y), Math.hypot(v.toVector().x, v.toVector().y));

	// G1 — no proper overlap among nearby tiles (exact B2)
	const local = block.filter((p) => Math.hypot(p.exactCentroid!.toVector().x, p.exactCentroid!.toVector().y) <= 2 * cellDiam + 2);
	let overlaps = 0;
	for (let i = 0; i < local.length; i++) for (let j = i + 1; j < local.length; j++)
		if (exactPolygonsOverlap(local[i].exactVertices!, local[j].exactVertices!)) overlaps++;

	// G2 — every interior point sums to 2π and is well-typed (t≥3 real vertex, or t=2 dent-fill)
	const inc = new Map<string, { units: number; tiles: Set<string>; vf: { x: number; y: number } }>();
	for (const p of block) p.exactVertices!.forEach((vx, i) => {
		const key = vx.key(); const e = inc.get(key); const a = p.cornerAngleUnits(i);
		if (e) { e.units += a; e.tiles.add(p.exactKey()); } else inc.set(key, { units: a, tiles: new Set([p.exactKey()]), vf: vx.toVector() });
	});
	let dentFills = 0, realVerts = 0, badSum = 0, badT = 0;
	for (const { units, tiles: tset, vf } of inc.values()) {
		if (Math.hypot(vf.x, vf.y) > cellDiam + 0.5) continue; // interior of one cell only
		if (units !== 24) { badSum++; continue; }
		if (tset.size >= 3) realVerts++;
		else if (tset.size === 2) dentFills++;
		else badT++;
	}

	// G4 — edge-to-edge: every directed edge of a cell tile has its reverse among the block
	const dir = new Set<string>();
	for (const p of block) { const vs = p.exactVertices!; for (let i = 0; i < vs.length; i++) dir.add(`${vs[i].key()}->${vs[(i + 1) % vs.length].key()}`); }
	let unmatched = 0;
	for (const p of tiles) { const vs = p.exactVertices!; for (let i = 0; i < vs.length; i++) { const a = vs[i].key(), b = vs[(i + 1) % vs.length].key(); if (!dir.has(`${b}->${a}`)) unmatched++; } }

	const pass = overlaps === 0 && badSum === 0 && badT === 0 && unmatched === 0 && areaExact;
	return { pass, overlaps, badSum, badT, realVerts, dentFills, areaExact, unmatched, nStars, composition };
}
