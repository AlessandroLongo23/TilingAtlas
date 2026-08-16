/*
 * mixed-star-patch-growth.ts — gap-free random patches over the FULL in-ring star alphabet.
 *
 * Supersedes `star-patch-growth.ts`, whose alphabet was one star variant + the regulars, so every patch
 * it drew was a single star shape repeated. The k = 1..9 star catalogue says that restriction is not a
 * property of star tilings: 3,714 of its 12,960 entries carry two or more distinct star species, 36 carry
 * four or more, and 900 mix two point angles of the SAME fold (measured by `scripts/star-species-scan.ts`).
 * So the alphabet here is every in-ring species the catalogue uses, all available at once:
 *
 *   regular  3, 4, 6, 8, 12
 *   stars    3*{15,30,45}°  4*{15,30,45,60,75}°  6*{15,30,45,60,75,90}°  8*{15,45,75,90,120}°  12*{30,60,90,120}°
 *
 * Read from `experiments/star-oracle/inring-species-k1-9.json` — run the scan first, so the alphabet
 * cannot silently drift from the corpus it claims to come from. The catalogue's 9-fold (D = 18, unit 20°)
 * and 5-fold (D = 20, unit 18°) species are NOT here: their folds do not divide 24 and their angles are
 * not multiples of 15°, so they are not expressible in ℤ[ζ₂₄] and cannot share a vertex with these tiles
 * in any ring this codebase builds. That exclusion is listed in the manifest's `offRing` and printed by
 * the run, never dropped quietly.
 *
 * NOT aperiodic, nothing certified — random finite patches, exact ℤ[ζ₂₄] throughout.
 *
 * Correctness (same two guarantees as the single-variant grower, re-audited from scratch after growth):
 *  - NO OVERLAPS — every candidate is tested with `exactPolygonsOverlap` (sound for non-convex tiles)
 *    against every placed tile whose bounding disk can reach it.
 *  - NO HOLES inside the radius — growth stops only when every vertex with |v| ≤ RADIUS is fully closed.
 *
 * The disk is closed one RING at a time (r = 5, then outward in steps of 2), each ring frozen once it
 * closes and the next searched against it. One pass over a large disk does not terminate: a contradiction
 * near the rim can only be repaired by unwinding the whole interior. See `attempt`.
 *
 * What changed structurally, and why the old design could not just take a bigger alphabet: `fillSeqs`
 * enumerated EVERY ordered corner sequence summing to a gap before trying any of them, capped at 2,500.
 * With 51 corner types (23 stars × {point, dent} + 5 regulars) that enumeration is astronomically large
 * and the cap would silently truncate the candidate set on every gap. The fill is now a lazy generator:
 * it places each corner as it chooses it, so an overlapping tile kills its whole subtree immediately, and
 * it yields one filled gap at a time with its tiles left committed. Resuming the generator un-commits and
 * continues, which makes the outer vertex-order search a plain LIFO stack of suspended generators.
 *
 * Run:  pnpm tsx scripts/mixed-star-patch-growth.ts [radius] [count]
 * Out:  <root>/tmp-mixed-star-patches/patch-XX.{svg,png} + gallery.html
 *       experiments/results/mixed-star-patches-<date>.log  (written as the run goes)
 */
import fs from 'node:fs';
import path from 'node:path';
import { setActiveRing, CyclotomicRing, Cyclotomic } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes';
import { ExactStarPolygon } from '@/classes/polygons/ExactStarPolygon';
import type { Polygon } from '@/classes/polygons/Polygon';
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';
import { regInteriorU } from '@/classes/algorithm/StarVC';
import { polygonHue, starHue } from '@/utils/renderTiling';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const N = 24;
const ZERO = Cyclotomic.ZERO(ring);

const RADIUS = Number(process.argv[2] ?? 16); // close EVERY vertex within this radius ⇒ gap-free disk
const N_WANT = Number(process.argv[3] ?? 10); // patches wanted in the gallery
const TILE_CAP = 20_000; // safety cap on tiles per attempt
const STEP_CAP = 2_000_000; // outer collapse steps before a ring is abandoned
const NODE_CAP = 60_000_000; // DFS nodes (candidate placements) before an attempt is abandoned
const LOOKAHEAD_MAX_GAP = 12; // 1-ply dead-end test runs on gaps up to this width (see `deadEnd`)
// The disk is closed one RING at a time (see `attempt`): r = 5 first, then outward, each ring frozen once
// it closes. A ring that fails is retried against the same frozen core with fresh randomness — cheap,
// because a ring is a shallow problem where the whole disk in one pass is not.
//
// The steps narrow to 1 beyond r = 9, and the per-ring cap is low with many retries, for the same reason
// the attempt loop restarts instead of repairing: at width 2 with cap 25_000 and 8 retries the outer
// rings each became a deep search of their own and the yield at r = 16 fell to 1 in 24 attempts, nearly
// all of them dying at r = 11 or r = 13.
const STAGES = ((): number[] => { const s: number[] = []; for (let r = Math.min(5, RADIUS); r < RADIUS; r += r < 9 ? 2 : 1) s.push(r); s.push(RADIUS); return s; })();
const STAGE_RETRIES = 14;
const STAGE_BACKTRACK_CAP = 8_000; // per ring, per retry
// An attempt is abandoned when it STOPS MAKING PROGRESS, not on a flat clock: under a 300s flat budget
// the runs were still closing new rings when the budget ended (one was at r = 15 of 16 with 1,021 tiles),
// so the cap was throwing away work that was about to finish. STALL_MS is the time allowed without
// closing a ring deeper than any reached so far.
const STALL_MS = 150_000;
const ATTEMPT_BUDGET_MS = 1_200_000; // hard ceiling, rarely the binding one
const MAX_ATTEMPTS = 400;
const TILE_CACHE_CAP = 60_000; // placements memoised; see `make`
const MIN_STAR_SPECIES = 2; // a patch with fewer distinct star species is not what this script is for

