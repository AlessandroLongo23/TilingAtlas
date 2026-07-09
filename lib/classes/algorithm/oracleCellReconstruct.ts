/**
 * Browser-safe exact reconstruction of an oracle cell from its cyclotomic generators {T1, T2, Seed}
 * (integer-coded in the ζ₁₂ power basis: [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³, ζ₁₂ = ζ₂₄²).
 * Extracted from scripts/oracle-match.ts so the Play viewer's symmetry overlay can reconstruct oracle
 * cells on the client. NO node:fs — the ring is passed in; there are no module-level file reads.
 *
 *   vertices (seed ⊕ lattice window) → unit edges (float broadphase, EXACT normSquared()==1) → faces
 *   (directed-edge tracing) → one face per lattice class → RegularPolygon.fromAnchorAndDirExact → cell.
 */
import { Cyclotomic, type CyclotomicRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

/** Decode an oracle [a,b,c,d] vertex into a Cyclotomic on `ring`. */
export function decodeGalebachVertex(ring: CyclotomicRing, [a, b, c, d]: number[]): Cyclotomic {
	return Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
}

/** Exact ζ-exponent of a unit step on `ring`, or null. */
function zetaExp(ring: CyclotomicRing, step: Cyclotomic): number | null {
	for (let r = 0; r < ring.N; r++) if (step.equals(Cyclotomic.zeta(ring, r))) return r;
	return null;
}

export type OracleSeed = { T1: number[]; T2: number[]; Seed: number[][] };

export function reconstructOracleCell(
	ring: CyclotomicRing,
	tCode: string,
	o: OracleSeed
): { cell: PeriodCell } | { error: string } {
	const oneC = Cyclotomic.ONE(ring);
	const dec = (abcd: number[]) => decodeGalebachVertex(ring, abcd);
	const u = dec(o.T1);
	const v = dec(o.T2);
	if (detSurd(u, v).isZero()) return { error: 'degenerate basis (det 0)' };
	const uV = u.toVector();
	const vV = v.toVector();
	const det = uV.x * vV.y - uV.y * vV.x;

	// --- vertex cloud: seeds ⊕ lattice window ---
	const R = 3;
	const verts: Cyclotomic[] = [];
	const seen = new Set<string>();
	const seeds = o.Seed.map(dec);
	for (let i = -R; i <= R; i++) {
		for (let j = -R; j <= R; j++) {
			const t = u.scaleRational(BigInt(i), 1n).add(v.scaleRational(BigInt(j), 1n));
			for (const s of seeds) {
				const p = s.add(t);
				const k = p.key();
				if (!seen.has(k)) {
					seen.add(k);
					verts.push(p);
				}
			}
		}
	}
	const fv = verts.map((p) => p.toVector());

	// --- unit edges: float grid broadphase, exact verify ---
	const CELL = 1.2;
	const grid = new Map<string, number[]>();
	const gk = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
	fv.forEach((p, i) => {
		const k = gk(p.x, p.y);
		const list = grid.get(k);
		if (list) list.push(i);
		else grid.set(k, [i]);
	});
	const nbrs: { j: number; ang: number }[][] = verts.map(() => []);
	fv.forEach((p, i) => {
		const ci = Math.floor(p.x / CELL);
		const cj = Math.floor(p.y / CELL);
		for (let di = -1; di <= 1; di++) {
			for (let dj = -1; dj <= 1; dj++) {
				for (const j of grid.get(`${ci + di},${cj + dj}`) ?? []) {
					if (j <= i) continue;
					const q = fv[j];
					const d2 = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
					if (d2 < 0.98 || d2 > 1.02) continue;
					if (!verts[i].sub(verts[j]).normSquared().equals(oneC)) continue;
					nbrs[i].push({ j, ang: Math.atan2(q.y - p.y, q.x - p.x) });
					nbrs[j].push({ j: i, ang: Math.atan2(p.y - q.y, p.x - q.x) });
				}
			}
		}
	});
	for (const list of nbrs) list.sort((a, b) => a.ang - b.ang);

	// --- face tracing: each directed edge belongs to exactly one face; interior faces surface as
	// positive-area cycles of length 3..12 (the reverse trace of a face is negative → discarded,
	// the unbounded face exceeds the length cap). At vertex b (arrived a→b), the next edge departs
	// to the neighbor immediately clockwise of the reverse direction — the standard planar
	// face-walk; with the discard rules the orientation convention cannot produce duplicates. ---
	const visited = new Set<string>();
	type Face = { idx: number[] };
	const faces: Face[] = [];
	const MAXN = 12;
	for (let i0 = 0; i0 < verts.length; i0++) {
		for (const { j: j0 } of nbrs[i0]) {
			if (visited.has(`${i0}>${j0}`)) continue;
			const cycle: number[] = [];
			let a = i0;
			let b = j0;
			let ok = false;
			for (let step = 0; step <= MAXN; step++) {
				visited.add(`${a}>${b}`);
				cycle.push(a);
				// next: neighbor of b immediately clockwise from the reverse direction (b→a)
				const list = nbrs[b];
				if (list.length === 0) break;
				const back = Math.atan2(fv[a].y - fv[b].y, fv[a].x - fv[b].x);
				let best = -1;
				let bestDelta = Infinity;
				for (let t = 0; t < list.length; t++) {
					if (list[t].j === a && list.length > 1) {
						// allow returning only if b is degree-1 (never in a tiling)
					}
					let delta = back - list[t].ang; // clockwise distance from `back`
					while (delta <= 1e-9) delta += 2 * Math.PI;
					if (delta < bestDelta) {
						bestDelta = delta;
						best = t;
					}
				}
				const c = list[best].j;
				a = b;
				b = c;
				if (a === i0 && b === j0) {
					ok = true;
					break;
				}
			}
			if (!ok || cycle.length < 3 || cycle.length > MAXN) continue;
			// signed area (float — selection only; geometry stays exact)
			let s = 0;
			for (let t = 0; t < cycle.length; t++) {
				const p = fv[cycle[t]];
				const q = fv[cycle[(t + 1) % cycle.length]];
				s += p.x * q.y - p.y * q.x;
			}
			if (s <= 0) continue;
			faces.push({ idx: cycle });
		}
	}

	// --- one face per lattice class. Dedupe must be EXACT: float-floor reduction double-counts
	// faces whose centroid lies on a cell boundary (jitter flips the floor between copies). Instead:
	// translation-equivariant shape key (minimal sorted (p−w).key() over anchor candidates w — the
	// minimizing w is unique, a polygon has no nonzero self-translation) groups congruent-by-
	// translation candidates; within a group, faces are the same class iff their anchors differ by
	// an EXACT lattice vector (float-guessed integers, exactly verified). ---
	const isLatticeVec = (w: Cyclotomic): boolean => {
		const d = w.toVector();
		const m = Math.round((d.x * vV.y - d.y * vV.x) / det);
		const n2 = Math.round((uV.x * d.y - uV.y * d.x) / det);
		if (Math.abs(m) > 100 || Math.abs(n2) > 100) return false;
		const recon = u.scaleRational(BigInt(m), 1n).add(v.scaleRational(BigInt(n2), 1n));
		return w.sub(recon).isZero();
	};
	const shapeGroups = new Map<string, { anchor: Cyclotomic; cycle: Cyclotomic[] }[]>();
	for (const f of faces) {
		let cx = 0;
		let cy = 0;
		for (const t of f.idx) {
			cx += fv[t].x;
			cy += fv[t].y;
		}
		cx /= f.idx.length;
		cy /= f.idx.length;
		const alpha = (cx * vV.y - cy * vV.x) / det;
		const beta = (uV.x * cy - uV.y * cx) / det;
		if (Math.abs(alpha - 0.5) > 1.5 || Math.abs(beta - 0.5) > 1.5) continue; // untrusted rim
		const cycle = f.idx.map((t) => verts[t]);
		let bestKey: string | null = null;
		let bestAnchor: Cyclotomic | null = null;
		for (const w of cycle) {
			const rel = cycle
				.map((p) => p.sub(w).key())
				.sort()
				.join(';');
			if (bestKey === null || rel < bestKey) {
				bestKey = rel;
				bestAnchor = w;
			}
		}
		const group = shapeGroups.get(bestKey!);
		if (!group) {
			shapeGroups.set(bestKey!, [{ anchor: bestAnchor!, cycle }]);
		} else if (!group.some((g) => isLatticeVec(g.anchor.sub(bestAnchor!)))) {
			group.push({ anchor: bestAnchor!, cycle });
		}
	}
	const classFaces: Cyclotomic[][] = [];
	for (const group of shapeGroups.values()) for (const g of group) classFaces.push(g.cycle);

	// --- exact polygons via the unit-ζ-step walk; verify the walk reproduces the traced cycle ---
	const cellPolygons: RegularPolygon[] = [];
	for (const cycle of classFaces) {
		const n = cycle.length;
		const r = zetaExp(ring, cycle[1].sub(cycle[0]));
		if (r == null) return { error: `face edge is not a unit ζ-step (${tCode})` };
		const poly = RegularPolygon.fromAnchorAndDirExact(n, cycle[0], r);
		const want = new Set(cycle.map((p) => p.key()));
		const got = poly.exactVertices!.map((p) => p.key());
		if (got.length !== want.size || !got.every((k) => want.has(k))) {
			return { error: `ζ-walk does not reproduce traced ${n}-gon (${tCode})` };
		}
		cellPolygons.push(poly);
	}

	// --- sanity: faces of one cell must tile the cell exactly (float area check) ---
	const polyArea = (p: RegularPolygon): number => {
		const vsf = p.exactVertices!.map((q) => q.toVector());
		let s = 0;
		for (let t = 0; t < vsf.length; t++) {
			const a2 = vsf[t];
			const b2 = vsf[(t + 1) % vsf.length];
			s += a2.x * b2.y - a2.y * b2.x;
		}
		return s / 2;
	};
	const sumArea = cellPolygons.reduce((s, p) => s + polyArea(p), 0);
	if (Math.abs(sumArea - Math.abs(det)) > 1e-6 * Math.abs(det)) {
		return {
			error: `face areas ${sumArea.toFixed(6)} ≠ |det| ${Math.abs(det).toFixed(6)} — incomplete reconstruction`,
		};
	}

	return { cell: { cellPolygons, basisExact: [u, v] } };
}
