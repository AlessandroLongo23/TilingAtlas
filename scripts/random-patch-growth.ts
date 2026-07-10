/*
 * random-patch-growth.ts — THROWAWAY EXPERIMENT (AL request, 2026-07-08)
 *
 * Grows random NON-PERIODIC finite patches of regular {3,4,6,12} polygons from the origin by
 * wave-function collapse + DFS backtracking. NOT aperiodic tilings (every local config here also
 * appears in periodic tilings); these are random patches, nothing is certified.
 *
 * Coordinates are exact ℤ[ζ₁₂] (N=12; octagon excluded ⇒ 12 directions suffice), so "same vertex"
 * is exact Cyclotomic equality — no float snapping. Reuses RegularPolygon.fromAnchorAndDirExact for
 * placement and renderTiling's hue ramp for colour.
 *
 * Run:  pnpm tsx scripts/random-patch-growth.ts
 * Out:  <scratchpad>/patches/patch-XX.svg + gallery.html
 *
 * Model: the vertex circle is 12 slots of 30°. Tile interior angles in slots: 3→2, 4→3, 6→4, 12→5.
 * A vertex is CLOSED when all 12 slots are covered. An open vertex has one gap (a run of empty
 * slots). "Collapse" fills that gap with an ordered sequence of tiles whose slot-sums hit the gap
 * exactly. The one unfillable state is a 1-slot (30°) gap — that triggers backtracking.
 */
import fs from 'node:fs';
import path from 'node:path';
import { setActiveRing, CyclotomicRing, Cyclotomic } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes';
import { polygonHue } from '@/utils/renderTiling';

const ring = CyclotomicRing.create(12);
setActiveRing(ring);
const N = 12;
const ZERO = Cyclotomic.ZERO(ring);

// Tile interior angle in 30° slots, and the CCW exterior turn per edge (also in slots).
const STEPS: Record<number, number> = { 3: 2, 4: 3, 6: 4, 12: 5 };
const TURN: Record<number, number> = { 3: 4, 4: 3, 6: 2, 12: 1 };
const PART_TO_N: Record<number, number> = { 2: 3, 3: 4, 4: 6, 5: 12 };
const PARTS = [2, 3, 4, 5]; // allowed slot-widths = the four tiles

// Growth thresholds (completeness is irrelevant here — these just bound a nice disk).
const RADIUS = 9;        // collapse only open vertices within this many edge-lengths of origin
const TILE_CAP = 600;    // hard safety cap on tiles per patch
const STEP_CAP = 400_000; // hard safety cap on collapse/backtrack steps per patch
const N_PATCHES = 10;