// Candidate ordering weights (Efraimidis–Spirakis: key = U^(1/w), take largest). The bias is the only
// thing that makes a patch USE its alphabet: with uniform choice the sharp 15° points, which fit almost
// anywhere, dominate and the result looks like the single-variant grower again.
const W_REG = 1.0; // a regular corner
const W_STAR_SEEN = 1.6; // a star species already in the patch
const W_DENT = 0.5; // seating a star by its reflex dent (Fig-3 case); legal but rarely the way in
// The pull toward an unused species DECAYS with patch size. Held constant it keeps injecting new shapes
// into an already-committed neighbourhood, and those late insertions are what strand the search: a
// r = 8 disk failed 19 restarts in a row under a fixed boost. Front-loading the variety and letting the
// patch settle into a consistent local system afterwards is what the single-variant grower got for free.
const W_STAR_NEW_RANGE: [number, number] = [3.5, 12]; // drawn per attempt
const NEW_DECAY_RANGE: [number, number] = [18, 70]; // tiles; drawn per attempt
// ⚑ Two further diversity levers were tried and REMOVED, because at this size they cost more than they
// bought: a per-attempt affinity multiplier per species, and a continuous rarity pressure weighting up
// whatever is under the running average. Both stop the bulk settling into a locally consistent system,
// and settling is exactly what lets a large disk close: with them at [0.35, 2.55] and cap 2.5 the search
// closed r = 16 zero times in 4 attempts (best r = 11) where the same code without them closed it on the
// first attempt, twice. Softening them to [0.6, 1.7] and 1.5 did not recover it. Gallery variety comes
// from the per-attempt boost/decay draws instead.

// Sharding: the yield at r = 16 is ~15% and a failed attempt costs its whole budget, so a gallery is
// produced by running several of these in parallel with disjoint seed bases and merging (see
// scripts/merge-mixed-star-patches.ts). SHARD is also what keeps two parallel runs off each other's files.
const SHARD = process.env.PATCH_SHARD ?? '';
const SEED_BASE = Number(process.env.PATCH_SEED_BASE ?? 0x5a00);
const OUT = path.join(process.cwd(), 'tmp-mixed-star-patches', SHARD ? `shard-${SHARD}` : '.');
const LOG = path.join(process.cwd(), 'experiments', 'results', `mixed-star-patches-2026-08-12${SHARD ? '-' + SHARD : ''}.log`);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, '');
const say = (s: string): void => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

// ---------------------------------------------------------------------------------------------
// Alphabet, from the scan manifest.
// ---------------------------------------------------------------------------------------------
const MANIFEST = path.join(process.cwd(), 'experiments', 'star-oracle', 'inring-species-k1-9.json');
if (!fs.existsSync(MANIFEST)) throw new Error(`missing ${path.relative(process.cwd(), MANIFEST)} — run: pnpm tsx scripts/star-species-scan.ts`);
type SpeciesRow = { key: string; kind: 'regular' | 'star'; n: number; apexDeg: number; alphaU: number; tiles: number; kMin: number; kMax: number; inRing: boolean };
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { inRing: SpeciesRow[]; offRing: SpeciesRow[]; starEntriesScanned: number };

/** One seatable corner: the tile species plus WHICH of its corners sits on the collapse vertex. */
interface CornerSpec { tag: string; kind: 'reg' | 'pt' | 'dent'; n: number; alphaU: number; width: number; species: string; }

const CORNERS: CornerSpec[] = [];
for (const r of manifest.inRing) {
	if (r.kind === 'regular') {
		CORNERS.push({ tag: `${r.n}`, kind: 'reg', n: r.n, alphaU: 0, width: regInteriorU(r.n), species: `${r.n}` });
	} else {
		const beta = N - N / r.n - r.alphaU; // reflex dent, from the closure identity
		CORNERS.push({ tag: `${r.n}*p@${r.alphaU}`, kind: 'pt', n: r.n, alphaU: r.alphaU, width: r.alphaU, species: `${r.n}*${r.alphaU}` });
		CORNERS.push({ tag: `${r.n}*d@${beta}`, kind: 'dent', n: r.n, alphaU: r.alphaU, width: beta, species: `${r.n}*${r.alphaU}` });
	}
}
const STAR_SPECIES = [...new Set(CORNERS.filter((c) => c.kind !== 'reg').map((c) => c.species))];
const SPECIES_LABEL = (s: string): string => (s.includes('*') ? `${s.split('*')[0]}*${Number(s.split('*')[1]) * 15}°` : s);

// Which gap widths are reachable as a sum of available corner widths. With a 15° star point in the
// alphabet every width ≥ 1 is reachable, so this prune is inert here — kept because it costs nothing and
// becomes load-bearing again the moment the alphabet is narrowed.
const REACHABLE = new Array<boolean>(N + 1).fill(false);
REACHABLE[0] = true;
for (let g = 1; g <= N; g++) for (const c of CORNERS) if (c.width <= g && REACHABLE[g - c.width]) { REACHABLE[g] = true; break; }

