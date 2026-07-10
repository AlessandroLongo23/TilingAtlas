/*
 * THROWAWAY — star-tiling REALIZER (corona growth from Myers vertex figures). TA work order 2026-07-07.
 *
 * Input: a Myers record's vertex figures (orbits) + pinned α. Output: the tiling as exact ℤ[ζ₂₄] tile
 * coordinates + period basis. Supersedes the Part-B hand-seed-building: instead of enumerating lattices
 * with the completeness solver (wrong tool for a KNOWN tiling), we CONSTRUCT the tiling by corona growth
 * — each vertex's figure is forced by its partial corner-sequence; overlap+backtracking handle ambiguity.
 * Not a completeness/certification run: correctness of emitted geometry is the only bar.
 *
 * Reuses: ExactStarPolygon.isotoxal / isotoxalDentAt, RegularPolygon.fromAnchorAndDirExact,
 * exactPolygonsOverlap (exact, non-convex-safe — the §9.4 hazard: NEVER the convex float intersects),
 * polygonAreaSurd / detSurd, Cyclotomic. Vertex figures from experiments/star-oracle/myers-2009-k2.json.
 *
 * Run:  pnpm tsx scripts/star-realizer.ts [phase1|FIG...]
 *   phase1              — primitive + dent-fill merge cross-check
 *   43 40 36 ...        — realize the given fig(s); default = the 10 in-ring point-only figs 34-43
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { ExactStarPolygon } from '@/classes/polygons/ExactStarPolygon';
import { polygonAreaSurd, detSurd, type Surd } from '@/classes/algorithm/exact/Surd';
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';
import type { Polygon } from '@/classes/polygons/Polygon';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const O = Cyclotomic.ZERO(ring);
const LOG = path.join(process.cwd(), 'experiments/results/star-realizer-2026-07-07.log');
function log(msg: string): void {
	fs.appendFileSync(LOG, msg + '\n');
	console.log(msg);
}

// ---------------------------------------------------------------------------------------------------
// Corner tokens.  A vertex figure is a cyclic sequence of these; a full turn = 24 (π/12 units).
type Tok = { kind: 'reg' | 'pt' | 'dent'; n: number; alpha: number; ang: number; str: string };
const regInteriorU = (n: number) => 12 - 24 / n; //   regular n-gon corner angle
const betaU = (n: number, alpha: number) => 24 - 24 / n - alpha; //   star dent (reflex) angle

/** Parse a Myers corner token: `n` (regular), `n*p@u` (star point, α=u), `n*d@u` (star dent, β=u). */
function parseTok(s: string): Tok {
	const mp = s.match(/^(\d+)\*p@(\d+)$/);
	if (mp) { const n = +mp[1], a = +mp[2]; return { kind: 'pt', n, alpha: a, ang: a, str: `P${n}@${a}` }; }
	const md = s.match(/^(\d+)\*d@(\d+)$/);
	if (md) { const n = +md[1], b = +md[2], a = 24 - 24 / n - b; return { kind: 'dent', n, alpha: a, ang: b, str: `D${n}@${a}` }; }
	const n = +s;
	return { kind: 'reg', n, alpha: 0, ang: regInteriorU(n), str: `R${n}` };
}
function parseFigure(orbit: string): Tok[] {
	return orbit.split('.').map(parseTok);
}
/** Token STRING of a placed tile's corner i (absolute identity for matching). */
function cornerStr(t: Polygon, i: number): string {
	if (t.isStar) {
		const st = t as ExactStarPolygon;
		return t.cornerAngleUnits(i) === st.alphaU ? `P${st.n}@${st.alphaU}` : `D${st.n}@${st.alphaU}`;
	}
	return `R${t.n}`;
}
/** Place the tile named by a token, seated at V with its outgoing edge (V→next) at direction `hi`. */
function placeTok(tok: Tok, V: Cyclotomic, hi: number): Polygon {
	if (tok.kind === 'reg') return RegularPolygon.fromAnchorAndDirExact(tok.n, V, hi);
	if (tok.kind === 'pt') return ExactStarPolygon.isotoxal(tok.n, tok.alpha, V, hi);
	return ExactStarPolygon.isotoxalDentAt(tok.n, tok.alpha, V, hi);
}

