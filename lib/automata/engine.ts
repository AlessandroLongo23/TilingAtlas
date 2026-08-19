// The simulator. Unbounded by default; a torus only when you ask for one.
//
// WHY UNBOUNDED IS THE DEFAULT. A torus caps growth and wraps a glider back into its own wake, so the
// phenomenology you actually want to watch — a pattern expanding into empty space, a spaceship leaving —
// is exactly what a torus destroys. The plane is the theoretical object; the torus is a lens on it.
//
// HOW IT IS FAST. Three ideas, all of which survive the move from the square grid to an arbitrary tiling
// because the tiling is PERIODIC (see lib/automata/adjacency.ts):
//
//  1. BLOCKS, ALLOCATED ON DEMAND. The board is a sparse map of 32×32-lattice-cell blocks. Empty space
//     costs nothing, and the pattern grows the board by allocating neighbours as it reaches a border.
//     This is what makes "infinite plane" mean unbounded rather than a big fixed array.
//
//  2. GATHER-INTO-A-HALO, THEN A FLAT INNER LOOP. Each block is copied into a padded scratch buffer with
//     an R-cell border of its neighbours' contents. Because adjacency is translation-invariant, a
//     neighbour's position in that buffer is a CONSTANT byte offset from the cell's own — precomputed once
//     per tiling into `offsets`. So the update is `for k: count += src[base + off[k]] === 1`, with no
//     hash lookup, no bounds test and no per-cell adjacency list. This is QuickLife's tile-with-border
//     idea (Rokicki, "Life Algorithms", G4G13) carried over to a tiling.
//
//  3. ACTIVE-BLOCK SKIPPING. A block with nothing in it and nothing live on any bordering block is not
//     visited at all, and is freed once it has been quiet for a step.
//
// The torus is the SAME machinery with one block the size of the whole board and a wrapping gather, which
// is why an n×n torus is not a special case in the kernel — only in how the halo is filled.
//
// WHAT DELIBERATELY IS NOT HERE. The bit-packing / SWAR / SIMD stack that takes square-grid Life past 10⁹
// cell-updates/s per core works by shifting a word to get every cell's neighbour at once, which needs the
// grid's fixed ±1 offsets; on a tiling the offsets differ per slot, so a shift does not align. Nibble
// packing would still apply and is the natural next step if this ever needs it. HashLife does generalize
// in principle — the quadtree would sit on the ℤ² lattice index and the light cone is `radius` cells per
// generation — but it advances 2^(k−2) generations per node and so cannot show you every generation,
// which is the entire point of an interactive viewer.

import type { NeighborRef, PeriodicAdjacency } from "@/lib/automata/adjacency";
import type { TileMap } from "@/lib/automata/board";
import type { RuleTable } from "@/lib/automata/rule";

/** Block edge, in lattice cells, for the unbounded board. */
export const CHUNK = 32;

/** Deterministic PRNG (mulberry32), so a seed reproduces a soup exactly and a URL can carry it. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Block {
	cx: number;
	cy: number;
	state: Uint8Array;
	next: Uint8Array;
	/** Cells in state 1. Drives active-block skipping and the population readout. */
	live: number;
	/** Cells in any non-zero state. A Generations tail is not live but is not quiescent either. */
	nonzero: number;
}

export interface EngineOptions {
	/**
	 * Period in fundamental cells along v₁, or null for an OPEN axis that grows without bound.
	 *
	 * The pair (wrapI, wrapJ) is the board's topology as the engine sees it: (null, null) is the plane,
	 * (W, null) the cylinder, (W, H) the torus. The two flipped surfaces need a glide as well, which is a
	 * property of the tiling and not of the board — see lib/automata/topology.ts.
	 */
	wrapI?: number | null;
	wrapJ?: number | null;
	/** Hard cap on allocated blocks, so a runaway rule cannot exhaust memory. */
	maxBlocks?: number;
	/**
	 * A free involution the board's state is held invariant under — the deck transformation of an
	 * orientation double cover.
	 *
	 * This is how the two non-orientable surfaces are run. A Klein-bottle board is a torus board twice as
	 * wide carrying an ι-invariant state; because ι is an automorphism of the adjacency graph and maps
	 * every tile to a congruent one, the rule commutes with it and the invariance is preserved exactly,
	 * in integer arithmetic, forever. The kernel never learns about any of this. See lib/automata/board.ts.
	 */
	involution?: TileMap | null;
}