// ---------------------------------------------------------------------------------------------
// Deterministic RNG (mulberry32) so every patch is regenerable from its printed seed.
// ---------------------------------------------------------------------------------------------
function mulberry32(a: number): () => number {
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function shuffle<T>(arr: T[], rnd: () => number): T[] {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
	return a;
}

// ---------------------------------------------------------------------------------------------
// Compositions of `g` into an ordered list of parts drawn from {2,3,4,5}. Memoised.
// ---------------------------------------------------------------------------------------------
const compMemo = new Map<number, number[][]>();
function compositions(g: number): number[][] {
	if (g <= 0) return [[]];
	const memo = compMemo.get(g);
	if (memo) return memo;
	const out: number[][] = [];
	for (const p of PARTS) {
		if (p > g) continue;
		for (const rest of compositions(g - p)) out.push([p, ...rest]);
	}
	compMemo.set(g, out);
	return out;
}

// ---------------------------------------------------------------------------------------------
// A placed tile + the per-corner state of the growing patch.
// ---------------------------------------------------------------------------------------------
interface Placed { n: number; ev: Cyclotomic[]; edgeDirs: number[]; id: string; cell: string; cx: number; cy: number; fv: { x: number; y: number }[]; }
interface VState { exact: Cyclotomic; x: number; y: number; r: number; slots: boolean[]; }

function tilePlacement(n: number, anchor: Cyclotomic, dir0: number): Placed {
	const poly = RegularPolygon.fromAnchorAndDirExact(n, anchor, dir0);
	const ev = poly.exactVertices!;
	const turn = TURN[n];
	const edgeDirs = ev.map((_, i) => (((dir0 + i * turn) % N) + N) % N);
	const fv = ev.map((v) => { const p = v.toVector(); return { x: p.x, y: p.y }; });
	const id = ev.map((v) => v.key()).sort().join('|');
	const c = poly.centroid;
	return { n, ev, edgeDirs, id, cell: `${Math.round(c.x)},${Math.round(c.y)}`, cx: c.x, cy: c.y, fv };
}

class Patch {
	verts = new Map<string, VState>();
	placed: Placed[] = [];
	ids = new Set<string>();
	grid = new Map<string, Placed[]>();
	rnd: () => number;

	constructor(seed: number) { this.rnd = mulberry32(seed); }

	private getVert(v: Cyclotomic): VState {
		const k = v.key();
		let s = this.verts.get(k);
		if (!s) { const p = v.toVector(); s = { exact: v, x: p.x, y: p.y, r: Math.hypot(p.x, p.y), slots: new Array(N).fill(false) }; this.verts.set(k, s); }
		return s;
	}

	/** Would every slot this tile claims (at all its corners) be free, and no body-overlap nearby? */
	private tileFits(t: Placed, pending: Map<string, Set<number>>): boolean {
		if (this.ids.has(t.id)) return false;
		for (let i = 0; i < t.n; i++) {
			const k = t.ev[i].key();
			const existing = this.verts.get(k);
			const pend = pending.get(k);
			for (let s = 0; s < STEPS[t.n]; s++) {
				const slot = (t.edgeDirs[i] + s) % N;
				if (existing && existing.slots[slot]) return false;
				if (pend && pend.has(slot)) return false;
			}
		}
		// proximity body-overlap net (slot bookkeeping already blocks vertex-incident overlaps)
		const [gx, gy] = t.cell.split(',').map(Number);
		for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
			const near = this.grid.get(`${gx + dx},${gy + dy}`);
			if (!near) continue;
			for (const o of near) if (o.id !== t.id && this.overlaps(t, o)) return false;
		}
		return true;
	}

	// Coarse body-overlap net only (the exact slot bookkeeping is the real guard for vertex-incident
	// tiles). Valid edge/vertex-adjacent tiles sit at ≥ incircle-sum centroid distance; flag only
	// clear interpenetration (margin 0.05) so no valid placement is ever falsely rejected.
	private overlaps(a: Placed, b: Placed): boolean {
		const inR = (n: number) => 0.5 / Math.tan(Math.PI / n);
		const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
		return d < inR(a.n) + inR(b.n) - 0.05;
	}

	private commit(t: Placed): { k: string; slot: number }[] {
		this.placed.push(t); this.ids.add(t.id);
		const cellArr = this.grid.get(t.cell) ?? []; cellArr.push(t); this.grid.set(t.cell, cellArr);
		const edits: { k: string; slot: number }[] = [];
		for (let i = 0; i < t.n; i++) {
			const vs = this.getVert(t.ev[i]);
			for (let s = 0; s < STEPS[t.n]; s++) { const slot = (t.edgeDirs[i] + s) % N; if (!vs.slots[slot]) { vs.slots[slot] = true; edits.push({ k: t.ev[i].key(), slot }); } }
		}
		return edits;
	}

	private uncommit(added: Placed[], edits: { k: string; slot: number }[]): void {
		for (const e of edits) { const vs = this.verts.get(e.k); if (vs) vs.slots[e.slot] = false; }
		for (const t of added) {
			this.ids.delete(t.id);
			const cellArr = this.grid.get(t.cell); if (cellArr) { const i = cellArr.indexOf(t); if (i >= 0) cellArr.splice(i, 1); }
		}
		this.placed.length -= added.length; // added tiles were appended contiguously at the end
		for (const t of added) for (const v of t.ev) { const k = v.key(); const vs = this.verts.get(k); if (vs && vs.slots.every((b) => !b)) this.verts.delete(k); }
	}

	/** The single gap of an open vertex: [start, len] where start-1 is filled and the run is empty.
	 *  Returns null if the vertex is closed or has more than one gap (left for neighbours to reduce). */
	private gapOf(vs: VState): { start: number; len: number } | null {
		const s = vs.slots;
		let empties = 0; for (const b of s) if (!b) empties++;
		if (empties === 0 || empties === N) return empties === N ? { start: 0, len: N } : null;
		// count maximal empty runs; require exactly one
		let runs = 0, start = -1;
		for (let i = 0; i < N; i++) if (!s[i] && s[(i - 1 + N) % N]) { runs++; start = i; }
		if (runs !== 1) return null;
		let len = 0; for (let i = 0; i < N && !s[(start + i) % N]; i++) len++;
		return { start, len };
	}

	/** Any vertex with a 1-slot (30°) empty run is a permanent dead end. */
	private hasUnfillable(keys: string[]): boolean {
		for (const k of keys) {
			const vs = this.verts.get(k); if (!vs) continue;
			for (let i = 0; i < N; i++) if (!vs.slots[i] && vs.slots[(i - 1 + N) % N] && vs.slots[(i + 1) % N]) return true;
		}
		return false;
	}

	// seed the origin with one random full vertex figure (random composition of the full 360°)
	seed(): void {
		const seeds = compositions(N);
		const comp = seeds[Math.floor(this.rnd() * seeds.length)];
		let dir = 0; const added: Placed[] = []; const edits: { k: string; slot: number }[] = [];
		for (const part of comp) { const t = tilePlacement(PART_TO_N[part], ZERO, dir); added.push(t); edits.push(...this.commit(t)); dir = (dir + part) % N; }
		this.seedComp = comp;
	}
	seedComp: number[] = [];

	/** Choose the open vertex to collapse: min entropy (fewest completions), tie-break nearest. */
	private select(tried: Map<string, Set<string>>): { vs: VState; gap: { start: number; len: number }; ent: number } | null {
		let best: { vs: VState; gap: { start: number; len: number }; ent: number } | null = null;
		for (const vs of this.verts.values()) {
			if (vs.r > RADIUS) continue;
			const gap = this.gapOf(vs); if (!gap || gap.len < 2 || gap.len === N) continue;
			const comps = compositions(gap.len);
			const t = tried.get(vs.exact.key());
			const remaining = t ? comps.filter((c) => !t.has(c.join(','))).length : comps.length;
			if (remaining === 0) continue;
			const ent = comps.length;
			if (!best || ent < best.ent || (ent === best.ent && vs.r < best.vs.r)) best = { vs, gap, ent };
		}
		return best;
	}

	/** Grow until the disk is full or a cap trips. Returns per-patch stats. */
	grow(): { tiles: number; steps: number; backtracks: number; capped: boolean } {
		this.seed();
		interface Frame { key: string; comp: number[]; added: Placed[]; edits: { k: string; slot: number }[]; }
		const stack: Frame[] = [];
		const tried = new Map<string, Set<string>>();
		const markTried = (key: string, comp: number[]) => { let s = tried.get(key); if (!s) { s = new Set(); tried.set(key, s); } s.add(comp.join(',')); };
		let steps = 0, backtracks = 0, capped = false;

		while (steps++ < STEP_CAP) {
			if (this.placed.length >= TILE_CAP) { capped = true; break; }
			const sel = this.select(tried);
			if (!sel) break; // disk full — nothing left to collapse within RADIUS
			const key = sel.vs.exact.key();
			const triedHere = tried.get(key) ?? new Set<string>();
			const comps = shuffle(compositions(sel.gap.len).filter((c) => !triedHere.has(c.join(','))), this.rnd);

			let placed = false;
			for (const comp of comps) {
				// build the placement for this composition, filling the gap from its start slot
				let dir = sel.gap.start; const tiles: Placed[] = []; const pending = new Map<string, Set<number>>(); let ok = true;
				for (const part of comp) {
					const t = tilePlacement(PART_TO_N[part], sel.vs.exact, dir);
					if (!this.tileFits(t, pending)) { ok = false; break; }
					for (let i = 0; i < t.n; i++) { const k = t.ev[i].key(); let ps = pending.get(k); if (!ps) { ps = new Set(); pending.set(k, ps); } for (let s = 0; s < STEPS[t.n]; s++) ps.add((t.edgeDirs[i] + s) % N); }
					tiles.push(t); dir = (dir + part) % N;
				}
				if (!ok) { markTried(key, comp); continue; }
				// commit, then reject if it created a 30° dead end at any touched vertex
				const edits: { k: string; slot: number }[] = []; for (const t of tiles) edits.push(...this.commit(t));
				const touched = new Set<string>(); for (const t of tiles) for (const v of t.ev) touched.add(v.key());
				if (this.hasUnfillable([...touched])) { this.uncommit(tiles, edits); markTried(key, comp); continue; }
				stack.push({ key, comp, added: tiles, edits }); placed = true; break;
			}

			if (placed) continue;
			// dead end at this vertex → backtrack the previous collapse
			if (stack.length === 0) break; // seed itself is stuck (extremely rare) — accept what we have
			const fr = stack.pop()!; this.uncommit(fr.added, fr.edits); markTried(fr.key, fr.comp); backtracks++;
		}
		return { tiles: this.placed.length, steps, backtracks, capped };
	}

	// -----------------------------------------------------------------------------------------
	// SVG
	// -----------------------------------------------------------------------------------------
	vcHistogram(): Map<number, number> {
		const h = new Map<number, number>();
		for (const vs of this.verts.values()) { if (vs.slots.every((b) => b)) { const deg = this.closedDegree(vs); h.set(deg, (h.get(deg) ?? 0) + 1); } }
		return h;
	}
	private closedDegree(vs: VState): number {
		// number of tile-corners meeting at this closed vertex (each tile contributes STEPS slots)
		let corners = 0;
		for (const t of this.placed) for (const v of t.ev) if (v.key() === vs.exact.key()) corners++;
		return corners;
	}

	svg(size: number): string {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const t of this.placed) for (const p of t.fv) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
		const w = maxX - minX, h = maxY - minY, pad = 0.5;
		const scale = (size - 20) / (Math.max(w, h) + 2 * pad);
		const ox = 10 - (minX - pad) * scale, oy = 10 - (minY - pad) * scale;
		const tx = (x: number) => (x * scale + ox).toFixed(2);
		const ty = (y: number) => (size - (y * scale + oy)).toFixed(2); // flip Y for screen
		const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`, `<rect width="${size}" height="${size}" fill="#0d1117"/>`];
		for (const t of this.placed) {
			const hue = polygonHue(t.n);
			const pts = t.fv.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ');
			parts.push(`<polygon points="${pts}" fill="hsl(${hue.toFixed(0)} 62% 58%)" stroke="#0d1117" stroke-width="0.9" stroke-linejoin="round"/>`);
		}
		parts.push('</svg>');
		return parts.join('');
	}
}

// ---------------------------------------------------------------------------------------------
// Drive: 10 patches → SVGs + gallery
// ---------------------------------------------------------------------------------------------
const OUT = path.join(process.cwd(), 'tmp-patches');
fs.mkdirSync(OUT, { recursive: true });

const cards: string[] = [];
console.log(`random-patch-growth — ${N_PATCHES} patches, radius ${RADIUS}, tile cap ${TILE_CAP}\n`);
for (let i = 0; i < N_PATCHES; i++) {
	const seed = 0x1000 + i * 0x9e37;
	const patch = new Patch(seed);
	const t0 = Date.now();
	const stats = patch.grow();
	const svg = patch.svg(460);
	const file = `patch-${String(i + 1).padStart(2, '0')}.svg`;
	fs.writeFileSync(path.join(OUT, file), svg);
	const hist = [...patch.vcHistogram().entries()].sort((a, b) => a[0] - b[0]).map(([deg, c]) => `${deg}-valent×${c}`).join(', ');
	const seedName = patch.seedComp.map((p) => PART_TO_N[p]).join('.');
	console.log(`  patch ${String(i + 1).padStart(2, '0')}: seed 0x${seed.toString(16)} start-vertex ${seedName.padEnd(14)} → ${String(stats.tiles).padStart(3)} tiles, ${stats.backtracks} backtracks, ${((Date.now() - t0) / 1000).toFixed(2)}s${stats.capped ? ' [TILE CAP]' : ''}`);
	cards.push(`<figure><div class="svg">${svg}</div><figcaption><b>Patch ${i + 1}</b> · ${stats.tiles} tiles · seed vertex ${seedName}<br><span class="dim">closed vertices: ${hist || '—'} · ${stats.backtracks} backtracks</span></figcaption></figure>`);
}

const gallery = `<!doctype html><meta charset="utf8"><title>Random non-periodic patches</title>
<style>
 body{background:#0d1117;color:#c9d1d9;font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:28px}
 h1{font-size:20px;margin:0 0 4px} p.sub{color:#8b949e;margin:0 0 22px;max-width:70ch}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}
 figure{margin:0;background:#161b22;border:1px solid #21262d;border-radius:10px;padding:12px}
 .svg{line-height:0}.svg svg{width:100%;height:auto;border-radius:6px}
 figcaption{margin-top:10px;font-size:13px}.dim{color:#8b949e;font-size:12px}
 code{background:#21262d;padding:1px 5px;border-radius:4px}
</style>
<h1>Random non-periodic patches — WFC + DFS from the origin</h1>
<p class="sub">Tiles {3,4,6,12}, exact ℤ[ζ₁₂] coordinates. Grown by wave-function collapse: min-entropy open
vertex first, nearest-to-origin tie-break, backtracking on any 30° dead-end. These are <i>not</i> aperiodic —
every local patch here also tiles periodically. Colour = polygon by the atlas hue ramp (green 3-gon → red 12-gon).</p>
<div class="grid">${cards.join('\n')}</div>`;
fs.writeFileSync(path.join(OUT, 'gallery.html'), gallery);
console.log(`\nWrote ${N_PATCHES} SVGs + gallery.html to:\n  ${OUT}/gallery.html`);