// ---------------------------------------------------------------------------------------------------
// Allowed vertex figures = the k orbits + the implied dent-fills (a star dent β + the regular filling
// 24−β).  A closed vertex in the patch must match one of these (as a cyclic sub/-sequence).
function allowedFigures(orbits: string[]): string[][] {
	const figs: string[][] = orbits.map((o) => parseFigure(o).map((t) => t.str));
	// dent-fills for each star species present
	const seen = new Set<string>();
	for (const o of orbits)
		for (const t of parseFigure(o))
			if (t.kind === 'pt' || t.kind === 'dent') {
				const key = `${t.n}@${t.alpha}`;
				if (seen.has(key)) continue;
				seen.add(key);
				const b = betaU(t.n, t.alpha);
				const fillU = 24 - b; //   = 24/n + α
				const fillN = [3, 4, 6, 8, 12].find((n) => regInteriorU(n) === fillU);
				if (fillN) figs.push([`D${t.n}@${t.alpha}`, `R${fillN}`]); //   dent + the regular that fills it
			}
	return figs;
}
/** All (next-token) continuations of a partial corner-sequence consistent with some allowed figure
 *  (cyclic, both orientations). Empty ⇒ dead end; a token repeated ⇒ forced. */
function matchNext(partial: string[], figs: string[][]): string[] {
	const out = new Set<string>();
	for (const F of figs) {
		const L = F.length;
		if (partial.length >= L) continue;
		for (const seq of [F, [...F].reverse()]) {
			for (let r = 0; r < L; r++) {
				let ok = true;
				for (let j = 0; j < partial.length; j++) if (seq[(r + j) % L] !== partial[j]) { ok = false; break; }
				if (ok) out.add(seq[(r + partial.length) % L]);
			}
		}
	}
	return [...out];
}

// ---------------------------------------------------------------------------------------------------
// Patch = a growing set of exact tiles + per-vertex incidence bookkeeping.
type Corner = { tile: Polygon; startDir: number; ang: number; str: string };
class Patch {
	tiles: Polygon[] = [];
	private byExact = new Set<string>();
	private atVertex = new Map<string, Corner[]>(); //   vertex key → incident corners

	has(t: Polygon): boolean { return this.byExact.has(t.exactKey()); }

	/** Add a tile (assumes overlap already checked). Returns false if a duplicate. */
	add(t: Polygon): boolean {
		const ek = t.exactKey();
		if (this.byExact.has(ek)) return false;
		this.byExact.add(ek);
		this.tiles.push(t);
		const vs = t.exactVertices!;
		for (let i = 0; i < vs.length; i++) {
			const k = vs[i].key();
			const c: Corner = { tile: t, startDir: t.edgeDirs![i], ang: t.cornerAngleUnits(i), str: cornerStr(t, i) };
			(this.atVertex.get(k) ?? this.atVertex.set(k, []).get(k)!).push(c);
		}
		return true;
	}

	cornersAt(k: string): Corner[] { return this.atVertex.get(k) ?? []; }

	overlapsAny(t: Polygon): boolean {
		// exact, non-convex-safe; cheap float-centroid prefilter (max tile span < 4) keeps it ~O(local).
		const ct = t.exactCentroid!.toVector();
		for (const q of this.tiles) {
			const cq = q.exactCentroid!.toVector();
			if (Math.hypot(ct.x - cq.x, ct.y - cq.y) > 4) continue;
			if (exactPolygonsOverlap(t.exactVertices!, q.exactVertices!)) return true;
		}
		return false;
	}

