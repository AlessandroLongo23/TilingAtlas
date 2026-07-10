/*
 * star-patch-growth.ts — THROWAWAY EXPERIMENT (AL request, 2026-07-09)
 *
 * Grows GAP-FREE finite patches of Myers isotoxal star tiles `n*_α` + companion regulars {3,4,6,8,12}
 * from the origin, by wave-function collapse + DFS backtracking, in exact ℤ[ζ₂₄] (N=24, π/12 slots,
 * full turn = 24). NOT aperiodic, nothing certified — random patches.
 *
 * Correctness guarantees (the two bugs the first cut had):
 *  - NO OVERLAPS: every candidate tile is tested (exactPolygonsOverlap, sound for non-convex tiles)
 *    against every placed tile whose circumradius disk can reach it — a bounding-radius broadphase, not
 *    a fixed grid window (a 12-star's points reach ~3u past its centre; a fixed window missed them).
 *  - NO HOLES inside the radius: the growth does not stop until EVERY vertex with |v| ≤ RADIUS is fully
 *    closed (all 24 slots). Multi-gap vertices are filled (not skipped). A dead end backtracks; an
 *    unsatisfiable seed restarts. A patch is emitted ONLY if it reaches a gap-free state — variants that
 *    can't fill a disk are reported, never shown holey.
 *
 * Reuses: ExactStarPolygon.isotoxal (placement), Polygon.cornerAngleUnits (reflex-aware slot widths),
 * exactPolygonsOverlap, enumerateStarVCs/seatFan. One star variant per patch (dent-fillable-by-regular).
 *
 * Run:  pnpm tsx scripts/star-patch-growth.ts
 * Out:  <root>/tmp-star-patches/patch-XX.svg + gallery.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { setActiveRing, CyclotomicRing, Cyclotomic } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes';
import { ExactStarPolygon } from '@/classes/polygons/ExactStarPolygon';
import type { Polygon } from '@/classes/polygons/Polygon';
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';
import { enumerateStarVCs, seatFan, regInteriorU, type StarVC } from '@/classes/algorithm/StarVC';
import { polygonHue, starHue } from '@/utils/renderTiling';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const N = 24;
const ZERO = Cyclotomic.ZERO(ring);

const REG_COMPANIONS = [3, 4, 6, 8, 12]; // n | 24
const RADIUS = 12;          // close EVERY vertex within this radius ⇒ gap-free disk of this radius
const TILE_CAP = 3000;      // safety cap on tiles per attempt (a r=12 disk holds a few hundred+)
const STEP_CAP = 80_000;    // a thrashing attempt fails here and restarts with a fresh seed
const SEQ_CAP = 2500;       // cap on fill-sequence enumeration per gap
const MAX_RESTARTS = 6;     // fresh seeds tried before declaring a variant un-fillable
const VARIANT_BUDGET_MS = 40_000; // give up on a variant after this wall-clock (chronological backtracking
                                  //   thrashes on the constraint-tight variants at r=12); skip it
const N_WANT = 10;          // target number of gap-free patches for the gallery

// Candidate star variants (all dent-fillable-by-a-regular), ordered best-filler-first from the earlier
// experiment. We walk this pool, one variant per patch, until N_WANT gap-free patches are produced.
const VARIANT_POOL: { n: number; alphaU: number }[] = [
	// scale-friendly first (near-forced growth, little backtracking at r=6)
	{ n: 6, alphaU: 4 }, { n: 4, alphaU: 4 }, { n: 4, alphaU: 3 }, { n: 8, alphaU: 6 }, { n: 12, alphaU: 6 },
	{ n: 6, alphaU: 6 }, { n: 4, alphaU: 2 }, { n: 12, alphaU: 2 }, { n: 3, alphaU: 2 }, { n: 12, alphaU: 4 },
	// fallbacks (were un-fillable at r=6; kept in case a bigger disk behaves differently)
	{ n: 6, alphaU: 5 }, { n: 8, alphaU: 5 }, { n: 6, alphaU: 2 }, { n: 3, alphaU: 1 }, { n: 8, alphaU: 7 },
	{ n: 12, alphaU: 7 }, { n: 8, alphaU: 3 }, { n: 8, alphaU: 1 }, { n: 12, alphaU: 8 },
];

// ---------------------------------------------------------------------------------------------
function mulberry32(a: number): () => number {
	return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(arr: T[], rnd: () => number): T[] { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

interface Corner { tag: string; isStar: boolean; n: number; alphaU: number; width: number; }
interface Placed { poly: Polygon; isStar: boolean; n: number; corners: { key: string; start: number; width: number }[]; id: string; cx: number; cy: number; br: number; fv: { x: number; y: number }[]; }
interface VState { exact: Cyclotomic; r: number; slots: boolean[] }
interface Frame { key: string; gapStart: number; cands: Corner[][]; idx: number; added: Placed[]; edits: { k: string; slot: number }[]; }

// ---------------------------------------------------------------------------------------------
class StarPatch {
	verts = new Map<string, VState>();
	placed: Placed[] = [];
	ids = new Set<string>();
	grid = new Map<string, Placed[]>(); // centroid buckets (cell size 1) for the overlap broadphase
	maxBr = 0;                           // largest tile bounding radius placed so far
	rnd: () => number;
	corners: Corner[];
	widths: number[];
	reachable: boolean[];
	seqMemo = new Map<number, Corner[][]>();
	seedVC = '';
	seqCapped = false;
	backtracks = 0;

	constructor(seed: number, readonly variant: { n: number; alphaU: number }) {
		this.rnd = mulberry32(seed);
		this.corners = [];
		for (const n of REG_COMPANIONS) this.corners.push({ tag: `${n}`, isStar: false, n, alphaU: 0, width: regInteriorU(n) });
		this.corners.push({ tag: `${variant.n}*p@${variant.alphaU}`, isStar: true, n: variant.n, alphaU: variant.alphaU, width: variant.alphaU });
		this.widths = [...new Set(this.corners.map((c) => c.width))].sort((a, b) => a - b);
		this.reachable = new Array(N + 1).fill(false); this.reachable[0] = true;
		for (let g = 1; g <= N; g++) for (const w of this.widths) if (w <= g && this.reachable[g - w]) { this.reachable[g] = true; break; }
	}

	private place(c: Corner, V: Cyclotomic, dir: number): Polygon {
		return c.isStar ? ExactStarPolygon.isotoxal(c.n, c.alphaU, V, dir) : RegularPolygon.fromAnchorAndDirExact(c.n, V, dir);
	}

	private wrap(poly: Polygon): Placed {
		const ev = poly.exactVertices!;
		const corners = ev.map((v, i) => ({ key: v.key(), start: poly.edgeDirs![i], width: poly.cornerAngleUnits(i) }));
		const cen = poly.centroid;
		const fv = ev.map((v) => { const p = v.toVector(); return { x: p.x, y: p.y }; });
		let br = 0; for (const p of fv) br = Math.max(br, Math.hypot(p.x - cen.x, p.y - cen.y));
		return { poly, isStar: !!poly.isStar, n: poly.n, corners, id: poly.exactKey(), cx: cen.x, cy: cen.y, br, fv };
	}

	private getVert(key: string, exact: Cyclotomic): VState {
		let s = this.verts.get(key);
		if (!s) { const p = exact.toVector(); s = { exact, r: Math.hypot(p.x, p.y), slots: new Array(N).fill(false) }; this.verts.set(key, s); }
		return s;
	}

	private cellKey(cx: number, cy: number): string { return `${Math.floor(cx)},${Math.floor(cy)}`; }

	/** slot pre-check (no double-booked wedge) + EXACT non-convex overlap vs every tile whose bounding
	 *  disk can reach t (grid broadphase: any overlapper's centroid is within t.br + maxBr of t's). */
	private fits(t: Placed): boolean {
		if (this.ids.has(t.id)) return false;
		for (const c of t.corners) { const ex = this.verts.get(c.key); if (!ex) continue; for (let s = 0; s < c.width; s++) if (ex.slots[(c.start + s) % N]) return false; }
		const reach = t.br + this.maxBr + 1e-9;
		const gx0 = Math.floor(t.cx - reach), gx1 = Math.floor(t.cx + reach);
		const gy0 = Math.floor(t.cy - reach), gy1 = Math.floor(t.cy + reach);
		for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
			const cell = this.grid.get(`${gx},${gy}`); if (!cell) continue;
			for (const o of cell) {
				if (o.id === t.id) continue;
				if (Math.hypot(t.cx - o.cx, t.cy - o.cy) > t.br + o.br + 1e-9) continue; // disks disjoint ⇒ cannot overlap
				if (exactPolygonsOverlap(t.poly.exactVertices!, o.poly.exactVertices!)) return false;
			}
		}
		return true;
	}

	private commit(t: Placed): { k: string; slot: number }[] {
		this.placed.push(t); this.ids.add(t.id);
		const ck = this.cellKey(t.cx, t.cy); const cell = this.grid.get(ck); if (cell) cell.push(t); else this.grid.set(ck, [t]);
		if (t.br > this.maxBr) this.maxBr = t.br;
		const edits: { k: string; slot: number }[] = [];
		for (let i = 0; i < t.corners.length; i++) { const c = t.corners[i]; const vs = this.getVert(c.key, t.poly.exactVertices![i]); for (let s = 0; s < c.width; s++) { const slot = (c.start + s) % N; if (!vs.slots[slot]) { vs.slots[slot] = true; edits.push({ k: c.key, slot }); } } }
		return edits;
	}

	private uncommit(added: Placed[], edits: { k: string; slot: number }[]): void {
		for (const e of edits) { const vs = this.verts.get(e.k); if (vs) vs.slots[e.slot] = false; }
		for (const t of added) { this.ids.delete(t.id); const cell = this.grid.get(this.cellKey(t.cx, t.cy)); if (cell) { const i = cell.indexOf(t); if (i >= 0) cell.splice(i, 1); } }
		this.placed.length -= added.length; // added tiles were appended contiguously
		for (const t of added) for (const c of t.corners) { const vs = this.verts.get(c.key); if (vs && vs.slots.every((b) => !b)) this.verts.delete(c.key); }
	}

	private gaps(slots: boolean[]): { start: number; len: number }[] {
		const out: { start: number; len: number }[] = [];
		let empty = 0; for (const b of slots) if (!b) empty++;
		if (empty === 0 || empty === N) return out;
		for (let i = 0; i < N; i++) if (!slots[i] && slots[(i - 1 + N) % N]) { let len = 0; for (let j = 0; j < N && !slots[(i + j) % N]; j++) len++; out.push({ start: i, len }); }
		return out;
	}

	/** any touched in-radius vertex left with a gap no corner-width sum can fill ⇒ this branch is doomed. */
	private createsUnfillable(keys: Iterable<string>): boolean {
		for (const k of keys) { const vs = this.verts.get(k); if (!vs || vs.r > RADIUS) continue; for (const g of this.gaps(vs.slots)) if (!this.reachable[g.len]) return true; }
		return false;
	}

	private fillSeqs(g: number): Corner[][] {
		const memo = this.seqMemo.get(g); if (memo) return memo;
		const out: Corner[][] = [];
		const rec = (rem: number, acc: Corner[]) => {
			if (out.length >= SEQ_CAP) { this.seqCapped = true; return; }
			if (rem === 0) { out.push(acc.slice()); return; }
			for (const c of this.corners) {
				if (c.width > rem) continue;
				if (c.isStar && acc.length && acc[acc.length - 1].isStar) continue; // Myers: no two adjacent points
				acc.push(c); rec(rem - c.width, acc); acc.pop();
				if (out.length >= SEQ_CAP) return;
			}
		};
		rec(g, []);
		this.seqMemo.set(g, out);
		return out;
	}

	seed(): void {
		const pool = enumerateStarVCs({ variants: [this.variant] }).filter((vc) => vc.tokens.some((t) => t.kind === 'pt'));
		const vc: StarVC = pool[Math.floor(this.rnd() * pool.length)];
		for (const p of seatFan(vc.tokens, ZERO, 0)) this.commit(this.wrap(p));
		this.seedVC = vc.name;
	}

	/** Next in-radius vertex/gap to fill. FORCED moves first (a gap with ≤1 combinatorial fill — unit
	 *  propagation, no branching, cuts backtracking), else the CLOSEST-to-origin open vertex (closest-first
	 *  keeps the filled region hole-free). 'done' when no vertex within the radius is still open. */
	private pick(): { key: string; exact: Cyclotomic; gap: { start: number; len: number } } | 'done' {
		type C = { key: string; exact: Cyclotomic; gap: { start: number; len: number }; ent: number; r: number };
		let forced: C | null = null, closest: C | null = null;
		for (const [key, vs] of this.verts) {
			if (vs.r > RADIUS) continue; // fill only inside the radius; the exterior frontier stays open
			const gs = this.gaps(vs.slots); if (gs.length === 0) continue;
			let gEnt = Infinity, gBest = gs[0];
			for (const g of gs) { const e = this.fillSeqs(g.len).length; if (e < gEnt) { gEnt = e; gBest = g; } }
			const cand: C = { key, exact: vs.exact, gap: gBest, ent: gEnt, r: vs.r };
			if (gEnt <= 1 && (!forced || vs.r < forced.r)) forced = cand;
			if (!closest || vs.r < closest.r || (vs.r === closest.r && gEnt < closest.ent)) closest = cand;
		}
		if (forced) return forced;
		if (!closest) return 'done';
		return closest;
	}

	/** Try candidates of a frame from idx+1; commit the first that fits and creates no unfillable gap. */
	private step(f: Frame, exact: Cyclotomic): boolean {
		for (let i = f.idx + 1; i < f.cands.length; i++) {
			const seq = f.cands[i];
			let dir = f.gapStart; const added: Placed[] = []; const edits: { k: string; slot: number }[] = []; let ok = true;
			for (const c of seq) {
				const t = this.wrap(this.place(c, exact, dir));
				if (!this.fits(t)) { ok = false; break; }
				edits.push(...this.commit(t)); added.push(t); dir = (dir + c.width) % N;
			}
			if (ok) { const touched = new Set<string>(); for (const t of added) for (const c of t.corners) touched.add(c.key); if (this.createsUnfillable(touched)) ok = false; }
			if (!ok) { this.uncommit(added, edits); continue; }
			f.idx = i; f.added = added; f.edits = edits; return true;
		}
		return false;
	}

	/** One attempt from a fresh seed. Returns true iff a gap-free (all in-radius closed) state is reached.
	 *  Bails at `deadline` (ms epoch) so a single thrashing attempt can't run unbounded. */
	attempt(deadline: number): boolean {
		this.seed();
		const stack: Frame[] = [];
		let steps = 0;
		while (steps++ < STEP_CAP) {
			if ((steps & 2047) === 0 && Date.now() > deadline) return false;
			if (this.placed.length >= TILE_CAP) return false;
			const p = this.pick();
			if (p === 'done') return true;
			{
				const f: Frame = { key: p.key, gapStart: p.gap.start, cands: shuffle(this.fillSeqs(p.gap.len), this.rnd), idx: -1, added: [], edits: [] };
				if (this.step(f, p.exact)) { stack.push(f); continue; }
			}
			// dead end (fresh frame with no workable candidate) → backtrack the stack
			let recovered = false;
			while (stack.length > 0) {
				const top = stack[stack.length - 1];
				this.uncommit(top.added, top.edits); top.added = []; top.edits = [];
				this.backtracks++;
				const ex = this.verts.get(top.key)?.exact ?? this.reconstruct(top.key);
				if (ex && this.step(top, ex)) { recovered = true; break; }
				stack.pop();
			}
			if (!recovered && stack.length === 0) return false; // exhausted — restart with a new seed
		}
		return false;
	}

	// after uncommit a frame's vertex may have been deleted (all slots cleared); its exact form is the
	// same Cyclotomic the frame collapsed — recover it from any placed tile still carrying that key, else
	// it was the collapse anchor which is still a corner of the tiles below it on the stack.
	private reconstruct(key: string): Cyclotomic | null {
		for (const t of this.placed) for (let i = 0; i < t.corners.length; i++) if (t.corners[i].key === key) return t.poly.exactVertices![i];
		return null;
	}

	/** Independent post-hoc audit of the finished patch — the correctness evidence, computed from
	 *  scratch (not the incremental bookkeeping): count overlapping tile pairs and open in-radius
	 *  vertices. A valid gap-free patch has BOTH zero. */
	verify(): { overlaps: number; openInR: number } {
		let overlaps = 0;
		for (let i = 0; i < this.placed.length; i++) for (let j = i + 1; j < this.placed.length; j++) {
			const a = this.placed[i], b = this.placed[j];
			if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > a.br + b.br + 1e-9) continue;
			if (exactPolygonsOverlap(a.poly.exactVertices!, b.poly.exactVertices!)) overlaps++;
		}
		// A genuine interior hole = an open vertex STRICTLY inside the disk (r ≤ RADIUS−1, a full edge in
		// from the boundary) — immune to the float fuzz of vertices sitting right on the radius, which are
		// the ragged boundary and are allowed to stay open.
		let openInR = 0;
		for (const vs of this.verts.values()) if (vs.r <= RADIUS - 1 && this.gaps(vs.slots).length > 0) openInR++;
		return { overlaps, openInR };
	}

	svg(size: number): string {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const t of this.placed) for (const p of t.fv) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
		const w = maxX - minX, h = maxY - minY, pad = 0.6;
		const scale = (size - 20) / (Math.max(w, h) + 2 * pad);
		const ox = 10 - (minX - pad) * scale, oy = 10 - (minY - pad) * scale;
		const tx = (x: number) => (x * scale + ox).toFixed(2);
		const ty = (y: number) => (size - (y * scale + oy)).toFixed(2);
		const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`, `<rect width="${size}" height="${size}" fill="#0d1117"/>`];
		for (const t of this.placed) {
			const hue = t.isStar ? starHue(t.n) : polygonHue(t.n);
			const fill = t.isStar ? `hsl(${hue.toFixed(0)} 78% 62%)` : `hsl(${hue.toFixed(0)} 55% 55%)`;
			const pts = t.fv.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ');
			parts.push(`<polygon points="${pts}" fill="${fill}" stroke="#0d1117" stroke-width="0.8" stroke-linejoin="round"/>`);
		}
		parts.push('</svg>');
		return parts.join('');
	}
}

// ---------------------------------------------------------------------------------------------
const OUT = path.join(process.cwd(), 'tmp-star-patches');
fs.mkdirSync(OUT, { recursive: true });
const cards: string[] = [];
let made = 0;
console.log(`star-patch-growth — target ${N_WANT} GAP-FREE patches, close-radius ${RADIUS}, ${MAX_RESTARTS} restarts/variant\n`);
for (const variant of VARIANT_POOL) {
	if (made >= N_WANT) break;
	const vname = `${variant.n}*_${variant.alphaU}`;
	let ok: StarPatch | null = null;
	const t0 = Date.now();
	let attempts = 0, totalBt = 0;
	const varDeadline = t0 + VARIANT_BUDGET_MS;
	for (let r = 0; r < MAX_RESTARTS; r++) {
		if (Date.now() > varDeadline) break; // wall-clock guard — skip a thrashing variant
		attempts++;
		const patch = new StarPatch(0x3000 + made * 0x9e37 + r * 0x2545f, variant);
		if (patch.attempt(varDeadline)) { ok = patch; totalBt = patch.backtracks; break; }
		totalBt += patch.backtracks;
	}
	const secs = ((Date.now() - t0) / 1000).toFixed(2);
	if (!ok) { console.log(`  ${vname.padEnd(7)}: ✗ no gap-free disk in ${attempts} restarts (${secs}s) — skipped`); continue; }
	const audit = ok.verify();
	if (audit.overlaps !== 0 || audit.openInR !== 0) { console.log(`  ${vname.padEnd(7)}: ⚑ AUDIT FAIL — ${audit.overlaps} overlaps, ${audit.openInR} open in-radius vertices — NOT emitted`); continue; }
	made++;
	const stars = ok.placed.filter((t) => t.isStar).length;
	const svg = ok.svg(560);
	const file = `patch-${String(made).padStart(2, '0')}.svg`;
	fs.writeFileSync(path.join(OUT, file), svg);
	console.log(`  ${vname.padEnd(7)}: ✓ ${String(ok.placed.length).padStart(3)} tiles (${stars} stars), audit OK (0 overlaps, 0 holes), ${attempts} attempt(s), ${totalBt} backtracks, ${secs}s${ok.seqCapped ? ' [SEQ-CAP]' : ''}`);
	cards.push(`<figure><div class="svg">${svg}</div><figcaption><b>Patch ${made}</b> · star <code>${vname}</code> · ${ok.placed.length} tiles (${stars} stars)<br><span class="dim">gap-free to r=${RADIUS} · seed VC ${ok.seedVC}</span></figcaption></figure>`);
}
const gallery = `<!doctype html><meta charset="utf8"><title>Gap-free star patches</title>
<style>
 body{background:#0d1117;color:#c9d1d9;font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:28px}
 h1{font-size:20px;margin:0 0 4px} p.sub{color:#8b949e;margin:0 0 22px;max-width:74ch}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}
 figure{margin:0;background:#161b22;border:1px solid #21262d;border-radius:10px;padding:12px}
 .svg{line-height:0}.svg svg{width:100%;height:auto;border-radius:6px}
 figcaption{margin-top:10px;font-size:13px}.dim{color:#8b949e;font-size:12px}code{background:#21262d;padding:1px 5px;border-radius:4px}
</style>
<h1>Gap-free star patches — WFC + DFS, closed to radius ${RADIUS}</h1>
<p class="sub">Myers isotoxal star tiles <code>n*_α</code> (bright) + companion regulars {3,4,6,8,12} (muted),
exact ℤ[ζ₂₄], sound non-convex overlap. Every vertex within the radius is fully closed — no interior holes,
no overlaps. One star variant per patch. Not aperiodic — random finite patches.</p>
<div class="grid">${cards.join('\n')}</div>`;
fs.writeFileSync(path.join(OUT, 'gallery.html'), gallery);
console.log(`\n${made}/${N_WANT} gap-free patches → ${OUT}/gallery.html`);
