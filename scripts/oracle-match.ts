/* Oracle t-code mapping for the figure pipeline (figures/README.md).
 *
 * The Soto-Sánchez/Galebach oracle (pinned: figures/data/galebach.json) stores, per tiling, the
 * translation basis T1/T2 and `Seed` = the vertex representatives per cell — all as [a,b,c,d] in
 * the ζ₁₂ power basis (decode recipe proven in scripts/oracle-characterize.ts). No polygons. We
 * therefore RECONSTRUCT each oracle tiling exactly:
 *
 *   vertices (seed ⊕ lattice window) → unit edges (float broadphase grid + EXACT normSquared()==1)
 *   → faces (directed-edge tracing; each interior face appears exactly once as a positive-area
 *   cycle ≤ 12-gon, so orientation conventions cancel) → one face per lattice class →
 *   RegularPolygon.fromAnchorAndDirExact → PeriodCell
 *
 * and match against the certified snapshot with cellsCongruent (the authoritative equality —
 * canonicalKey is only a bucket hash). Every failure mode reports loudly: degenerate oracle bases,
 * reconstruction area mismatches, 0- or ≥2-fold matches. Output: figures/data/oracle-map.json.
 *
 *   pnpm tsx scripts/oracle-match.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { deserializeCell } from './scoutCodec';
import { loadSnapshot } from '../figures/snapshot';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const ONE = Cyclotomic.ONE(ring);

// --- oracle decode (recipe from scripts/oracle-characterize.ts) ---
const GALEBACH_PATH = path.join(process.cwd(), 'figures', 'data', 'galebach.json');
const raw = fs
	.readFileSync(GALEBACH_PATH, 'utf8')
	.replace(/^Galebach=/, '')
	.replace(/,(\s*[}\]])/g, '$1');
const oracle: Record<string, { T1: number[]; T2: number[]; Seed: number[][] }> = JSON.parse(raw);
// [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³; ζ₁₂ = ζ₂₄².
const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

/** Exact ζ-exponent of a unit step, or null. */
function zetaExp(step: Cyclotomic): number | null {
	for (let r = 0; r < ring.N; r++) if (step.equals(Cyclotomic.zeta(ring, r))) return r;
	return null;
}

export function loadOracle(): Record<string, { T1: number[]; T2: number[]; Seed: number[][] }> {
	return oracle;
}