	/** Incident corners at a vertex, chained into angular order. Returns the open top `hi`, the covered
	 *  angle, the token-sequence lo→hi, and whether the vertex is closed (2π). null if no incidence. */
	vertexState(k: string): { hi: number; covered: number; seq: string[]; closed: boolean; corners: Corner[] } | null {
		const cs = this.atVertex.get(k);
		if (!cs || cs.length === 0) return null;
		const covered = cs.reduce((s, c) => s + c.ang, 0);
		if (covered >= 24) return { hi: 0, covered, seq: cs.map((c) => c.str), closed: true, corners: cs };
		// chain: each corner covers [startDir, startDir+ang]; the open bottom `lo` is a startDir that is no
		// corner's end. Follow ends → starts to order them.
		const byStart = new Map<number, Corner>();
		const ends = new Set<number>();
		for (const c of cs) { byStart.set(c.startDir, c); ends.add((c.startDir + c.ang) % 24); }
		let lo = -1;
		for (const c of cs) if (!ends.has(c.startDir)) { lo = c.startDir; break; }
		if (lo < 0) return null; //   not a single open chain (gap/inconsistency) — skip this vertex for now
		const seq: string[] = [];
		let cur: number | undefined = lo;
		const guard = new Set<number>();
		while (cur !== undefined && byStart.has(cur) && !guard.has(cur)) {
			guard.add(cur);
			const c = byStart.get(cur)!;
			seq.push(c.str);
			cur = (c.startDir + c.ang) % 24;
		}
		return { hi: cur ?? 0, covered, seq, closed: false, corners: cs };
	}

	frontierVertices(): string[] {
		const out: string[] = [];
		for (const k of this.atVertex.keys()) {
			const st = this.vertexState(k);
			if (st && !st.closed) out.push(k);
		}
		return out;
	}
}

// ---------------------------------------------------------------------------------------------------
type RealizeResult = {
	fig: string;
	ok: boolean;
	status: 'realized' | 'backtrack-stuck' | 'overlap-dead-end' | 'incomplete';
	tiles: Polygon[];
	note?: string;
};

const key = (z: Cyclotomic) => z.key();
const dist = (z: Cyclotomic) => Math.hypot(z.toVector().x, z.toVector().y);

/** Does the closed cyclic corner-sequence `seq` equal figure `fig` up to rotation + reflection? */
function isCyclicMatch(seq: string[], fig: string[]): boolean {
	if (seq.length !== fig.length) return false;
	const L = fig.length;
	for (const s of [seq, [...seq].reverse()])
		for (let r = 0; r < L; r++) {
			let ok = true;
			for (let j = 0; j < L; j++) if (s[(r + j) % L] !== fig[j]) { ok = false; break; }
			if (ok) return true;
		}
	return false;
}

/** Which of the two orbit figures actually occur as closed interior vertices — a mono-uniform collapse
 *  (only one present) means the realized tiling is NOT the intended 2-uniform fig. */
function orbitsPresent(tiles: Polygon[], orbits: string[], radius: number): boolean[] {
	const patch = new Patch();
	for (const t of tiles) patch.add(t);
	const zByKey = new Map<string, Cyclotomic>();
	for (const t of tiles) for (const v of t.exactVertices!) if (!zByKey.has(v.key())) zByKey.set(v.key(), v);
	const figs = orbits.map((o) => parseFigure(o).map((t) => t.str));
	const present = orbits.map(() => false);
	for (const [k, z] of zByKey) {
		if (dist(z) > radius) continue;
		const st = patch.vertexState(k);
		if (!st || !st.closed) continue;
		const seq = patch.cornersAt(k).map((c) => c.str);
		// re-chain into cyclic order via startDir walk
		const ordered = orderedCornerSeq(patch, k);
		for (let i = 0; i < figs.length; i++) if (isCyclicMatch(ordered, figs[i])) present[i] = true;
	}
	return present;
}
/** Closed vertex's corners in true cyclic (angular) order. */
function orderedCornerSeq(patch: Patch, k: string): string[] {
	const cs = patch.cornersAt(k);
	const byStart = new Map<number, Corner>();
	for (const c of cs) byStart.set(c.startDir, c);
	const seq: string[] = [];
	let cur = cs[0]?.startDir;
	const guard = new Set<number>();
	while (cur !== undefined && byStart.has(cur) && !guard.has(cur)) {
		guard.add(cur);
		const c = byStart.get(cur)!;
		seq.push(c.str);
		cur = (c.startDir + c.ang) % 24;
	}
	return seq;
}