export interface StepStats {
	generation: number;
	population: number;
	/** Live cells over the cells the board currently holds. */
	density: number;
	born: number;
	died: number;
	blocks: number;
}

export class AutomatonEngine {
	readonly n: number;
	readonly adj: PeriodicAdjacency;
	private offsets: Int32Array[] = [];
	private degrees: number[] = [];
	private table: RuleTable;
	private radius = 1;

	/** Block dimensions in lattice cells: CHUNK² when unbounded, the whole board on a torus. */
	private bw: number;
	private bh: number;
	private padW = 0;
	private padH = 0;
	private scratch: Uint8Array = new Uint8Array(0);

	private blocks = new Map<string, Block>();
	private wrapI: number | null;
	private wrapJ: number | null;
	private maxBlocks: number;
	private involution: TileMap | null;

	generation = 0;
	population = 0;

	constructor(
		adj: PeriodicAdjacency,
		neighbors: NeighborRef[][],
		table: RuleTable,
		opts: EngineOptions = {},
	) {
		this.adj = adj;
		this.n = adj.n;
		this.table = table;
		this.wrapI = opts.wrapI == null ? null : Math.max(1, Math.floor(opts.wrapI));
		this.wrapJ = opts.wrapJ == null ? null : Math.max(1, Math.floor(opts.wrapJ));
		this.maxBlocks = opts.maxBlocks ?? 4096;
		this.involution = opts.involution ?? null;
		// A wrapped axis is exactly one block wide, so the wrap never falls inside a block; an open axis
		// keeps the CHUNK pitch and grows by allocating neighbours.
		this.bw = this.wrapI ?? CHUNK;
		this.bh = this.wrapJ ?? CHUNK;
		this.setNeighbors(neighbors, table);
	}

	/** Swap in a new neighbourhood/rule without discarding the board. */
	setNeighbors(neighbors: NeighborRef[][], table: RuleTable) {
		this.table = table;
		let r = 1;
		for (const list of neighbors) {
			for (const ref of list) r = Math.max(r, Math.abs(ref.di), Math.abs(ref.dj));
		}
		this.radius = r;
		this.padW = this.bw + 2 * r;
		this.padH = this.bh + 2 * r;
		this.scratch = new Uint8Array(this.padW * this.padH * this.n);
		this.degrees = neighbors.map((l) => l.length);
		// The constant-offset trick: a neighbour (t', di, dj) of slot t sits at
		//   ((dj * padW) + di) * n + (t' - t)
		// bytes from slot t's own index, for EVERY cell in the padded buffer.
		this.offsets = neighbors.map((list, t) =>
			Int32Array.from(list, (ref) => (ref.dj * this.padW + ref.di) * this.n + (ref.t - t)),
		);
	}

	get neighborDegrees(): number[] {
		return this.degrees;
	}

	get blockCount(): number {
		return this.blocks.size;
	}

	/** Tiles the allocated blocks hold — the denominator behind the density readout. */
	get cellCapacity(): number {
		return Math.max(1, this.blocks.size * this.bw * this.bh * this.n);
	}

	/** Total states the active rule uses; 2 is plain Life, more means a Generations decay tail. */
	get stateCount(): number {
		return this.table.states;
	}

	/** The board's periods, null per open axis — the engine's whole notion of topology. */
	get wrapSize(): [number | null, number | null] {
		return [this.wrapI, this.wrapJ];
	}

	/** Does the board close in both directions? Then the state space is finite. */
	get closed(): boolean {
		return this.wrapI != null && this.wrapJ != null;
	}