// ---------------------------------------------------------------------------------------------
function mulberry32(a: number): () => number {
	return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Placed { poly: Polygon; isStar: boolean; n: number; species: string; corners: { key: string; start: number; width: number }[]; id: string; cx: number; cy: number; br: number; num: number; box: [number, number, number, number]; fv: { x: number; y: number }[]; }
interface VState { key: string; exact: Cyclotomic; r: number; slots: boolean[]; }

// Do two placed tiles properly overlap? A pure function of their geometry, so it is memoised: the DFS
// re-tests the same candidate against the same neighbours on every backtrack, and a profile of the
// un-memoised version put 72% of samples inside the exact ring arithmetic reached through this call (a
// 12*/12* pair is 576 exact segment tests).
//
// The key is a packed pair of SMALL INTEGERS, not the two exactKey() strings. A 24-vertex star key runs
// to hundreds of characters, so a string-keyed memo at 3M entries reached several GB and drove the
// process into GC thrash: an r = 16 run held ~150k nodes/s for eight attempts and then fell to ~16
// nodes/s for the next seventy, each burning its whole 300s budget on a few thousand nodes.
const overlapMemo = new Map<number, boolean>();
const OVERLAP_MEMO_CAP = 4_000_000;
const tileNum = new Map<string, number>(); // exactKey -> dense small int, assigned on first sight
function numOf(id: string): number {
	let n = tileNum.get(id);
	if (n === undefined) { n = tileNum.size; tileNum.set(id, n); }
	return n;
}
function overlaps(a: Placed, b: Placed): boolean {
	if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > a.br + b.br + 1e-9) return false; // disjoint bounding disks
	// Float AABB rejection. Sound with a margin: every coordinate here is an exact ring value evaluated to
	// a double, and distinct lattice points are far more than 1e-9 apart, so boxes that miss by more than
	// the margin cannot be a rounding artefact of touching tiles.
	if (a.box[2] < b.box[0] - 1e-9 || b.box[2] < a.box[0] - 1e-9 || a.box[3] < b.box[1] - 1e-9 || b.box[3] < a.box[1] - 1e-9) return false;
	const lo = Math.min(a.num, b.num), hi = Math.max(a.num, b.num);
	const key = lo * 0x2000000 + hi; // exact as a double while both stay under 2^25 distinct tiles
	const hit = overlapMemo.get(key);
	if (hit !== undefined) return hit;
	const r = exactPolygonsOverlap(a.poly.exactVertices!, b.poly.exactVertices!);
	if (overlapMemo.size >= OVERLAP_MEMO_CAP) { overlapMemo.clear(); }
	overlapMemo.set(key, r);
	return r;
}

// ---------------------------------------------------------------------------------------------
class MixedPatch {
	verts = new Map<string, VState>();
	placed: Placed[] = [];
	ids = new Set<string>();
	grid = new Map<string, Placed[]>(); // centroid buckets (cell size 1) for the overlap broadphase
	maxBr = 0; // largest bounding radius placed so far — sizes the broadphase window
	speciesCount = new Map<string, number>();
	rnd: () => number;
	nodes = 0;
	backtracks = 0;
	private tileCache = new Map<string, Placed>(); // (corner, vertex, dir) → geometry; backtracking revisits these constantly
	readonly newBoost: number;
	readonly newDecay: number;
	radius = 0; // the ring currently being closed — see `attempt`
	stageStart = 0; // placed.length when that ring began, so the diversity decay restarts per ring
	stageCensus = new Map<string, number>(); // species counts at that moment: novelty is judged per RING
	rings: { r: number; tiles: number }[] = [];

	constructor(seed: number) {
		this.rnd = mulberry32(seed);
		// Drawn once per attempt so restarts explore different regimes instead of re-running one.
		this.newBoost = W_STAR_NEW_RANGE[0] + this.rnd() * (W_STAR_NEW_RANGE[1] - W_STAR_NEW_RANGE[0]);
		this.newDecay = NEW_DECAY_RANGE[0] + this.rnd() * (NEW_DECAY_RANGE[1] - NEW_DECAY_RANGE[0]);
	}

	private place(c: CornerSpec, V: Cyclotomic, dir: number): Polygon {
		if (c.kind === 'reg') return RegularPolygon.fromAnchorAndDirExact(c.n, V, dir);
		if (c.kind === 'pt') return ExactStarPolygon.isotoxal(c.n, c.alphaU, V, dir);
		return ExactStarPolygon.isotoxalDentAt(c.n, c.alphaU, V, dir);
	}

