// VERTEX ORBITS OF A TRANSLATIONAL CELL — the honest k for a parametric family (2026-08-18).
//
// Written because the sliding-strip families shipped filed under k = 1 and that was a hard-coded lie.
// AL caught it: offset two strips by different amounts and the vertices on one interface can no longer
// be carried onto the vertices on another, so the tiling has several vertex orbits. Some slider
// settings do collapse to one orbit; most do not.
//
// k is NOT a property of a length family. It is a property of a POINT in the family's parameter box,
// and it drops on the measure-zero subsets where an extra symmetry appears. `stripK` below reports the
// generic value (what you see almost everywhere) and the family's defaults are chosen generic so that
// the thumbnail agrees with the shelf it is filed under.
//
// Method. A periodic tiling's symmetry group is a wallpaper group, and every symmetry carries the
// vertex set to itself, so:
//   1. reduce every tile of the cell to a canonical key — (shape, centroid mod lattice) — giving a
//      membership test for "is this a tile of the tiling";
//   2. every symmetry sends a fixed vertex v0 to SOME vertex w, so enumerating (linear part L, w) and
//      setting the translation to w - L*v0 enumerates the whole group, no candidate missed;
//   3. keep the g that map every cell tile to a tile; orbits are then the union-find closure.
// Step 2 is what makes this complete instead of a heuristic: it is a search over a finite candidate
// set that provably contains every element of the group.

import type { TranslationalCellData } from "@/lib/utils/renderTiling";

type Pt = [number, number];

const EPS = 1e-7;
const DP = 5; // key precision; strip lattices separate their vertices far more coarsely than this

/** The 48 candidates: rotations by k*15 deg, each with and without a reflection. A tiling of squares,
 *  rectangles and triangles cannot have a point-group element outside this set, and the lattice test
 *  below discards the ones the actual lattice does not admit. */
function candidateLinears(): number[][] {
	const out: number[][] = [];
	for (let k = 0; k < 24; k++) {
		const a = (k * Math.PI) / 12;
		const c = Math.cos(a), s = Math.sin(a);
		out.push([c, -s, s, c]);   // rotation
		out.push([c, s, s, -c]);   // rotation composed with the reflection in the x-axis
	}
	return out;
}

const apply = (L: number[], p: Pt): Pt => [L[0] * p[0] + L[1] * p[1], L[2] * p[0] + L[3] * p[1]];

export interface OrbitResult {
	/** Number of vertex orbits — the k of this member of the family. */
	k: number;
	/** One representative per orbit, as fractional lattice coordinates. */
	vertices: Pt[];
	/** Orbit index per vertex, aligned with `vertices`. */
	orbitOf: number[];
	/** Order of the symmetry group modulo translations by the cell lattice. */
	groupOrder: number;
}

export function vertexOrbits(cell: TranslationalCellData): OrbitResult {
	const [t1, t2] = cell.basis as unknown as [Pt, Pt];
	const det = t1[0] * t2[1] - t1[1] * t2[0];
	if (!isFinite(det) || Math.abs(det) < 1e-12) return { k: 0, vertices: [], orbitOf: [], groupOrder: 0 };
	// inverse of [t1 t2] as columns, so frac() reads a point in lattice coordinates
	const inv = [t2[1] / det, -t2[0] / det, -t1[1] / det, t1[0] / det];

	const frac = (p: Pt): Pt => {
		const out: Pt = [inv[0] * p[0] + inv[1] * p[1], inv[2] * p[0] + inv[3] * p[1]];
		for (let i = 0; i < 2; i++) {
			let f = out[i] % 1;
			if (f < 0) f += 1;
			if (f > 1 - EPS || f < EPS) f = 0; // a coordinate sitting on the cell boundary belongs to 0
			out[i] = f;
		}
		return out;
	};
	// Round to a string, collapsing negative zero. Without this a rotated coordinate of -1e-17 keys as
	// "-0.00000" and never matches the "0.00000" it is equal to, so every rotation is rejected and the
	// regular hexagonal tiling reports a trivial symmetry group and k = 2.
	const r = (x: number) => {
		const q = Math.round(x * 10 ** DP) / 10 ** DP;
		return (q === 0 ? 0 : q).toFixed(DP);
	};
	const fracKey = (p: Pt) => frac(p).map(r).join(",");

	const polys = (cell.cellPolygons as unknown as { v: Pt[] }[]) ?? [];

	/** (shape, position mod lattice) — equal keys mean the same tile of the tiling. */
	const tileKey = (v: Pt[]): string => {
		let cx = 0, cy = 0;
		for (const p of v) { cx += p[0]; cy += p[1]; }
		cx /= v.length; cy /= v.length;
		const shape = v.map((p) => `${r(p[0] - cx)}:${r(p[1] - cy)}`).sort().join(";");
		return `${shape}|${fracKey([cx, cy])}`;
	};

	const tiles = new Set(polys.map((p) => tileKey(p.v)));

	// Vertices: every tile of the tiling is a lattice translate of a cell tile, so reducing the cell
	// tiles' corners mod the lattice yields the complete vertex set. T-junction points come along for
	// free — a point interior to one tile's edge is still a CORNER of the tile that stops there.
	const byKey = new Map<string, Pt>();
	for (const poly of polys)
		for (const p of poly.v) {
			const k = fracKey(p);
			if (!byKey.has(k)) byKey.set(k, p);
		}
	const keys = [...byKey.keys()];
	const verts = keys.map((k) => byKey.get(k)!);
	const indexOf = new Map(keys.map((k, i) => [k, i]));
	if (!verts.length) return { k: 0, vertices: [], orbitOf: [], groupOrder: 0 };

	// A symmetry's linear part must carry the lattice to itself.
	const isLatticeMap = (L: number[]): boolean =>
		[t1, t2].every((t) => {
			const [x, y] = apply(L, t);
			const a = inv[0] * x + inv[1] * y, b = inv[2] * x + inv[3] * y;
			return Math.abs(a - Math.round(a)) < 1e-6 && Math.abs(b - Math.round(b)) < 1e-6;
		});

	const linears = candidateLinears().filter(isLatticeMap);
	const v0 = verts[0];

	const group: { L: number[]; t: Pt }[] = [];
	for (const L of linears)
		for (const w of verts) {
			const Lv0 = apply(L, v0);
			const t: Pt = [w[0] - Lv0[0], w[1] - Lv0[1]];
			const ok = polys.every((poly) => {
				const img = poly.v.map((p) => {
					const q = apply(L, p);
					return [q[0] + t[0], q[1] + t[1]] as Pt;
				});
				return tiles.has(tileKey(img));
			});
			if (ok) group.push({ L, t });
		}

	const parent = verts.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	const union = (i: number, j: number) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };

	for (const g of group)
		for (let i = 0; i < verts.length; i++) {
			const q = apply(g.L, verts[i]);
			const j = indexOf.get(fracKey([q[0] + g.t[0], q[1] + g.t[1]]));
			if (j !== undefined) union(i, j);
		}

	const roots = new Map<number, number>();
	const orbitOf = verts.map((_, i) => {
		const r = find(i);
		if (!roots.has(r)) roots.set(r, roots.size);
		return roots.get(r)!;
	});

	return { k: roots.size, vertices: verts.map(frac), orbitOf, groupOrder: group.length };
}