/** Complete one vertex V: match its partial seq to a figure and seat the remaining corners. Tries each
 *  matching figure/orientation (DFS); mutates `patch` in place on success. Returns true if V closed. */
function completeVertex(patch: Patch, Vk: string, Vz: Cyclotomic, figs: string[][], radius: number): boolean {
	const st = patch.vertexState(Vk);
	if (!st) return false;
	if (st.closed) return true;
	let hi = st.hi;
	let seq = st.seq.slice();
	// forced growth: repeatedly ask the figures for the next token; place it; stop at 2π.
	let covered = st.covered;
	const added: Polygon[] = [];
	while (covered < 24) {
		const cands = matchNext(seq, figs);
		if (cands.length === 0) { for (const t of added) patch.tiles.pop(); return false; } // dead end (can't roll back incidence cleanly → caller re-derives)
		let placed = false;
		for (const cs of cands) {
			const tok = parseTok(cs.replace(/^R/, '').replace(/^P(\d+)@(\d+)$/, '$1*p@$2').replace(/^D(\d+)@(\d+)$/, (_m, n, a) => `${n}*d@${betaU(+n, +a)}`));
			if (tok.ang > 24 - covered + 1e-9) continue;
			const t = placeTok(tok, Vz, hi);
			if (patch.has(t)) { hi = (hi + tok.ang) % 24; covered += tok.ang; seq.push(cs); placed = true; break; } // shared tile already present
			if (patch.overlapsAny(t)) continue;
			patch.add(t);
			added.push(t);
			hi = (hi + tok.ang) % 24;
			covered += tok.ang;
			seq.push(cs);
			placed = true;
			break;
		}
		if (!placed) return false;
	}
	return true;
}

function realize(fig: string, orbits: string[], radius = 3.2): RealizeResult {
	const figs = allowedFigures(orbits);
	const patch = new Patch();
	// SEED with the STAR-bearing orbit (the star is the rigid skeleton that forces the 2-uniform
	// structure). Seeding a self-tileable regular orbit (e.g. 3^6) lets greedy growth collapse to that
	// mono-uniform tiling and never introduce the star. Prefer the orbit with the largest star.
	const starRank = (o: string) => Math.max(0, ...parseFigure(o).filter((t) => t.kind !== 'reg').map((t) => t.n));
	const seedOrbit = [...orbits].sort((a, b) => starRank(b) - starRank(a))[0];
	{
		let hi = 0;
		for (const tok of parseFigure(seedOrbit)) {
			const t = placeTok(tok, O, hi);
			if (!patch.has(t)) {
				if (patch.overlapsAny(t)) return { fig, ok: false, status: 'overlap-dead-end', tiles: patch.tiles, note: 'seed fan overlaps' };
				patch.add(t);
			}
			hi = (hi + tok.ang) % 24;
		}
	}
	// GROW: BFS-complete incomplete vertices nearest the origin until the target radius is covered.
	const cap = 2000;
	for (let iter = 0; iter < cap; iter++) {
		const front = patch
			.frontierVertices()
			.map((k) => ({ k, z: null as unknown as Cyclotomic }));
		// resolve vertex points (recover a Cyclotomic per key from an incident tile)
		const zByKey = new Map<string, Cyclotomic>();
		for (const t of patch.tiles) for (const v of t.exactVertices!) if (!zByKey.has(v.key())) zByKey.set(v.key(), v);
		const openInner = patch
			.frontierVertices()
			.map((k) => ({ k, z: zByKey.get(k)! }))
			.filter((o) => dist(o.z) <= radius)
			.sort((a, b) => dist(a.z) - dist(b.z));
		if (openInner.length === 0) break; //   inner region complete
		const target = openInner[0];
		const before = patch.tiles.length;
		completeVertex(patch, target.k, target.z, figs, radius);
		if (patch.tiles.length === before) {
			// couldn't advance this vertex — try the next open one; if none advance, stuck
			let progressed = false;
			for (const o of openInner.slice(1)) {
				const b2 = patch.tiles.length;
				completeVertex(patch, o.k, o.z, figs, radius);
				if (patch.tiles.length > b2) { progressed = true; break; }
			}
			if (!progressed) return { fig, ok: false, status: 'backtrack-stuck', tiles: patch.tiles, note: `stuck at ${openInner.length} open inner vertices, ${patch.tiles.length} tiles` };
		}
	}
	return { fig, ok: true, status: 'realized', tiles: patch.tiles };
}