	/** Geometry for `c` seated at `V` with outgoing direction `dir`, memoised — the DFS re-derives the
	 *  same placements on every backtrack, and a 12* outline is 24 exact vertices. */
	private make(c: CornerSpec, V: Cyclotomic, vkey: string, dir: number): Placed {
		const ck = `${c.tag}|${vkey}|${dir}`;
		const hit = this.tileCache.get(ck);
		if (hit) return hit;
		// Bounded: a 12* entry carries 24 exact ℤ[ζ₂₄] vertices, and a long attempt visits tens of millions
		// of placements — uncapped this went out of heap after one 57M-node attempt. Dropping the cache is
		// safe (it is a pure memo, and `ids` blocks a second instance of a placed tile by exact key).
		if (this.tileCache.size >= TILE_CACHE_CAP) this.tileCache.clear();
		const poly = this.place(c, V, dir);
		const ev = poly.exactVertices!;
		const corners = ev.map((v, i) => ({ key: v.key(), start: poly.edgeDirs![i], width: poly.cornerAngleUnits(i) }));
		const cen = poly.centroid;
		const fv = ev.map((v) => { const p = v.toVector(); return { x: p.x, y: p.y }; });
		let br = 0; for (const p of fv) br = Math.max(br, Math.hypot(p.x - cen.x, p.y - cen.y));
		const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
		for (const p of fv) { box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y); box[2] = Math.max(box[2], p.x); box[3] = Math.max(box[3], p.y); }
		const id = poly.exactKey();
		const t: Placed = { poly, isStar: !!poly.isStar, n: poly.n, species: c.species, corners, id, num: numOf(id), cx: cen.x, cy: cen.y, br, box, fv };
		this.tileCache.set(ck, t);
		return t;
	}

	private getVert(key: string, exact: Cyclotomic): VState {
		let s = this.verts.get(key);
		if (!s) { const p = exact.toVector(); s = { key, exact, r: Math.hypot(p.x, p.y), slots: new Array(N).fill(false) }; this.verts.set(key, s); }
		return s;
	}

	private cellKey(cx: number, cy: number): string { return `${Math.floor(cx)},${Math.floor(cy)}`; }

	/** Slot pre-check (no double-booked wedge at any corner) + EXACT non-convex overlap against every
	 *  tile whose bounding disk can reach t. */
	private fits(t: Placed): boolean {
		if (this.ids.has(t.id)) return false;
		for (const c of t.corners) { const ex = this.verts.get(c.key); if (!ex) continue; for (let s = 0; s < c.width; s++) if (ex.slots[(c.start + s) % N]) return false; }
		const reach = t.br + this.maxBr + 1e-9;
		const gx0 = Math.floor(t.cx - reach), gx1 = Math.floor(t.cx + reach);
		const gy0 = Math.floor(t.cy - reach), gy1 = Math.floor(t.cy + reach);
		for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
			const cell = this.grid.get(`${gx},${gy}`); if (!cell) continue;
			for (const o of cell) { if (o.id !== t.id && overlaps(t, o)) return false; }
		}
		return true;
	}

	private commit(t: Placed): { k: string; slot: number }[] {
		this.placed.push(t); this.ids.add(t.id);
		const ck = this.cellKey(t.cx, t.cy); const cell = this.grid.get(ck); if (cell) cell.push(t); else this.grid.set(ck, [t]);
		if (t.br > this.maxBr) this.maxBr = t.br;
		this.speciesCount.set(t.species, (this.speciesCount.get(t.species) ?? 0) + 1);
		const edits: { k: string; slot: number }[] = [];
		for (let i = 0; i < t.corners.length; i++) {
			const c = t.corners[i];
			const vs = this.getVert(c.key, t.poly.exactVertices![i]);
			for (let s = 0; s < c.width; s++) { const slot = (c.start + s) % N; if (!vs.slots[slot]) { vs.slots[slot] = true; edits.push({ k: c.key, slot }); } }
		}
		return edits;
	}

	/** Exact inverse of `commit`, for tiles appended contiguously at the end (the DFS unwinds LIFO). */
	private uncommit(added: Placed[], edits: { k: string; slot: number }[]): void {
		for (const e of edits) { const vs = this.verts.get(e.k); if (vs) vs.slots[e.slot] = false; }
		for (const t of added) {
			this.ids.delete(t.id);
			const cell = this.grid.get(this.cellKey(t.cx, t.cy)); if (cell) { const i = cell.indexOf(t); if (i >= 0) cell.splice(i, 1); }
			const c = (this.speciesCount.get(t.species) ?? 1) - 1;
			if (c <= 0) this.speciesCount.delete(t.species); else this.speciesCount.set(t.species, c);
		}
		this.placed.length -= added.length;
		for (const t of added) for (const c of t.corners) { const vs = this.verts.get(c.key); if (vs && vs.slots.every((b) => !b)) this.verts.delete(c.key); }
	}

	private gaps(slots: boolean[]): { start: number; len: number }[] {
		const out: { start: number; len: number }[] = [];
		let empty = 0; for (const b of slots) if (!b) empty++;
		if (empty === 0 || empty === N) return out;
		for (let i = 0; i < N; i++) if (!slots[i] && slots[(i - 1 + N) % N]) { let len = 0; for (let j = 0; j < N && !slots[(i + j) % N]; j++) len++; out.push({ start: i, len }); }
		return out;
	}

	/** Candidate corners for a gap of `rem` remaining slots, in weighted-random order.
	 *  `lastKind === 'pt'` bars another point: two stars seated point-first at V share the edge between
	 *  them, and every edge of an isotoxal star joins a point to a DENT, so both would put a reflex dent
	 *  on that edge's far endpoint — two reflex angles at one vertex sum past 360°. (The exact overlap
	 *  test rejects it anyway; this just stops the DFS from walking into it.) */
	private order(rem: number, lastKind: string): CornerSpec[] {
		const wNew = W_STAR_SEEN + (this.newBoost - W_STAR_SEEN) * Math.exp(-(this.placed.length - this.stageStart) / this.newDecay);
		const out: { c: CornerSpec; k: number }[] = [];
		for (const c of CORNERS) {
			if (c.width > rem) continue;
			if (!REACHABLE[rem - c.width]) continue;
			if (lastKind === 'pt' && c.kind === 'pt') continue;
			// "New" means new to THIS RING, not to the patch. Judged against the whole patch, the boost is
			// spent in the first ring and every ring after it grows whatever the core settled into: the
			// first r = 16 patch came out 307 triangles, 45 4*30 and 39 8*75 with singletons of the rest,
			// a near-periodic bulk. Per-ring novelty re-introduces species at each fresh frontier, which is
			// the safe place to introduce them.
			const usedHere = (this.speciesCount.get(c.species) ?? 0) > (this.stageCensus.get(c.species) ?? 0);
			const w = c.kind === 'reg' ? W_REG : c.kind === 'dent' ? W_DENT : usedHere ? W_STAR_SEEN : wNew;
			out.push({ c, k: Math.pow(this.rnd(), 1 / w) });
		}
		out.sort((a, b) => b.k - a.k);
		return out.map((o) => o.c);
	}

	/** Is there ANY tile that can start this gap? A tile covering the gap's first slot must begin exactly
	 *  there (the slot before it is taken), so "no first move" ⇒ the vertex can never close ⇒ the branch
	 *  is dead. Sound as a prune: placements only ever remove options, never add them. */
	private anyFirstMove(vs: VState, g: { start: number; len: number }): boolean {
		for (const c of CORNERS) {
			if (c.width > g.len) continue;
			if (this.fits(this.make(c, vs.exact, vs.key, g.start))) return true;
		}
		return false;
	}

	/** Dead-end test over the vertices a just-placed fan touched. Restricted to narrow gaps: those are
	 *  where the search actually strands itself (the classic 15°-sliver), and the test costs one `fits`
	 *  per candidate corner.
	 *
	 *  Bounded by the FINAL radius, not the ring being closed. Guarding only the current ring is what made
	 *  the first ringed run fail every time: closing r = 5 was free to leave a sliver at r = 5.4, that
	 *  sliver froze along with the core, and no r = 7 ring could ever close over it — 8 retries × 23
	 *  attempts, not one of which got past the first ring. */
	private deadEnd(keys: Iterable<string>): boolean {
		for (const k of keys) {
			const vs = this.verts.get(k);
			if (!vs || vs.r > RADIUS) continue;
			for (const g of this.gaps(vs.slots)) {
				if (!REACHABLE[g.len]) return true;
				if (g.len <= LOOKAHEAD_MAX_GAP && !this.anyFirstMove(vs, g)) return true;
			}
		}
		return false;
	}

	/**
	 * Fill one gap, yielding each complete filling with its tiles LEFT COMMITTED. Resuming the generator
	 * un-commits that filling and searches on, so the caller's stack of suspended generators is a
	 * backtracking search with no undo bookkeeping of its own.
	 */
	private *fillGap(V: Cyclotomic, vkey: string, start: number, len: number): Generator<Placed[]> {
		const acc: Placed[] = [];
		const self = this;
		function* rec(dir: number, rem: number, lastKind: string): Generator<Placed[]> {
			if (self.nodes > NODE_CAP) return;
			if (rem === 0) {
				const touched = new Set<string>();
				for (const t of acc) for (const c of t.corners) touched.add(c.key);
				if (!self.deadEnd(touched)) yield acc.slice();
				return;
			}
			for (const c of self.order(rem, lastKind)) {
				self.nodes++;
				const t = self.make(c, V, vkey, dir);
				if (!self.fits(t)) continue;
				const edits = self.commit(t);
				acc.push(t);
				yield* rec((dir + c.width) % N, rem - c.width, c.kind);
				acc.pop();
				self.uncommit([t], edits);
			}
		}
		yield* rec(start, len, 'none');
	}

	/** Next vertex to collapse: NARROWEST gap anywhere in the disk, ties broken by distance to the origin.
	 *  Minimum-remaining-values, and the ordering that decides whether this search terminates at all — a
	 *  narrow gap has few fillings, so committing it first either succeeds or fails immediately instead of
	 *  being discovered impossible fifty tiles later. Pure closest-first (what the single-variant grower
	 *  used) leaves slivers behind the frontier and thrashed on every r = 8 restart. Which vertex is
	 *  chosen never affects the guarantee, only the cost of reaching it: the attempt succeeds only when
	 *  EVERY in-radius vertex is closed. */
	private pick(): { key: string; exact: Cyclotomic; gap: { start: number; len: number } } | 'done' {
		let best: { key: string; exact: Cyclotomic; gap: { start: number; len: number }; r: number } | null = null;
		for (const vs of this.verts.values()) {
			if (vs.r > this.radius) continue; // outside the ring the frontier is allowed to stay ragged
			const gs = this.gaps(vs.slots);
			if (gs.length === 0) continue;
			let g = gs[0];
			for (const x of gs) if (x.len < g.len) g = x;
			if (!best || g.len < best.gap.len || (g.len === best.gap.len && vs.r < best.r)) best = { key: vs.key, exact: vs.exact, gap: g, r: vs.r };
		}
		return best ?? 'done';
	}

	/** Close every vertex inside the CURRENT `this.radius`, seeding the origin fan if the patch is empty.
	 *  Its own backtracking never leaves the tiles it placed behind: a stack that empties has unwound
	 *  every generator. A cap or deadline exit does leave them, which is what `restore` is for. */
	private closeDisk(deadline: number, backtrackCap: number): boolean {
		const stack: Generator<Placed[]>[] = [];
		if (this.placed.length === 0) {
			const okey = ZERO.key();
			this.getVert(okey, ZERO);
			const seedGen = this.fillGap(ZERO, okey, 0, N); // the origin's full 360°, direction 0 by convention
			if (seedGen.next().done) return false;
			stack.push(seedGen);
		}
		const btStart = this.backtracks;
		let steps = 0;
		while (steps++ < STEP_CAP) {
			if ((steps & 63) === 0 && Date.now() > deadline) return false;
			if (this.placed.length >= TILE_CAP || this.nodes > NODE_CAP || this.backtracks - btStart > backtrackCap) return false;
			const p = this.pick();
			if (p === 'done') return true;
			const gen = this.fillGap(p.exact, p.key, p.gap.start, p.gap.len);
			if (!gen.next().done) { stack.push(gen); continue; }
			let recovered = false;
			while (stack.length > 0) {
				this.backtracks++;
				if (!stack[stack.length - 1].next().done) { recovered = true; break; }
				stack.pop(); // exhausted — it has un-committed everything it placed
			}
			if (!recovered) return false;
		}
		return false;
	}

	/** Rebuild the whole patch from a tile list, discarding everything else. Cheaper and less error-prone
	 *  than unwinding abandoned generators, and it is the operation a failed stage needs: drop back to the
	 *  last disk that closed and try the next ring again. */
	private restore(core: Placed[]): void {
		this.verts.clear(); this.ids.clear(); this.grid.clear(); this.speciesCount.clear();
		this.placed.length = 0; this.maxBr = 0;
		for (const t of core) this.commit(t);
	}

	/**
	 * One attempt, grown in rings. Searching a big disk in one pass does not work: the whole thing is a
	 * single chronological backtracking problem, so a contradiction found near the rim can only be repaired
	 * by unwinding through the entire interior, and it never gets there before the caps. Closing radius
	 * `stages[0]` first, freezing it, then closing the next ring against that frozen core turns one
	 * exponential search into a sequence of shallow ones — each ring is a fresh problem whose interior
	 * boundary is already fixed. A ring that fails is retried from the same core with fresh randomness;
	 * only after `STAGE_RETRIES` of those does the attempt die, and the core it dies on was still a
	 * legitimately closed disk.
	 *
	 * A ring that exhausts its retries un-does the ring BELOW it and has that one grown differently, which
	 * is the same chronological backtracking the tile search does, one granularity up. Without it a single
	 * unlucky core kills the whole attempt.
	 *
	 * The freeze is still why this is a growth heuristic and not a complete search: it can only undo whole
	 * rings, never a single tile deep in the interior. Nothing here claims completeness. The patches are
	 * random, and the audit is what makes each emitted one true.
	 */
	attempt(deadline: number, stages: number[]): boolean {
		const cores: Placed[][] = [[]]; // cores[i] = the frozen patch that ring i starts from
		const retries = new Array<number>(stages.length).fill(0);
		let i = 0;
		let deepest = -1;
		let lastProgress = Date.now();
		while (i < stages.length) {
			const now = Date.now();
			if (now > deadline || now - lastProgress > STALL_MS || this.nodes > NODE_CAP) return false;
			this.radius = stages[i];
			this.restore(cores[i]);
			this.stageStart = this.placed.length;
			this.stageCensus = new Map(this.speciesCount);
			if (this.closeDisk(Math.min(deadline, lastProgress + STALL_MS), STAGE_BACKTRACK_CAP)) {
				cores[i + 1] = this.placed.slice();
				retries[i] = 0;
				this.rings[i] = { r: stages[i], tiles: this.placed.length };
				this.rings.length = i + 1;
				if (i > deepest) { deepest = i; lastProgress = Date.now(); }
				i++;
				continue;
			}
			if (++retries[i] < STAGE_RETRIES) continue; // same core, fresh randomness
			retries[i] = 0;
			if (--i < 0) return false; // even the seed ring is out of tries
		}
		return true;
	}

	/**
	 * Post-hoc audit, rebuilt from the placed tiles alone: it re-derives the vertex→slot map instead of
	 * reading `this.verts`, and calls `exactPolygonsOverlap` directly instead of the memo, so neither the
	 * incremental bookkeeping nor the cache can hide its own bug. A valid patch has all three counters at
	 * zero. The r ≤ RADIUS−1 bound keeps the ragged boundary — vertices sitting on the radius, subject to
	 * float fuzz — out of the hole count.
	 */
	verify(): { overlaps: number; openInR: number; doubleBooked: number } {
		let overlaps = 0;
		for (let i = 0; i < this.placed.length; i++) for (let j = i + 1; j < this.placed.length; j++) {
			const a = this.placed[i], b = this.placed[j];
			if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > a.br + b.br + 1e-9) continue; // disjoint disks
			if (exactPolygonsOverlap(a.poly.exactVertices!, b.poly.exactVertices!)) overlaps++;
		}
		const fresh = new Map<string, { r: number; s: boolean[] }>();
		let doubleBooked = 0;
		for (const t of this.placed) {
			for (let i = 0; i < t.corners.length; i++) {
				const c = t.corners[i];
				let e = fresh.get(c.key);
				if (!e) { const p = t.poly.exactVertices![i].toVector(); e = { r: Math.hypot(p.x, p.y), s: new Array<boolean>(N).fill(false) }; fresh.set(c.key, e); }
				for (let k = 0; k < c.width; k++) { const slot = (c.start + k) % N; if (e.s[slot]) doubleBooked++; e.s[slot] = true; }
			}
		}
		let openInR = 0;
		for (const e of fresh.values()) if (e.r <= this.radius - 1 && this.gaps(e.s).length > 0) openInR++;
		return { overlaps, openInR, doubleBooked };
	}

	/** Species → tile count, stars first by fold then point angle. */
	census(): { species: string; count: number; isStar: boolean }[] {
		return [...this.speciesCount.entries()]
			.map(([species, count]) => ({ species, count, isStar: species.includes('*') }))
			.sort((a, b) => (a.isStar === b.isStar ? Number(a.species.split('*')[0]) - Number(b.species.split('*')[0]) || Number(a.species.split('*')[1] ?? 0) - Number(b.species.split('*')[1] ?? 0) : a.isStar ? 1 : -1));
	}

	svg(size: number): string {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const t of this.placed) for (const p of t.fv) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
		const w = maxX - minX, h = maxY - minY, pad = 0.6;
		const scale = (size - 20) / (Math.max(w, h) + 2 * pad);
		const ox = 10 - (minX - pad) * scale + (Math.max(w, h) - w) * scale * 0.5;
		const oy = 10 - (minY - pad) * scale + (Math.max(w, h) - h) * scale * 0.5;
		const tx = (x: number) => (x * scale + ox).toFixed(2);
		const ty = (y: number) => (size - (y * scale + oy)).toFixed(2); // flip Y for screen
		const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`, `<rect width="${size}" height="${size}" fill="#0d1117"/>`];
		for (const t of this.placed) {
			const pts = t.fv.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ');
			parts.push(`<polygon points="${pts}" fill="${fillOf(t.species)}" stroke="#0d1117" stroke-width="0.8" stroke-linejoin="round"/>`);
		}
		parts.push('</svg>');
		return parts.join('');
	}
}

/** Species colour. Regulars take the atlas's log side-count ramp, muted; stars take `starHue(n, α)` —
 *  the same per-apex nudge the app uses, so two point angles of one fold separate — and drop in
 *  lightness with α, which pulls apart the pairs whose hue nudge clamps at the ±25° limit. */
function fillOf(species: string): string {
	if (!species.includes('*')) return `hsl(${polygonHue(Number(species)).toFixed(0)} 55% 55%)`;
	const [nS, aS] = species.split('*');
	const n = Number(nS), alphaU = Number(aS);
	return `hsl(${starHue(n, alphaU * 15).toFixed(0)} 78% ${(68 - 2.2 * alphaU).toFixed(0)}%)`;
}

// ---------------------------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------------------------
say(`mixed-star-patch-growth — target ${N_WANT} gap-free patches, close-radius ${RADIUS} (rings ${STAGES.join(" → ")})`);
say(`alphabet: ${CORNERS.filter((c) => c.kind === 'reg').length} regular + ${STAR_SPECIES.length} star species (${CORNERS.length} seatable corners), from ${manifest.starEntriesScanned} catalogue entries k=1..9`);
say(`  regular: ${manifest.inRing.filter((r) => r.kind === 'regular').map((r) => r.n).join(', ')}`);
for (const n of [3, 4, 6, 8, 12]) {
	const s = manifest.inRing.filter((r) => r.kind === 'star' && r.n === n);
	if (s.length) say(`  ${n}*: ${s.map((r) => `${r.apexDeg}°`).join(', ')}`);
}
say(`excluded (not expressible in ℤ[ζ₂₄]): ${manifest.offRing.map((r) => r.key).join(', ')} — 9-fold (20° grid) and 5-fold (18° grid) shelves`);
say('');

const cards: string[] = [];
const globalCensus = new Map<string, number>();
let made = 0;
for (let a = 0; a < MAX_ATTEMPTS && made < N_WANT; a++) {
	const seed = (SEED_BASE + a * 0x9e3779b1) | 0;
	// Both memos are geometry-absolute, so keeping them across attempts is CORRECT but unbounded; a fresh
	// attempt reuses almost none of the previous one. Clearing here is what keeps the process in heap.
	overlapMemo.clear(); tileNum.clear();
	const patch = new MixedPatch(seed);
	const t0 = Date.now();
	const ok = patch.attempt(t0 + ATTEMPT_BUDGET_MS, STAGES);
	const secs = ((Date.now() - t0) / 1000).toFixed(1);
	const reached = patch.rings.length ? `closed to r=${patch.rings[patch.rings.length - 1].r}` : 'closed nothing';
	if (!ok) { say(`  attempt ${String(a + 1).padStart(2)}: ✗ ${reached} of ${RADIUS} (${patch.placed.length} tiles, ${patch.backtracks} backtracks, ${patch.nodes} nodes, ${secs}s)`); continue; }
	const census = patch.census();
	const starSpecies = census.filter((c) => c.isStar);
	if (starSpecies.length < MIN_STAR_SPECIES) { say(`  attempt ${String(a + 1).padStart(2)}: ✗ only ${starSpecies.length} star species — rejected (want ≥ ${MIN_STAR_SPECIES})`); continue; }
	const audit = patch.verify();
	if (audit.overlaps !== 0 || audit.openInR !== 0 || audit.doubleBooked !== 0) { say(`  attempt ${String(a + 1).padStart(2)}: ⚑ AUDIT FAIL — ${audit.overlaps} overlaps, ${audit.openInR} open in-radius vertices, ${audit.doubleBooked} double-booked slots — NOT emitted`); continue; }

	made++;
	const svg = patch.svg(560);
	const stem = path.join(OUT, `patch-${String(made).padStart(2, '0')}`);
	fs.writeFileSync(`${stem}.svg`, svg);
	// Sidecar so the merge step can rebuild a gallery card without re-running the search.
	fs.writeFileSync(`${stem}.json`, JSON.stringify({ seed, radius: RADIUS, tiles: patch.placed.length, stars: patch.placed.filter((t) => t.isStar).length, starSpecies: starSpecies.length, rings: patch.rings, census, audit, backtracks: patch.backtracks, seconds: Number(secs) }));
	const stars = patch.placed.filter((t) => t.isStar).length;
	for (const c of census) globalCensus.set(c.species, (globalCensus.get(c.species) ?? 0) + c.count);
	say(`  attempt ${String(a + 1).padStart(2)}: ✓ patch ${String(made).padStart(2, '0')} — ${String(patch.placed.length).padStart(4)} tiles (${stars} stars), ${starSpecies.length} star species, audit OK (0 overlaps, 0 holes, 0 double-booked slots), ${patch.backtracks} backtracks, ${secs}s`);
	say(`             rings ${patch.rings.map((x) => `r${x.r}:${x.tiles}`).join(' → ')}`);
	say(`             ${census.map((c) => `${SPECIES_LABEL(c.species)}×${c.count}`).join('  ')}`);

	const swatches = census
		.map((c) => `<span class="sw"><i style="background:${fillOf(c.species)}"></i>${SPECIES_LABEL(c.species)}<b>${c.count}</b></span>`)
		.join('');
	cards.push(
		`<figure><div class="svg">${svg}</div><figcaption><b>Patch ${made}</b> · ${patch.placed.length} tiles · ` +
			`${starSpecies.length} star species<br><span class="dim">gap-free to r=${RADIUS} · seed 0x${(seed >>> 0).toString(16)}</span>` +
			`<div class="legend">${swatches}</div></figcaption></figure>`,
	);
}

const totalTiles = [...globalCensus.values()].reduce((s, n) => s + n, 0);
say('');
say(`${made}/${N_WANT} gap-free patches, ${totalTiles} tiles total`);
say(`species used across the gallery: ${globalCensus.size}/${manifest.inRing.length} of the alphabet`);
const unused = manifest.inRing.map((r) => (r.kind === 'regular' ? `${r.n}` : `${r.n}*${r.alphaU}`)).filter((s) => !globalCensus.has(s));
if (unused.length) say(`never placed: ${unused.map(SPECIES_LABEL).join(', ')}`);

const legendAll = manifest.inRing
	.map((r) => { const key = r.kind === 'regular' ? `${r.n}` : `${r.n}*${r.alphaU}`; const used = globalCensus.get(key) ?? 0; return `<span class="sw${used ? '' : ' off'}"><i style="background:${fillOf(key)}"></i>${SPECIES_LABEL(key)}<b>${used || '—'}</b></span>`; })
	.join('');

const gallery = `<!doctype html><meta charset="utf8"><title>Mixed-species star patches</title>
<style>
 body{background:#0d1117;color:#c9d1d9;font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:28px}
 h1{font-size:20px;margin:0 0 4px} p.sub{color:#8b949e;margin:0 0 14px;max-width:78ch}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
 figure{margin:0;background:#161b22;border:1px solid #21262d;border-radius:10px;padding:12px}
 .svg{line-height:0}.svg svg{width:100%;height:auto;border-radius:6px}
 figcaption{margin-top:10px;font-size:13px}.dim{color:#8b949e;font-size:12px}
 code{background:#21262d;padding:1px 5px;border-radius:4px}
 .legend{margin-top:8px;display:flex;flex-wrap:wrap;gap:5px}
 .sw{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#8b949e;background:#0d1117;border:1px solid #21262d;border-radius:20px;padding:1px 7px 1px 3px}
 .sw i{width:11px;height:11px;border-radius:3px;display:inline-block}
 .sw b{color:#c9d1d9;font-weight:600}
 .sw.off{opacity:.35}
 .all{margin:0 0 22px}
</style>
<h1>Mixed-species star patches — every in-ring shape the k ≤ 9 catalogue uses, all at once</h1>
<p class="sub">Grown by wave-function collapse + DFS backtracking in exact ℤ[ζ₂₄], sound non-convex overlap.
Every vertex within radius ${RADIUS} is fully closed: no interior holes, no overlaps, both re-audited from
scratch after growth. The alphabet is the ${manifest.inRing.length} species measured off the star catalogue's
${manifest.starEntriesScanned.toLocaleString('en-US')} entries at k = 1..9 — the regulars {3,4,6,8,12} and 23 isotoxal stars — with no
one-star-per-patch restriction. Not aperiodic: these are random finite patches, nothing is certified.</p>
<div class="legend all">${legendAll}</div>
<div class="grid">${cards.join('\n')}</div>`;
fs.writeFileSync(path.join(OUT, 'gallery.html'), gallery);
say(`\n→ ${OUT}/gallery.html`);

// PNGs alongside the SVGs, matching what the two earlier patch dirs carry. sharp is NOT a declared
// dependency: it arrives transitively from Next's image pipeline on a local install and is absent from a
// clean one, so the raster step is skipped rather than failing the run. In an async tail because the
// script transpiles to CJS, where top-level await is not available.
//
// The specifier is held in a variable on purpose. `next build` type-checks scripts/ too, and a literal
// import('sharp') is resolved at BUILD time, where a missing module is a type error and not a caught
// exception: that failed the Vercel deploy of 240cf44. Runtime behaviour is unchanged.
const SHARP_MODULE = 'sharp';
void (async () => {
	try {
		const sharp = (await import(SHARP_MODULE)).default;
		for (let i = 1; i <= made; i++) {
			const stem = path.join(OUT, `patch-${String(i).padStart(2, '0')}`);
			await sharp(Buffer.from(fs.readFileSync(`${stem}.svg`))).resize(1120).png().toFile(`${stem}.png`);
		}
		say(`rasterised ${made} PNGs at 1120px`);
	} catch (e) {
		say(`PNG step skipped (${(e as Error).message.split('\n')[0]}) — SVGs are unaffected`);
	}
})();