export function reconstructOracleCell(
	tCode: string,
	o: { T1: number[]; T2: number[]; Seed: number[][] }
): { cell: PeriodCell } | { error: string } {
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
					if (!verts[i].sub(verts[j]).normSquared().equals(ONE)) continue;
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
		const r = zetaExp(cycle[1].sub(cycle[0]));
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

/**
 * Manual assignments — each carries its justification; applied AFTER exact matching and only to
 * residuals (an exact-match conflict with a manual entry is a hard error).
 *
 * t1002 → 4.8.8: the oracle's [a,b,c,d] ζ₁₂ integer format cannot represent the 4.8.8 translation
 * basis (length 1+√2; √2 ∉ ℤ[ζ₁₂] — the 4.8.8 obstruction, NOTES §12.3), so its entry carries
 * T1=T2=0 and a placeholder unit-square Seed. Assignment is by elimination: the 11 1-uniform
 * tilings are fixed, the other 10 exact-match, and our sole unmatched k=1 tiling is 4.8.8
 * (vertex figure recomputed exactly — figures/data/orbits.json).
 */
const MANUAL_BY_VC: { tCode: string; k: number; vcMultiset: string }[] = [
	{ tCode: 't1002', k: 1, vcMultiset: '4,8,8' },
];

// --- main: reconstruct all oracle k≤3 entries, congruence-match against the snapshot ---
function main(): void {
	const snap = loadSnapshot();
	const ours = snap.tilings.map((t) => ({
		canonicalKey: t.canonicalKey,
		k: t.k,
		cell: deserializeCell(ring, t.cellCodec),
	}));

	const matched: Record<string, string> = {}; // canonicalKey → tCode
	const skipped: { tCode: string; reason: string }[] = [];
	const unmatchedOracle: string[] = [];
	const ambiguous: { tCode: string; keys: string[] }[] = [];
	const memo = new Map<string, string>();

	for (const k of [1, 2, 3]) {
		const entries = Object.entries(oracle).filter(([key]) => new RegExp(`^t${k}\\d\\d\\d$`).test(key));
		const mine = ours.filter((t) => t.k === k);
		console.error(`--- k=${k}: ${entries.length} oracle vs ${mine.length} certified ---`);
		entries.forEach(([tCode, o], idx) => {
			const rec = reconstructOracleCell(tCode, o);
			if ('error' in rec) {
				skipped.push({ tCode, reason: rec.error });
				console.error(`  ✗ ${tCode}: SKIP — ${rec.error}`);
				return;
			}
			const hits = mine.filter((t) => cellsCongruent(rec.cell, t.cell, memo));
			if (hits.length === 1) {
				const ck = hits[0].canonicalKey;
				if (matched[ck]) {
					ambiguous.push({ tCode, keys: [ck] });
					console.error(`  ✗ ${tCode}: collides with ${matched[ck]} on the same certified tiling`);
				} else {
					matched[ck] = tCode;
				}
			} else if (hits.length === 0) {
				unmatchedOracle.push(tCode);
				console.error(`  ✗ ${tCode}: NO congruent certified tiling (cell ${rec.cell.cellPolygons.length} polys)`);
			} else {
				ambiguous.push({ tCode, keys: hits.map((h) => h.canonicalKey) });
				console.error(`  ✗ ${tCode}: AMBIGUOUS — ${hits.length} congruent certified tilings`);
			}
			if ((idx + 1) % 10 === 0) console.error(`  [${idx + 1}/${entries.length}]`);
		});
	}

	// Manual assignments (residuals only; exact matches always win).
	const orbitCache = JSON.parse(
		fs.readFileSync(path.join(process.cwd(), 'figures', 'data', 'orbits.json'), 'utf8')
	) as Record<string, { vcOfOrbit: string[] }>;
	const manualApplied: { tCode: string; canonicalKey: string }[] = [];
	for (const m of MANUAL_BY_VC) {
		if (Object.values(matched).includes(m.tCode)) {
			throw new Error(`manual assignment ${m.tCode} conflicts with an exact match`);
		}
		const candidates = ours.filter(
			(t) =>
				t.k === m.k &&
				!matched[t.canonicalKey] &&
				orbitCache[t.canonicalKey]?.vcOfOrbit.slice().sort().join('|') === m.vcMultiset
		);
		if (candidates.length !== 1) {
			console.error(`  ✗ manual ${m.tCode}: expected exactly 1 residual candidate, got ${candidates.length}`);
			continue;
		}
		matched[candidates[0].canonicalKey] = m.tCode;
		manualApplied.push({ tCode: m.tCode, canonicalKey: candidates[0].canonicalKey });
		const i = skipped.findIndex((s) => s.tCode === m.tCode);
		if (i >= 0) skipped[i].reason += ' → MANUALLY ASSIGNED by elimination (see script header)';
		console.error(`  ★ manual: ${m.tCode} → ${candidates[0].canonicalKey.slice(0, 30)}… (by elimination)`);
	}

	const unmatchedOurs = ours.filter((t) => !matched[t.canonicalKey]).map((t) => t.canonicalKey);
	const out = {
		generatedAt: new Date().toISOString(),
		source: 'figures/data/galebach.json (pinned from chequesoto.info)',
		matchedCount: Object.keys(matched).length,
		matched,
		manualApplied,
		unmatchedOracle,
		unmatchedOurs,
		ambiguous,
		skipped,
	};
	const outPath = path.join(process.cwd(), 'figures', 'data', 'oracle-map.json');
	fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
	console.error(
		`★ oracle map written: ${outPath} — matched ${out.matchedCount}/92, ` +
			`oracle-unmatched ${unmatchedOracle.length}, skipped ${skipped.length}, ambiguous ${ambiguous.length}`
	);
	if (unmatchedOracle.length + skipped.length + ambiguous.length > 0) {
		console.error('⚑ residuals above need manual assignment or investigation — see oracle-map.json');
	}
}

if (process.argv[1] && path.basename(process.argv[1]) === 'oracle-match.ts') {
	main();
}