// ---------------------------------------------------------------------------------------------------
function selfCheckPatch(res: RealizeResult, radius = 3.2): { innerVerts: number; badSum: number; overlaps: number } {
	// every vertex strictly inside the radius must be 2π; no proper overlaps among inner tiles.
	const patch = new Patch();
	for (const t of res.tiles) patch.add(t);
	const zByKey = new Map<string, Cyclotomic>();
	for (const t of res.tiles) for (const v of t.exactVertices!) if (!zByKey.has(v.key())) zByKey.set(v.key(), v);
	let innerVerts = 0, badSum = 0;
	for (const [k, z] of zByKey) {
		if (dist(z) > radius - 1.1) continue; //   strictly interior
		const st = patch.vertexState(k);
		innerVerts++;
		if (!st || !st.closed) badSum++;
	}
	let overlaps = 0;
	const inner = res.tiles.filter((t) => dist(t.exactCentroid!) <= radius);
	for (let i = 0; i < inner.length; i++)
		for (let j = i + 1; j < inner.length; j++)
			if (exactPolygonsOverlap(inner[i].exactVertices!, inner[j].exactVertices!)) overlaps++;
	return { innerVerts, badSum, overlaps };
}

// ---------------------------------------------------------------------------------------------------
// Period detection: closed interior vertices with the SAME (cornerStr, absolute edge-dir) signature are
// pure translates (edge dirs are translation-invariant, rotation-sensitive). Their differences generate
// the translation lattice Λ; a Gauss-reduced basis (u,v) follows.
const dot = (a: Cyclotomic, b: Cyclotomic) => { const A = a.toVector(), B = b.toVector(); return A.x * B.x + A.y * B.y; };
const cross = (a: Cyclotomic, b: Cyclotomic) => { const A = a.toVector(), B = b.toVector(); return Math.abs(A.x * B.y - A.y * B.x); };

function gaussReduce(u: Cyclotomic, v: Cyclotomic): [Cyclotomic, Cyclotomic] {
	for (let it = 0; it < 100; it++) {
		if (dist(v) < dist(u)) { const t = u; u = v; v = t; }
		const m = Math.round(dot(u, v) / dot(u, u));
		if (m === 0) break;
		v = v.sub(u.scaleRational(BigInt(m), 1n));
	}
	return [u, v];
}