	/**
	 * How many times this board covers the surface being simulated: 2 on the Möbius band and the Klein
	 * bottle, 1 everywhere else. Population and churn are counted over the cover, so the figures the
	 * reader is shown are these divided by it.
	 */
	get coverFactor(): number {
		return this.involution ? 2 : 1;
	}

	// ── Board access ────────────────────────────────────────────────────────────────────────────────

	private key(cx: number, cy: number): string {
		return `${cx},${cy}`;
	}

	private blockAt(cx: number, cy: number): Block | undefined {
		return this.blocks.get(this.key(cx, cy));
	}

	private ensureBlock(cx: number, cy: number): Block | undefined {
		const k = this.key(cx, cy);
		const found = this.blocks.get(k);
		if (found) return found;
		if (this.blocks.size >= this.maxBlocks) return undefined;
		const b: Block = {
			cx,
			cy,
			state: new Uint8Array(this.bw * this.bh * this.n),
			next: new Uint8Array(this.bw * this.bh * this.n),
			live: 0,
			nonzero: 0,
		};
		this.blocks.set(k, b);
		return b;
	}

	/** Fold a global lattice coordinate onto the board, per axis. Identity on an open axis. */
	private wrap(gx: number, gy: number): [number, number] {
		const w = this.wrapI;
		const h = this.wrapJ;
		return [w == null ? gx : ((gx % w) + w) % w, h == null ? gy : ((gy % h) + h) % h];
	}

	/** Resolve a wrapped lattice coordinate to (block, local x, local y). */
	private locate(wx: number, wy: number) {
		const cx = Math.floor(wx / this.bw);
		const cy = Math.floor(wy / this.bh);
		return { cx, cy, lx: wx - cx * this.bw, ly: wy - cy * this.bh };
	}

	getCell(gx: number, gy: number, t: number): number {
		const [wx, wy] = this.wrap(gx, gy);
		const { cx, cy, lx, ly } = this.locate(wx, wy);
		const b = this.blockAt(cx, cy);
		if (!b) return 0;
		return b.state[(ly * this.bw + lx) * this.n + t];
	}

	/** Write one tile, counters kept straight. Does NOT mirror — the one path that must not recurse. */
	private writeCell(gx: number, gy: number, t: number, value: number) {
		const [wx, wy] = this.wrap(gx, gy);
		const { cx, cy, lx, ly } = this.locate(wx, wy);
		const b = this.ensureBlock(cx, cy);
		if (!b) return;
		const idx = (ly * this.bw + lx) * this.n + t;
		const prev = b.state[idx];
		if (prev === value) return;
		b.state[idx] = value;
		if (prev === 1 && value !== 1) b.live--;
		else if (prev !== 1 && value === 1) b.live++;
		if (prev === 0 && value !== 0) b.nonzero++;
		else if (prev !== 0 && value === 0) b.nonzero--;
	}

	/**
	 * Set one tile. On a non-orientable board the tile's mirror image is set with it — a single cell is
	 * not a thing you can paint there, because the two are the same cell of the surface seen twice.
	 */
	setCell(gx: number, gy: number, t: number, value: number) {
		this.writeCell(gx, gy, t, value);
		if (this.involution) {
			const [wx, wy] = this.wrap(gx, gy);
			const [ax, ay, at] = this.involution(wx, wy, t);
			this.writeCell(ax, ay, at, value);
		}
		this.population = this.countPopulation();
	}