function periodBasis(tiles: Polygon[], radius: number): [Cyclotomic, Cyclotomic] | null {
	const patch = new Patch();
	for (const t of tiles) patch.add(t);
	const ekset = new Set(tiles.map((t) => t.exactKey()));
	// candidate periods: pairwise differences of closed interior vertices (a 1-ring signature is NOT
	// enough — a candidate is only a period if translating the patch by it maps EVERY in-range tile onto
	// an existing tile; that exact verification is the real filter).
	const zByKey = new Map<string, Cyclotomic>();
	for (const t of tiles) for (const v of t.exactVertices!) if (!zByKey.has(v.key())) zByKey.set(v.key(), v);
	const closed: Cyclotomic[] = [];
	for (const [k, z] of zByKey) { if (dist(z) > radius) continue; const st = patch.vertexState(k); if (st && st.closed) closed.push(z); }
	if (closed.length < 2) return null;
	closed.sort((a, b) => dist(a) - dist(b));

	const patchHasStar = tiles.some((t) => t.isStar);
	const verify = (T: Cyclotomic): boolean => {
		let n = 0;
		let sawStar = false;
		for (const t of tiles) {
			const ct = t.exactCentroid!.add(T);
			if (dist(ct) > radius) continue; //   translate lands outside the patch — can't check here
			n++;
			const tt = t.clone();
			tt.translateExact(T);
			if (!ekset.has(tt.exactKey())) return false; //   a tile fails to map ⇒ NOT a period
			if (t.isStar) sawStar = true;
		}
		// A true period maps the RARE tiles too — requiring a star to be checked rejects false periods
		// that only ever verify a monochromatic (all-triangle) central region (the short-vector trap).
		return n >= 6 && (!patchHasStar || sawStar);
	};

	// unique nonzero differences, shortest first
	const seen = new Set<string>();
	const cand: Cyclotomic[] = [];
	for (let i = 0; i < closed.length; i++)
		for (let j = 0; j < closed.length; j++) {
			if (i === j) continue;
			const d = closed[i].sub(closed[j]);
			if (d.isZero()) continue;
			const k = d.key();
			if (seen.has(k)) continue;
			seen.add(k);
			cand.push(d);
		}
	cand.sort((a, b) => dist(a) - dist(b));

	let u: Cyclotomic | null = null;
	let v: Cyclotomic | null = null;
	let tried = 0;
	for (const d of cand) {
		if (tried++ > 600) break;
		if (!verify(d)) continue;
		if (process.env.DBG) log(`   [dbg] verified period len=${dist(d).toFixed(4)} key=${d.key()}`);
		if (!u) { u = d; continue; }
		if (cross(u, d) > 1e-6) { v = d; break; }
	}
	if (!u || !v) return null;
	return gaussReduce(u, v);
}

/** Reduce point p into the (u,v) fundamental cell (exact), using floats only to pick the integer combo. */
function reduceMod(p: Cyclotomic, u: Cyclotomic, v: Cyclotomic): Cyclotomic {
	const P = p.toVector(), U = u.toVector(), V = v.toVector();
	const det = U.x * V.y - U.y * V.x;
	const a = Math.floor((P.x * V.y - P.y * V.x) / det + 1e-7);
	const b = Math.floor((U.x * P.y - U.y * P.x) / det + 1e-7);
	return p.sub(u.scaleRational(BigInt(a), 1n)).sub(v.scaleRational(BigInt(b), 1n));
}

/** One tile per Λ-class (dedup by reduced centroid). Σ areas should == |det(u,v)| for a true period. */
function fundamentalCell(tiles: Polygon[], u: Cyclotomic, v: Cyclotomic): { reps: Polygon[]; area: Surd } {
	const seen = new Map<string, Polygon>();
	for (const t of tiles) {
		const rc = reduceMod(t.exactCentroid!, u, v).key();
		if (!seen.has(rc)) seen.set(rc, t);
	}
	const reps = [...seen.values()];
	let area = polygonAreaSurd(reps[0].exactVertices!);
	for (let i = 1; i < reps.length; i++) area = area.add(polygonAreaSurd(reps[i].exactVertices!));
	return { reps, area };
}

function loadOracle(): { fig: string; orbits: string[] }[] {
	return (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'experiments/star-oracle/myers-2009-k2.json'), 'utf8')) as { records: { fig: string; orbits: string[] }[] }).records;
}

function phase1(): void {
	log('=== PHASE 1: primitive + dent-fill merge cross-check ===');
	const star = ExactStarPolygon.isotoxal(8, 3, O, 0);
	const area = polygonAreaSurd(star.exactVertices!);
	const angles = star.exactVertices!.map((_, i) => star.cornerAngleUnits(i));
	log(`8*@3: verts=${star.exactVertices!.length} area≈${area.toFloat().toFixed(4)} (4√2≈5.6569) angles=[${angles.join(',')}]`);
}

type Enc = { n: string[]; d: string };
type OutRec = {
	fig: string; k: number; orbits: string[]; composition: string;
	basis: [Enc, Enc] | null; detFloat: number | null; status: string; note?: string;
};

function solverDet(fig: string): number | null {
	const p = path.join(process.cwd(), 'experiments/star-oracle/star-cells-k1k2.json');
	if (!fs.existsSync(p)) return null;
	const r = (JSON.parse(fs.readFileSync(p, 'utf8')) as OutRec[]).find((x) => x.fig === fig);
	return r?.detFloat ?? null;
}

const RADIUS = 6.5;
const args = process.argv.slice(2);
if (args[0] === 'phase1') {
	phase1();
} else {
	const recs = loadOracle();
	const figsWanted = args.length ? args : ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43'];
	log(`=== REALIZER — figs ${figsWanted.join(',')} (radius ${RADIUS}) ===`);
	const out: OutRec[] = [];
	for (const f of figsWanted) {
		const rec = recs.find((r) => r.fig === f);
		if (!rec) { log(`  ${f}: NOT in oracle`); continue; }
		const t0 = Date.now();
		const res = realize(f, rec.orbits, RADIUS);
		const chk = selfCheckPatch(res, RADIUS);
		let orec: OutRec = { fig: f, k: 2, orbits: rec.orbits, composition: '', basis: null, detFloat: null, status: res.status };
		const present = res.ok ? orbitsPresent(res.tiles, rec.orbits, RADIUS - 0.5) : [];
		if (res.ok && chk.overlaps === 0 && chk.badSum === 0 && !present.every(Boolean)) {
			orec.status = 'collapsed-1uniform';
			orec.note = `only orbit(s) [${present.map((p, i) => (p ? i : '')).filter((s) => s !== '').join(',')}] present — mono-uniform collapse, not the 2-uniform fig`;
		} else if (res.ok && chk.overlaps === 0 && chk.badSum === 0) {
			const basis = periodBasis(res.tiles, RADIUS - 0.5);
			if (!basis) {
				orec.status = 'realized-no-period';
				orec.note = `${res.tiles.length} tiles, patch too small for a repeat`;
			} else {
				const [u, v] = basis;
				const { reps, area } = fundamentalCell(res.tiles, u, v);
				const det = detSurd(u, v).abs();
				const areaMatch = area.equals(det);
				const encU = u.encode(), encV = v.encode();
				orec = {
					fig: f, k: 2, orbits: rec.orbits,
					composition: reps.map((t) => (t.isStar ? (t as ExactStarPolygon).name : String(t.n))).sort().join(','),
					basis: [encU, encV], detFloat: det.toFloat(),
					status: areaMatch && encU.d === '1' && encV.d === '1' ? 'realized' : 'realized-badperiod',
					note: areaMatch ? undefined : `|det|=${det.toFloat().toFixed(4)} != Σcell=${area.toFloat().toFixed(4)}`,
				};
			}
		} else {
			orec.note = res.note ?? `badSum=${chk.badSum} overlaps=${chk.overlaps}`;
		}
		out.push(orec);
		const sd = solverDet(f);
		const xcheck = sd != null && orec.detFloat != null ? (Math.abs(sd - orec.detFloat) < 1e-6 ? `✓xcheck ${sd.toFixed(4)}` : `✗XCHECK solver ${sd.toFixed(4)} != ${orec.detFloat.toFixed(4)}`) : '';
		const dt = ((Date.now() - t0) / 1000).toFixed(1);
		log(`  Fig ${f}: ${orec.status} — ${res.tiles.length} tiles, cell [${orec.composition}] det≈${orec.detFloat?.toFixed(4) ?? '—'} ${xcheck}; inner ${chk.innerVerts}v badSum=${chk.badSum} overlaps=${chk.overlaps}; ${dt}s ${orec.note ?? ''}`);
	}
	const outPath = path.join(process.cwd(), 'experiments/star-oracle/star-cells-realized.json');
	fs.writeFileSync(outPath, JSON.stringify(out.sort((a, b) => a.fig.localeCompare(b.fig, undefined, { numeric: true })), null, 2) + '\n');
	const nOK = out.filter((r) => r.status === 'realized').length;
	log(`\nrealized w/ exact basis: ${nOK}/${out.length} → ${outPath}`);
}