	/**
	 * Force the board's state to be invariant under the deck transformation.
	 *
	 * Run once after seeding; the dynamics preserve the invariance on its own from then on. Each ι-orbit
	 * has exactly two members (ι is free), and the one with the smaller wrapped address wins — an
	 * arbitrary but total choice, which is all that is needed. Pairs that already agree are skipped, so a
	 * mostly-empty board does not allocate a block for every zero it copies.
	 */
	symmetrize() {
		const inv = this.involution;
		if (!inv) return;
		// Snapshot: writing can allocate, and a Map must not be iterated while it grows.
		for (const b of [...this.blocks.values()]) {
			for (let ly = 0; ly < this.bh; ly++) {
				for (let lx = 0; lx < this.bw; lx++) {
					const gx = b.cx * this.bw + lx;
					const gy = b.cy * this.bh + ly;
					const base = (ly * this.bw + lx) * this.n;
					for (let t = 0; t < this.n; t++) {
						const own = b.state[base + t];
						const [rx, ry, rt] = inv(gx, gy, t);
						const [ix, iy] = this.wrap(rx, ry);
						const other = this.getCell(ix, iy, rt);
						if (own === other) continue;
						const mine = gx < ix || (gx === ix && (gy < iy || (gy === iy && t < rt)));
						if (mine) this.writeCell(ix, iy, rt, own);
						else this.writeCell(gx, gy, t, other);
					}
				}
			}
		}
		this.population = this.countPopulation();
	}

	clear() {
		this.blocks.clear();
		this.generation = 0;
		this.population = 0;
	}

	/**
	 * Fill a rectangle of lattice cells with a random soup.
	 *
	 * Unbounded: `w`/`h` bound the seeded region only — the pattern is free to grow out of it. Torus: the
	 * whole board is seeded regardless of the arguments.
	 */
	randomize(density: number, seed: number, w = 24, h = 24) {
		this.clear();
		const rng = mulberry32(seed);
		// A wrapped axis is seeded end to end; an open one takes the requested patch, centred on the origin.
		const width = this.wrapI ?? Math.max(1, Math.floor(w));
		const height = this.wrapJ ?? Math.max(1, Math.floor(h));
		const x0 = this.wrapI != null ? 0 : -Math.floor(width / 2);
		const y0 = this.wrapJ != null ? 0 : -Math.floor(height / 2);
		for (let gy = y0; gy < y0 + height; gy++) {
			for (let gx = x0; gx < x0 + width; gx++) {
				const [wx, wy] = this.wrap(gx, gy);
				const { cx, cy, lx, ly } = this.locate(wx, wy);
				const b = this.ensureBlock(cx, cy);
				if (!b) continue;
				for (let t = 0; t < this.n; t++) {
					if (rng() >= density) continue;
					const idx = (ly * this.bw + lx) * this.n + t;
					if (b.state[idx] === 0) b.nonzero++;
					if (b.state[idx] !== 1) b.live++;
					b.state[idx] = 1;
				}
			}
		}
		this.generation = 0;
		this.population = this.countPopulation();
		// A non-orientable board's soup has to respect the gluing, or generation 0 is a configuration the
		// surface cannot hold.
		this.symmetrize();
	}

	private countPopulation(): number {
		let p = 0;
		for (const b of this.blocks.values()) p += b.live;
		return p;
	}

	// ── The step ────────────────────────────────────────────────────────────────────────────────────

	/**
	 * Copy a block and its R-cell border into the padded scratch buffer.
	 *
	 * Done in runs: each run is the longest span that stays inside one source block, inside the padded
	 * row, and (on a torus) on one side of the wrap seam — so a row costs a handful of `set` calls
	 * instead of padW individual reads. A missing source block leaves zeros, which is exactly the empty
	 * space it represents.
	 */
	private gather(block: Block) {
		const { n, radius: R, padW, bw, bh } = this;
		const src = this.scratch;
		src.fill(0);
		for (let py = 0; py < this.padH; py++) {
			const gy = block.cy * bh + py - R;
			let px = 0;
			while (px < padW) {
				const gx = block.cx * bw + px - R;
				const [wx, wy] = this.wrap(gx, gy);
				const { cx, cy, lx, ly } = this.locate(wx, wy);
				// End the run at whichever comes first: the source block's row end, the padded row end,
				// or the torus seam (where the next cell jumps back to x = 0).
				const runSrc = bw - lx;
				const runDst = padW - px;
				const runWrap = this.wrapI == null ? Infinity : this.wrapI - wx;
				const run = Math.max(1, Math.min(runSrc, runDst, runWrap));
				const source = this.blockAt(cx, cy);
				if (source) {
					const from = (ly * bw + lx) * n;
					src.set(source.state.subarray(from, from + run * n), (py * padW + px) * n);
				}
				px += run;
			}
		}
	}

	/** The inner loop: padded scratch in, block.next out. */
	private kernel(block: Block) {
		const { n, radius: R, padW, bw, bh, offsets, table } = this;
		const src = this.scratch;
		const dst = block.next;
		const states = table.states;
		const twoState = states <= 2;
		for (let ly = 0; ly < bh; ly++) {
			for (let lx = 0; lx < bw; lx++) {
				const pBase = ((ly + R) * padW + (lx + R)) * n;
				const dBase = (ly * bw + lx) * n;
				for (let t = 0; t < n; t++) {
					const idx = pBase + t;
					const cur = src[idx];
					const off = offsets[t];
					let count = 0;
					for (let k = 0; k < off.length; k++) {
						if (src[idx + off[k]] === 1) count++;
					}
					let out: number;
					if (cur === 0) out = table.birth[t][count] ? 1 : 0;
					else if (cur === 1) out = table.survival[t][count] ? 1 : twoState ? 0 : 2;
					else out = cur + 1 >= states ? 0 : cur + 1;
					dst[dBase + t] = out;
				}
			}
		}
	}

	/**
	 * Does this block hold anything within R cells of a border?
	 *
	 * Only such a block can seed a birth outside itself, so only such a block forces its neighbours to be
	 * allocated. Checking it keeps the board from growing a dead ring every generation.
	 */
	private touchesBorder(block: Block): boolean {
		const { n, radius: R, bw, bh } = this;
		const bandX = Math.min(R, bw);
		const bandY = Math.min(R, bh);
		for (let ly = 0; ly < bh; ly++) {
			const inYBand = ly < bandY || ly >= bh - bandY;
			for (let lx = 0; lx < bw; lx++) {
				if (!inYBand && lx >= bandX && lx < bw - bandX) continue;
				const base = (ly * bw + lx) * n;
				for (let t = 0; t < n; t++) if (block.state[base + t] !== 0) return true;
			}
		}
		return false;
	}

	step(): StepStats {
		// Only OPEN axes have neighbouring blocks; a wrapped axis is one block wide and its own neighbour.
		const openI = this.wrapI == null;
		const openJ = this.wrapJ == null;
		const crI = openI ? Math.max(1, Math.ceil(this.radius / this.bw)) : 0;
		const crJ = openJ ? Math.max(1, Math.ceil(this.radius / this.bh)) : 0;

		// 1. Grow: any block with content near a border needs its neighbours to exist along the open
		//    axes, or a birth just outside it would be silently discarded and the plane would not be a
		//    plane. A wrapped axis has nothing outside it to grow into.
		if (openI || openJ) {
			for (const b of [...this.blocks.values()]) {
				if (b.nonzero === 0 || !this.touchesBorder(b)) continue;
				for (let dy = -crJ; dy <= crJ; dy++) {
					for (let dx = -crI; dx <= crI; dx++) {
						if (dx === 0 && dy === 0) continue;
						this.ensureBlock(b.cx + dx, b.cy + dy);
					}
				}
			}
		}

		// 2. Update every block that could change: one with content, or one bordering content.
		const list = [...this.blocks.values()];
		const active = new Set<string>();
		for (const b of list) {
			if (b.nonzero === 0) continue;
			for (let dy = -crJ; dy <= crJ; dy++) {
				for (let dx = -crI; dx <= crI; dx++) active.add(this.key(b.cx + dx, b.cy + dy));
			}
		}

		const touched: Block[] = [];
		for (const b of list) {
			if (!active.has(this.key(b.cx, b.cy))) continue;
			this.gather(b);
			this.kernel(b);
			touched.push(b);
		}

		// 3. Commit. After the swap, `next` holds the PREVIOUS state, which is what the born/died tally
		//    reads. Counting here rather than in the kernel keeps the kernel branch-light.
		let born = 0;
		let died = 0;
		for (const b of touched) {
			const tmp = b.state;
			b.state = b.next;
			b.next = tmp;
			let live = 0;
			let nonzero = 0;
			for (let i = 0; i < b.state.length; i++) {
				const now = b.state[i];
				const before = b.next[i];
				if (now !== 0) {
					nonzero++;
					if (now === 1) live++;
				}
				if (before !== 1 && now === 1) born++;
				else if (before === 1 && now !== 1) died++;
			}
			b.live = live;
			b.nonzero = nonzero;
		}

		// 4. Free blocks that are empty and surrounded by empty. Keeps memory tracking the pattern.
		if (openI || openJ) {
			for (const b of [...this.blocks.values()]) {
				if (b.nonzero !== 0) continue;
				let neighborLive = false;
				for (let dy = -1; dy <= 1 && !neighborLive; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						const nb = this.blockAt(b.cx + dx, b.cy + dy);
						if (nb && nb.nonzero !== 0) {
							neighborLive = true;
							break;
						}
					}
				}
				if (!neighborLive) this.blocks.delete(this.key(b.cx, b.cy));
			}
		}

		this.generation++;
		this.population = this.countPopulation();
		const cells = this.cellCapacity;
		return {
			generation: this.generation,
			population: this.population,
			density: this.population / cells,
			born,
			died,
			blocks: this.blocks.size,
		};
	}

	// ── Readback for the renderer ───────────────────────────────────────────────────────────────────

	/**
	 * Fill `out` with the states of a w×h block of lattice cells starting at (i0, j0), row-major, n bytes
	 * per lattice cell. This is what the WebGL renderer uploads as a texture each frame.
	 */
	sampleRegion(i0: number, j0: number, w: number, h: number, out?: Uint8Array): Uint8Array {
		const need = w * h * this.n;
		const buf = out && out.length >= need ? out : new Uint8Array(need);
		buf.fill(0, 0, need);
		for (let y = 0; y < h; y++) {
			let x = 0;
			while (x < w) {
				const [wx, wy] = this.wrap(i0 + x, j0 + y);
				const { cx, cy, lx, ly } = this.locate(wx, wy);
				const runWrap = this.wrapI == null ? Infinity : this.wrapI - wx;
				const run = Math.max(1, Math.min(this.bw - lx, w - x, runWrap));
				const b = this.blockAt(cx, cy);
				if (b) {
					const from = (ly * this.bw + lx) * this.n;
					buf.set(b.state.subarray(from, from + run * this.n), (y * w + x) * this.n);
				}
				x += run;
			}
		}
		return buf;
	}

	/** Bounding box of the non-empty pattern in lattice cells, or null when the board is empty. */
	liveBounds(): { i0: number; j0: number; i1: number; j1: number } | null {
		let i0 = Infinity;
		let j0 = Infinity;
		let i1 = -Infinity;
		let j1 = -Infinity;
		for (const b of this.blocks.values()) {
			if (b.nonzero === 0) continue;
			for (let ly = 0; ly < this.bh; ly++) {
				for (let lx = 0; lx < this.bw; lx++) {
					const base = (ly * this.bw + lx) * this.n;
					let any = false;
					for (let t = 0; t < this.n; t++) {
						if (b.state[base + t] !== 0) {
							any = true;
							break;
						}
					}
					if (!any) continue;
					const gx = b.cx * this.bw + lx;
					const gy = b.cy * this.bh + ly;
					if (gx < i0) i0 = gx;
					if (gy < j0) j0 = gy;
					if (gx > i1) i1 = gx;
					if (gy > j1) j1 = gy;
				}
			}
		}
		return Number.isFinite(i0) ? { i0, j0, i1, j1 } : null;
	}
}
