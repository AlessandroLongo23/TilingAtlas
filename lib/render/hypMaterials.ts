// Materials for the hyperbolic disk: each tile drawn as a polished stone slab or a pane of leaded glass.
// Two things make a material hold still under the camera, and both are subtler here than on the plane.
//
// ORIENTATION. A pixel's walk ends in the frame of a QUOTIENT face, and when that face has a rotation in
// the quotient two pixels of one tile can arrive in frames a turn apart (5.8.8: a quarter turn). A
// texture read in the walk frame would show seams inside the tile. The shader reads it instead in the
// tile's frame carried straight out from the home point, (A.a/|A.a|)² · w with A the tile's isometry to
// the home frame: route-free, because a rotation about the tile's centre changes A.a's phase and w by the
// same angle.
//
// IDENTITY. On {7,3} the quotient has ONE face, so every heptagon walks into the same frame and would get
// the same slab. A tile needs a seed, and a seed taken from the tile's home-frame position on the GPU
// dies within ~10 units of travel: float32 cannot tell neighbouring tiles apart once the position grows
// like e^d, and the walk's own rounding (~1e-6, hyperbolic) is amplified by the same e^d. So the CPU
// lists the tiles within SEED_RADIUS of the anchor face (cached per quotient face: the list is the same
// around every copy of it), hashes each one's home-frame position in float64, and hands the GPU a hash
// table keyed by the tile's position relative to the ANCHOR, which is small and exact enough in float32.
// The key is 2ab of the tile's isometry [[a,b],[b̄,ā]] to the anchor frame: the (x, y) of its centre on
// the hyperboloid, unchanged by a rotation of the tile's frame. Rebuilt on every re-anchor, so the seed a
// tile carries is the same from every anchor that sees it, to float64, out to ~30 units from home.

import { type Su11, su11Inverse, su11Mul, su11Normalize } from "@/lib/render/hyperbolic";
import { WALK_APEIROGON, type WalkTiling } from "@/lib/render/hyperbolicWalk";

export type HypMaterial = "none" | "marble" | "glass" | "wood" | "cobble";
export const MATERIAL_CODE: Record<HypMaterial, number> = { none: 0, marble: 1, glass: 2, wood: 3, cobble: 4 };

/** Wood's own choices. "mixed" species steps through them by polygon size (the hue ring turns it), as the
 *  stones do; "mixed" cut picks one per board. The shader takes each as its index in the list, less one. */
export const WOOD_SPECIES = ["mixed", "oak", "walnut", "maple", "cherry", "wenge", "pine"] as const;
export const WOOD_CUTS = ["mixed", "flat", "quarter", "end"] as const;
export const WOOD_GRAIN = ["random", "aligned"] as const;
export interface WoodStyle {
	species: (typeof WOOD_SPECIES)[number];
	cut: (typeof WOOD_CUTS)[number];
	grain: (typeof WOOD_GRAIN)[number];
}
/**
 * SCANNED SURFACES (tools/surfaces/build_surfaces.py): CC0 scans from ambientCG and Poly Haven, packed per
 * family into SURFACE_LAYERS WebP pairs, the material's slots in the procedural tables' order and the
 * joint filler last. Fetched on first use and decoded unflipped-alpha (the alpha is height, not opacity).
 */
export type SurfaceFamily = "marble" | "wood" | "cobble";
/** Slots per family; marble's grout and cobble's sand are one layer more. Marble has many: a tiling's
 *  polygon sizes each take their own stone (rank order, polygonRanks), and the world's marbles are many. */
export const SURFACE_SLOTS: Record<SurfaceFamily, number> = { marble: 12, wood: 6, cobble: 5 };
/** Slots that share another slot's relief read its -n file (one copy shipped): the five setts all take
 *  rock_surface's (tools/surfaces/build_surfaces.py writes the -n file once per relief source). */
const RELIEF_OF: Partial<Record<SurfaceFamily, number[]>> = { cobble: [0, 0, 0, 0, 0, 5] };
export const surfaceFamily = (m: HypMaterial): SurfaceFamily | null =>
	m === "marble" || m === "wood" || m === "cobble" ? m : null;
export interface SurfaceImages {
	c: ImageBitmap[];
	n: ImageBitmap[];
}
const surfaceCache = new Map<SurfaceFamily, Promise<SurfaceImages>>();
export function surfaceImages(family: SurfaceFamily): Promise<SurfaceImages> {
	let p = surfaceCache.get(family);
	if (!p) {
		const relief = RELIEF_OF[family];
		const one = (i: number, k: "c" | "n") =>
			fetch(`/surfaces/${family}/${i}-${k}.webp`)
				.then((r) => {
					if (!r.ok) throw new Error(`surface ${family}/${i}-${k}: HTTP ${r.status}`);
					return r.blob();
				})
				// flipY: the shader's uv has +y up, as the OpenGL-convention normal maps do
				.then((b) =>
					createImageBitmap(b, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }),
				);
		// Wood has no filler layer: its boards butt, and the shader paints the gap a flat dark.
		const idx = [...Array(SURFACE_SLOTS[family] + (family === "wood" ? 0 : 1)).keys()];
		const normals = new Map<number, Promise<ImageBitmap>>();
		const normal = (i: number) => {
			const j = relief?.[i] ?? i;
			if (!normals.has(j)) normals.set(j, one(j, "n"));
			return normals.get(j)!;
		};
		p = Promise.all([Promise.all(idx.map((i) => one(i, "c"))), Promise.all(idx.map(normal))]).then(([c, n]) => ({ c, n }));
		p.catch(() => surfaceCache.delete(family)); // a failed fetch may be retried
		surfaceCache.set(family, p);
	}
	return p;
}

/** The tiling's polygon sizes in rank order, as the shader's uRank pairs (size, rank), smallest first,
 *  and how many there are. An apeirogon row counts as its own size. */
export function polygonRanks(t: WalkTiling): { pairs: Float32Array; n: number } {
	const sizes = new Set<number>();
	for (let f = 0; f < t.height; f++) sizes.add(t.data[f * t.width * 4 + 3]);
	const sorted = [...sizes].sort((a, b) => a - b).slice(0, 16);
	const pairs = new Float32Array(32);
	sorted.forEach((k, i) => pairs.set([k, i], i * 2));
	return { pairs, n: sorted.length };
}

export const woodCode = (w: WoodStyle): [number, number, number] => [
	WOOD_SPECIES.indexOf(w.species) - 1,
	WOOD_CUTS.indexOf(w.cut) - 1,
	WOOD_GRAIN.indexOf(w.grain),
];

/** Tiles listed around the anchor: centres within this hyperbolic distance. Past ~6 a tile is a few
 *  pixels across and its material has faded to its mean, so a missing seed is invisible there. */
const SEED_RADIUS = 7.5;
/** Key cell on the hyperboloid (x, y), and the margin within which the shader also probes the next cell.
 *  Tile centres are ≥ ~0.3 apart there; float32 rounding at radius 7.5 is ~1e-3. */
export const SEED_CELL = 0.125;
/** The key grid sits off the axes by this many cells: a symmetric tiling puts whole rows of centres on
 *  its mirror lines, which would otherwise be cell boundaries. */
export const SEED_SHIFT = 0.3719;
export const SEED_TEX_W = 512;
export const KEY_OFFSET = 65536;

/** The tiles near a face, as a breadth-first tree over the walk: each tile's face, its parent's index and
 *  the parent's slot it was reached through, and its isometry into the root face's frame in the geometry
 *  the tree was grown in. The tree is combinatorial, so it replays in any member of a star family. */
interface Local {
	f: Int32Array;
	parent: Int32Array;
	slot: Int32Array;
	a: Su11[];
}

/** mhash and keyHash of the GLSL below, bit for bit. Keys are offset positive before the int → uint. */
export const mhash = (x: number): number => {
	x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
	x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
	return (x ^ (x >>> 16)) >>> 0;
};
export const hashU32 = (x: number, y: number): number =>
	mhash(Math.imul((x + KEY_OFFSET) | 0, 73856093) ^ Math.imul((y + KEY_OFFSET) | 0, 19349663));

/** The tiles whose centres lie within SEED_RADIUS of face f's centre, breadth first over the walk table.
 *  An apeirogon has no centre to key it by and is left out (the shader falls back to its face index). */
function localTiles(t: WalkTiling, f0: number): Local {
	const f: number[] = [f0],
		parent: number[] = [-1],
		slot: number[] = [-1];
	const a: Su11[] = [{ a: { x: 1, y: 0 }, b: { x: 0, y: 0 } }];
	const seen = new Set<string>();
	const coshMax = Math.cosh(SEED_RADIUS);
	const key = (m: Su11) => {
		const x = 2 * (m.a.x * m.b.x - m.a.y * m.b.y);
		const y = 2 * (m.a.x * m.b.y + m.a.y * m.b.x);
		return `${Math.round(x * 64)},${Math.round(y * 64)}`;
	};
	seen.add(key(a[0]));
	for (let qi = 0; qi < f.length; qi++) {
		const row = f[qi] * t.width * 4;
		const slots = t.data[row + 1];
		for (let j = 0; j < slots; j++) {
			const nf = t.data[row + (3 + 3 * j) * 4];
			if (nf < 0 || t.data[nf * t.width * 4] === WALK_APEIROGON) continue;
			const n = su11Normalize(su11Mul(a[qi], su11Inverse(sideMap(t, f[qi], j))));
			if (n.a.x ** 2 + n.a.y ** 2 + n.b.x ** 2 + n.b.y ** 2 > coshMax) continue;
			const k = key(n);
			if (seen.has(k)) continue;
			seen.add(k);
			f.push(nf);
			parent.push(qi);
			slot.push(j);
			a.push(n);
		}
	}
	return { f: Int32Array.from(f), parent: Int32Array.from(parent), slot: Int32Array.from(slot), a };
}

/** Side j of face f's map into the face across it (hyperbolicWalk.ts layout). */
const sideMap = (t: WalkTiling, f: number, j: number): Su11 => {
	const o = f * t.width * 4 + (2 + 3 * j) * 4;
	return { a: { x: t.data[o], y: t.data[o + 1] }, b: { x: t.data[o + 2], y: t.data[o + 3] } };
};
const sameSu11 = (m: Su11, n: Su11) => m.a.x === n.a.x && m.a.y === n.a.y && m.b.x === n.b.x && m.b.y === n.b.y;
/** 2·arg(m.a): the turn of m's frame against the frame carried straight out from the origin. */
const turnOf = (m: Su11) => 2 * Math.atan2(m.a.y, m.a.x);

/**
 * The seed table for the current anchor, rebuilt when the anchor, the camera's frames or the walk change.
 * Two texels per slot: (key x, key y, seed, 1 = used) and (reference turn, live turn, 0, 0).
 *
 * WHAT A TILE IS. Its seed and its texture's turn are read in the REFERENCE geometry (`ref`, with the
 * camera's frame there, HypCamera.toHomeRef), which a star family's slider does not move: the tile keeps
 * its slab and the slab keeps its place on the tile while the angles change. Only the lookup key, and the
 * turn of the live frame the shader must undo, come from the live geometry.
 */
export class TileSeeds {
	private cache = new WeakMap<WalkTiling, Map<number, Local>>();
	private last: { live: WalkTiling; face: number; G: Su11; Gref: Su11 } | null = null;
	data = new Float32Array(0);
	height = 0;

	/** `Ginv` and `GinvRef` map the anchor frame to the home frame, live and in the reference geometry.
	 *  True when rebuilt. */
	update(live: WalkTiling, ref: WalkTiling, face: number, Ginv: Su11, GinvRef: Su11): boolean {
		const l = this.last;
		if (l && l.live === live && l.face === face && sameSu11(l.G, Ginv) && sameSu11(l.Gref, GinvRef)) return false;
		this.last = { live, face, G: Ginv, Gref: GinvRef };
		if (live.data[face * live.width * 4] === WALK_APEIROGON) {
			this.data = new Float32Array(SEED_TEX_W * 4);
			this.height = 1;
			return true;
		}
		let perFace = this.cache.get(ref);
		if (!perFace) this.cache.set(ref, (perFace = new Map()));
		let tiles = perFace.get(face);
		if (!tiles) perFace.set(face, (tiles = localTiles(ref, face)));

		const n = tiles.f.length;
		let cap = SEED_TEX_W / 2;
		while (cap < n * 2) cap *= 2;
		const data = new Float32Array(cap * 8);
		const liveA: Su11[] = new Array(n);
		for (let i = 0; i < n; i++) {
			const p = tiles.parent[i];
			// the same step in the live geometry: the parent's map, then back across the same side
			liveA[i] =
				p < 0 ? tiles.a[0] : su11Normalize(su11Mul(liveA[p], su11Inverse(sideMap(live, tiles.f[p], tiles.slot[i]))));
			const a = liveA[i];
			const kx = Math.floor((2 * (a.a.x * a.b.x - a.a.y * a.b.y)) / SEED_CELL + SEED_SHIFT);
			const ky = Math.floor((2 * (a.a.x * a.b.y + a.a.y * a.b.x)) / SEED_CELL + SEED_SHIFT);
			// the tile's centre on the hyperboloid in the reference home frame, at 1/16 resolution
			const h = su11Mul(GinvRef, tiles.a[i]);
			const hx = Math.round(16 * 2 * (h.a.x * h.b.x - h.a.y * h.b.y));
			const hy = Math.round(16 * 2 * (h.a.x * h.b.y + h.a.y * h.b.x));
			const seed = hashU32(hx % 1e9, hy % 1e9) / 4294967296;
			let s = hashU32(kx, ky) & (cap - 1);
			while (data[s * 8 + 3] !== 0) s = (s + 1) & (cap - 1);
			data.set([kx, ky, seed, 1, turnOf(h), turnOf(su11Mul(Ginv, a)), 0, 0], s * 8);
		}
		this.data = data;
		this.height = (cap * 2) / SEED_TEX_W;
		return true;
	}
}

// --------------------------------------------------------------------------------------------- GLSL ---
// Interpolated into the per-pixel shader after its complex helpers. It reads uSeeds, uSeedCap and uGinv,
// declared there.
export const MATERIAL_GLSL = /* glsl */ `
uint mhash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
uint keyHash(int x, int y) { return mhash(uint(x + ${KEY_OFFSET}) * 73856093u ^ uint(y + ${KEY_OFFSET}) * 19349663u); }
vec2 rnd2(vec2 p) {
	uvec2 q = uvec2(ivec2(floor(p)) + 32768);
	uint h = mhash(q.x * 1597334677u ^ q.y * 3812015801u);
	return vec2(float(h & 0xffffu), float(h >> 16)) / 65535.0;
}
// gradient noise, about −0.7..0.7
float gnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	vec2 g00 = rnd2(i) * 2.0 - 1.0, g10 = rnd2(i + vec2(1, 0)) * 2.0 - 1.0;
	vec2 g01 = rnd2(i + vec2(0, 1)) * 2.0 - 1.0, g11 = rnd2(i + vec2(1, 1)) * 2.0 - 1.0;
	return mix(mix(dot(g00, f), dot(g10, f - vec2(1, 0)), u.x), mix(dot(g01, f - vec2(0, 1)), dot(g11, f - vec2(1, 1)), u.x), u.y);
}
// Band-limited fbm: an octave fades out as its wavelength nears two pixels (fp = pixel footprint in the
// same units as p), so a tile shrinking toward the rim settles to its mean instead of shimmering.
float fbm(vec2 p, float fp, int oct) {
	float s = 0.0, a = 0.5, fr = 1.0;
	for (int i = 0; i < 7; i++) {
		if (i >= oct) break;
		s += a * gnoise(p * fr) * (1.0 - smoothstep(0.25, 0.5, fr * fp));
		fr *= 2.03; a *= 0.5;
		p = mat2(0.8, 0.6, -0.6, 0.8) * p + 17.1;
	}
	return s;
}
// Worley F1 and the id of the nearest feature point
vec3 worley(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	float d = 8.0; vec2 id = vec2(0.0);
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		vec2 o = vec2(x, y), r = o + rnd2(i + o) - f;
		float q = dot(r, r);
		if (q < d) { d = q; id = i + o; }
	}
	return vec3(sqrt(d), id);
}

// The tile's row in the CPU table (TileSeeds), keyed by its centre on the hyperboloid in the anchor
// frame: (seed, reference turn, live turn of the table's frame, 1 = found). Near a key cell's edge float
// rounding can land either side, so the neighbouring cells are probed too. Not found (an apeirogon, or a
// tile past SEED_RADIUS, a few pixels wide): a seed from the face index, and w = 0 says so.
vec4 tileSeed(int f, vec2 ma, vec2 mb, bool horo) {
	if (!horo) {
		vec2 X = 2.0 * cmul(ma, mb) / ${SEED_CELL} + ${SEED_SHIFT};
		vec2 c0 = floor(X), fr = X - c0;
		vec2 dir = vec2(fr.x < 0.5 ? -1.0 : 1.0, fr.y < 0.5 ? -1.0 : 1.0);
		bvec2 near = bvec2(min(fr.x, 1.0 - fr.x) < 0.08, min(fr.y, 1.0 - fr.y) < 0.08);
		int perRow = ${SEED_TEX_W / 2};
		int cap = perRow * textureSize(uSeeds, 0).y;
		for (int c = 0; c < 4; c++) {
			vec2 off = vec2(c & 1, c >> 1);
			if ((off.x > 0.0 && !near.x) || (off.y > 0.0 && !near.y)) continue;
			ivec2 k = ivec2(c0 + off * dir);
			int s = int(keyHash(k.x, k.y) & uint(cap - 1));
			for (int p = 0; p < 24; p++) {
				ivec2 at = ivec2(2 * (s % perRow), s / perRow);
				vec4 e = texelFetch(uSeeds, at, 0);
				if (e.w == 0.0) break;
				if (ivec2(e.xy) == k) {
					vec4 t = texelFetch(uSeeds, at + ivec2(1, 0), 0);
					return vec4(e.z, t.x, t.y, 1.0);
				}
				s = (s + 1) & (cap - 1);
			}
		}
	}
	return vec4(float(mhash(uint(f) + 7u) & 0xffffu) / 65535.0, 0.0, 0.0, 0.0);
}

// What every material reads about its pixel (filled in by the per-pixel shader's main).
struct Surf {
	vec2 p;        // the point in the tile's own frame, geodesic polar, hyperbolic units
	float fp;      // a pixel's width in those units: what every pattern is band-limited against
	float seed;    // the tile's seed (tileSeed)
	float key;     // its polygon size
	float edgePx;  // distance to the nearest side, device px
	float edgeH;   // the same, hyperbolic
	float halfW;   // the Line stroke's half-width here, device px: joints, grout and lead take it
	float conf;    // device px per hyperbolic unit here
	vec2 inward;   // unit screen direction into the tile from its nearest side
	vec2 toScreen; // complex factor carrying a p-frame vector to the screen
	vec2 z;        // the pixel on the disk, for lights fixed to the screen
	bool horo;     // an apeirogon
};
const vec3 VIEW = vec3(0.0, 0.0, 1.0);
// The lights are fixed to the screen, as a lamp over a floor or the sky behind a window is: the tiles
// move under them, the light does not move with the tiles.
const vec3 LAMP = vec3(-0.4865, 0.6487, 0.5838); // normalize(-0.45, 0.6, 0.54)
// a p-frame vector on the screen, same length
vec2 onScreen(Surf s, vec2 v) { vec2 q = cmul(v, s.toScreen); return dot(q, q) > 0.0 ? normalize(q) * length(v) : vec2(0.0); }
// the joint of half-width gw px, antialiased
float joint(Surf s, float gw) { return 1.0 - smoothstep(gw - 0.75, gw + 0.75, s.edgePx); }
// One of n choices by polygon size. A size takes its RANK among the tiling's sizes (polygonRanks), not the
// size itself: by size mod n, a 19-gon and a square both landed on the same stone. Distinct sizes now
// differ whenever there are no more of them than choices. The hue ring turns through the choices.
int sizeStep(Surf s, float n) {
	float r = s.key;
	for (int i = 0; i < 16; i++) {
		if (i >= uRankN) break;
		if (abs(uRank[i].x - s.key) < 0.5) { r = uRank[i].y; break; }
	}
	return imod(r + floor(uHueOffset / (360.0 / n) + 0.5), n);
}
// fade a pattern of frequency k (per hyperbolic unit) out before it aliases
float band(Surf s, float k) { return 1.0 - smoothstep(0.25, 0.5, k * s.fp); }
// A rounded edge a few px wide can only alias: at a corner the nearest side, and so the normal, jumps,
// and a highlight there flickers pixel by pixel as the tile moves. Below a few px it flattens out.
float relief(Surf s, float widthH) { return smoothstep(1.5, 4.0, widthH * s.conf); }
// reflection of a soft window over the floor, displaced by the normal
float windowAt(Surf s, vec3 n) {
	vec2 sr = s.z + n.xy * 0.5;
	return 1.0 - smoothstep(0.25, 0.65, length((sr - vec2(-0.32, 0.38)) * vec2(1.0, 1.5)));
}

// ---- marble: an opus sectile floor. Each polygon size is cut from its own stone, every slab from a
// different part of the block. Veins follow LAPIDEO's ranking (auriea.org/LAPIDEO-Research): a dominant
// direction per slab, Quilez's iterated domain warp shared by every vein layer, a primary vein hierarchy
// thin and hard, a secondary one ridged and fainter, and a blurred copy of the veins laid UNDER the
// polish so they read as inside the stone, not printed on it.
// stone k: base, vein, mottle colour, vein strength
void stone(int k, out vec3 base, out vec3 vein, out vec3 mott, out float vs) {
	if (k == 0) { base = vec3(0.86, 0.73, 0.47); vein = vec3(0.47, 0.30, 0.17); mott = vec3(0.74, 0.58, 0.34); vs = 0.7; }      // giallo di Siena
	else if (k == 1) { base = vec3(0.12, 0.27, 0.20); vein = vec3(0.78, 0.86, 0.80); mott = vec3(0.05, 0.15, 0.10); vs = 0.85; } // verde Alpi
	else if (k == 2) { base = vec3(0.90, 0.895, 0.875); vein = vec3(0.40, 0.42, 0.45); mott = vec3(0.80, 0.80, 0.80); vs = 0.75; } // Carrara
	else if (k == 3) { base = vec3(0.035, 0.035, 0.04); vein = vec3(0.93, 0.92, 0.89); mott = vec3(0.08, 0.08, 0.085); vs = 0.95; } // nero Marquina
	else { base = vec3(0.50, 0.15, 0.12); vein = vec3(0.90, 0.80, 0.70); mott = vec3(0.32, 0.07, 0.06); vs = 0.8; }               // rosso Levanto
}
vec3 marbleAlbedo(vec2 p, float seed, int kind, float fp) {
	vec3 base, vein, mott; float vs;
	stone(kind, base, vein, mott, vs);
	float a = seed * 6.2831853;
	p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p * 1.5 + vec2(seed * 91.7, fract(seed * 7.13) * 53.1);
	fp *= 1.5;
	vec2 q = vec2(fbm(p, fp, 4), fbm(p + vec2(5.2, 1.3), fp, 4));
	vec2 r = vec2(fbm(p + 1.7 * q + vec2(1.7, 9.2), fp, 5), fbm(p + 1.7 * q + vec2(8.3, 2.8), fp, 5));
	float m = fbm(p * 0.5 + 1.2 * r, fp * 0.5, 3);
	// primary veins: the level lines of a stretched, warped coordinate, given a width in p units and
	// antialiased over the footprint (a vein thinner than a pixel fades instead of breaking up)
	float t = (p.y * 0.45 + 1.6 * r.x + 0.6 * m) * 1.7;
	float dv = abs(t - floor(t + 0.5)) / (1.7 * 0.5);
	float wv = 0.012 + 0.035 * smoothstep(0.05, 0.4, abs(q.y)); // width wanders along the vein
	// a vein runs only where the composition field lets it: whole stretches of quiet ground between
	float v1 = (1.0 - smoothstep(wv - fp, wv + fp, dv)) * smoothstep(-0.3, 0.05, q.x) * min(1.0, wv / fp);
	// secondary: ridged, fainter, finer, and only in patches
	float rr = 1.0 - abs(fbm(p * 2.3 + 1.2 * r, fp * 2.3, 4) * 2.0);
	float v2 = smoothstep(0.93, 0.985, rr) * smoothstep(0.0, 0.25, q.y) * (1.0 - smoothstep(0.15, 0.5, fp * 30.0));
	// the subsurface copy: the same veins, wide and soft
	float vSub = (1.0 - smoothstep(0.0, 0.2, dv)) * smoothstep(-0.2, 0.2, q.x);
	// mottle: the stone's broad clouding, plus a finer speckle for the grain
	vec3 c = mix(base, mott, smoothstep(-0.3, 0.4, m) * 0.7);
	c *= 0.95 + 0.1 * fbm(p * 7.0, fp * 7.0, 3);
	c = mix(c, mix(c, vein, 0.4), vSub * 0.3 * vs);
	c = mix(c, vein, clamp(v1 * vs + v2 * 0.3 * vs, 0.0, 1.0));
	return c * (0.94 + 0.12 * fract(seed * 13.7)); // slabs from one block still differ a little
}
// Slabs in grout. A rounded arris (the slab's eased edge) tilts the normal toward the joint, which breaks
// the reflection at every slab.
vec3 shadeMarble(Surf s) {
	// the stones in the scans' contrast order: Carrara, nero, rosso, verde, giallo
	vec3 alb = s.horo ? vec3(0.88) : marbleAlbedo(s.p, s.seed, int[5](2, 3, 4, 1, 0)[sizeStep(s, 5.0)], s.fp);
	float gw = max(s.halfW, 0.5);
	float e = s.edgePx - gw; // px into the slab past the joint
	float t = clamp(1.0 - e / (0.05 * s.conf + 1.0), 0.0, 1.0);
	float ar = relief(s, 0.05);
	vec3 n = normalize(vec3(-s.inward * t * t * 1.4 * ar, 1.0));
	float dif = max(dot(n, LAMP), 0.0) / LAMP.z;
	// polish: a Fresnel-weak window reflection, the lamp's sharp highlight on the arrises, faint haze
	float haze = 0.75 + 0.25 * fbm(s.p * 5.0 + s.seed * 31.0, s.fp * 5.0, 3);
	float spec = pow(max(dot(n, normalize(LAMP + VIEW)), 0.0), 90.0) * smoothstep(0.0, 0.3, t) * 0.9 * ar;
	float ao = mix(0.62, 1.0, smoothstep(0.0, 2.0 + 0.04 * s.conf, e));
	vec3 col = alb * (0.8 + 0.2 * dif) * ao + vec3(1.0, 0.98, 0.94) * (0.07 * windowAt(s, n) * haze + spec);
	vec3 grout = vec3(0.60, 0.575, 0.53) * (0.88 + 0.25 * gnoise(s.p * 60.0) * band(s, 60.0));
	return mix(col, grout * mix(0.7, 1.0, smoothstep(0.0, gw, s.edgePx)), joint(s, gw));
}

// ---- stained glass: panes of cathedral glass in lead came, lit from behind by a sky fixed to the
// screen. A pane transmits sky · tint^thickness (Beer–Lambert); its thickness wanders (rolled glass),
// is streaked along one direction and carries seed bubbles, and its slope bends the sky seen through it,
// so the light moves through the glass as the window is panned, as it does through a real one.
vec3 skyAt(vec2 s) {
	vec3 sky = mix(vec3(1.0, 0.93, 0.80), vec3(0.62, 0.74, 0.92), smoothstep(-0.9, 0.9, s.y - 0.3 * s.x));
	sky += vec3(1.0, 0.85, 0.6) * 1.1 * exp(-6.0 * dot(s - vec2(-0.45, 0.55), s - vec2(-0.45, 0.55)));
	return sky;
}
// Pot-metal glass, the colours a glazier actually buys: transmittance per unit thickness.
vec3 jewel(int k) {
	if (k == 0) return vec3(0.80, 0.10, 0.12);  // ruby (selenium red)
	if (k == 1) return vec3(0.10, 0.22, 0.78);  // cobalt
	if (k == 2) return vec3(0.95, 0.66, 0.16);  // amber
	if (k == 3) return vec3(0.12, 0.58, 0.28);  // emerald
	if (k == 4) return vec3(0.46, 0.18, 0.66);  // violet
	return vec3(0.93, 0.90, 0.80);              // opal white
}
vec3 shadeGlass(Surf s) {
	// every pane a little denser or paler than the next
	vec3 tint = pow(jewel(sizeStep(s, 6.0)), vec3(0.8 + 0.45 * fract(s.seed * 5.31)));
	float ang = s.seed * 6.2831853;
	mat2 R = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
	vec2 pr = R * s.p + s.seed * 57.3;
	// thickness: rolled waviness + streaks along the pane's draw direction; its slope refracts the sky
	float e2 = 0.02;
	float th0 = fbm(pr * 2.2, s.fp * 2.2, 4);
	float thx = fbm((pr + R * vec2(e2, 0.0)) * 2.2, s.fp * 2.2, 4);
	float thy = fbm((pr + R * vec2(0.0, e2)) * 2.2, s.fp * 2.2, 4);
	float streak = fbm(vec2(pr.x * 0.5, pr.y * 9.0), s.fp * 9.0, 4);
	float th = 1.0 + 0.45 * th0 + 0.22 * streak;
	vec3 col = 1.6 * skyAt(s.z + onScreen(s, vec2(thx - th0, thy - th0) / e2) * 0.06) * pow(tint, vec3(1.25 * th));
	// seed bubbles: a lens (brighter core) inside a dark refracting rim
	vec3 wb = worley(pr * 9.0);
	vec2 rb = rnd2(wb.yz + 3.7);
	float br = 0.04 + 0.1 * rb.x;
	float bubOn = step(0.62, rb.y) * (1.0 - smoothstep(0.15, 0.4, 9.0 * s.fp / br));
	float core = 1.0 - smoothstep(br * 0.4, br * 0.8, wb.x);
	float rim = smoothstep(br * 0.55, br * 0.85, wb.x) * (1.0 - smoothstep(br * 0.85, br, wb.x));
	col *= 1.0 + bubOn * (0.45 * core - 0.55 * rim);
	col = col / (1.0 + 0.45 * col); // the sky is brighter than 1: tone-map, keeping the colour deep
	// lead came: a half-round profile, dull grey with a sheen along its crest, lit from the room side;
	// the glass darkens into the putty beside it
	float gw = max(s.halfW * 1.7, 1.2);
	float x = clamp(s.edgePx / gw, 0.0, 1.0);
	float rl = smoothstep(1.5, 4.0, gw);
	vec3 n = normalize(vec3(-s.inward * x / sqrt(max(1.0 - x * x, 0.04)) * 0.7 * rl, 1.0));
	vec3 lead = vec3(0.15, 0.15, 0.16) * (0.85 + 0.3 * gnoise(s.p * 30.0) * band(s, 30.0));
	lead = lead * (0.35 + 0.9 * max(dot(n, LAMP), 0.0)) + 0.28 * rl * pow(max(dot(n, normalize(LAMP + VIEW)), 0.0), 24.0);
	col *= mix(0.45, 1.0, smoothstep(0.0, gw + 3.0, s.edgePx - gw));
	return mix(col, lead, joint(s, gw));
}

// ---- wood: a board per tile. The figure is the log's growth rings where the saw cut them. A board is a
// plane through a tree: x runs along the grain, y across it, and r is the distance from the pith, so a
// ring is a level line of r. Flat-sawn boards are tangent to the rings and the log tapers, so the rings
// cut them in nested arches ("cathedrals"); quarter-sawn boards run through the pith and the rings come
// out as near-straight stripes, crossed by the medullary rays' flecks (oak's silver figure); an end-grain
// block is cut across the log and shows the rings as arcs about a pith. Within a ring, earlywood is pale
// and porous and darkens into latewood, which ends sharply at the next year's earlywood.
// species k: earlywood, latewood, rings per unit, ray fleck strength, pore strength
void woodSpecies(int k, out vec3 early, out vec3 late, out float rings, out float rays, out float pores) {
	if (k == 0) { early = vec3(0.80, 0.63, 0.42); late = vec3(0.55, 0.38, 0.21); rings = 9.0; rays = 1.0; pores = 1.0; }          // oak
	else if (k == 1) { early = vec3(0.50, 0.34, 0.22); late = vec3(0.26, 0.16, 0.10); rings = 7.0; rays = 0.15; pores = 0.6; }   // walnut
	else if (k == 2) { early = vec3(0.93, 0.84, 0.68); late = vec3(0.83, 0.69, 0.50); rings = 13.0; rays = 0.35; pores = 0.0; }  // maple
	else if (k == 3) { early = vec3(0.78, 0.47, 0.30); late = vec3(0.58, 0.30, 0.17); rings = 10.0; rays = 0.25; pores = 0.15; } // cherry
	else if (k == 4) { early = vec3(0.40, 0.28, 0.19); late = vec3(0.09, 0.06, 0.045); rings = 6.0; rays = 0.0; pores = 0.8; }   // wenge
	else { early = vec3(0.94, 0.80, 0.57); late = vec3(0.72, 0.43, 0.19); rings = 5.0; rays = 0.0; pores = 0.0; }               // pine
}
vec3 shadeWood(Surf s) {
	vec3 early, late; float rings, rays, pores;
	woodSpecies(uWood.x < -0.5 ? sizeStep(s, 6.0) : int(uWood.x), early, late, rings, rays, pores);
	float h0 = fract(s.seed * 7.77), h1 = fract(s.seed * 3.71), h2 = fract(s.seed * 5.13);
	int cut = uWood.y > -0.5 ? int(uWood.y) : h0 < 0.5 ? 0 : h0 < 0.85 ? 1 : 2;
	// grain direction: random per board, or one direction for the floor (the frame carried out from home)
	float ang = uWood.z > 0.5 ? 0.0 : s.seed * 6.2831853;
	vec2 gx = vec2(cos(ang), sin(ang));
	vec2 q = vec2(dot(s.p, gx), dot(s.p, vec2(-gx.y, gx.x))); // x along the grain
	vec2 o = vec2(h1 * 40.0, h2 * 40.0);
	rings *= 2.6 * (0.8 + 0.4 * h2); // the table's counts are per ~0.4 unit
	// growth is never even: the rings wander, slowly along the grain and faster across it
	float wob = 0.06 * fbm(vec2(q.x * 0.6, q.y * 1.5) + o, s.fp * 1.5, 3);
	float r;
	if (cut == 0) {
		float yy = q.y + (h2 - 0.5) * 0.6 + wob;
		float dd = 0.35 + 0.5 * h1 + 0.15 * q.x + 0.1 * fbm(vec2(q.x * 0.25, 7.0) + o, s.fp * 0.25, 2);
		r = sqrt(yy * yy + dd * dd);
	} else if (cut == 1) {
		r = 0.4 + 0.6 * h1 + q.y + 0.6 * wob;
	} else {
		r = length(s.p - vec2(cos(h1 * 6.283), sin(h1 * 6.283)) * (0.6 + 1.2 * h2)) + 0.5 * wob;
	}
	float n = r * rings + 0.3 * fbm(q * vec2(0.8, 4.0) + o, s.fp * 4.0, 3);
	float fr = fract(n);
	float aw = max(0.07, 1.5 * rings * s.fp);
	float lw = smoothstep(0.74, 0.96, fr) * (1.0 - smoothstep(1.0 - aw, 1.0, fr));
	lw = mix(0.2, lw, band(s, rings)); // rings closer than a few px settle to their mean
	// fibres: fine streaks along the grain; pores: dark dashes in the earlywood of ring-porous woods
	float fib = cut == 2 ? fbm(s.p * 40.0 + o, s.fp * 40.0, 3) : fbm(vec2(q.x * 1.5, q.y * 45.0) + o, s.fp * 45.0, 4);
	float pore = smoothstep(0.3, 0.5, gnoise(vec2(q.x * 12.0, q.y * 160.0) + o)) * (1.0 - lw) * pores * band(s, 160.0);
	// rays: on a quarter-sawn face, ribbons of lighter, glossier cells across the stripes
	vec3 wr = worley(vec2(q.x * 2.0, q.y * 14.0) + o);
	float fleck = (1.0 - smoothstep(0.12, 0.3, wr.x)) * step(0.45, rnd2(wr.yz).x) * rays * band(s, 14.0)
		* (cut == 1 ? 1.0 : cut == 0 ? 0.2 : 0.0);
	vec3 c = mix(early, late, lw);
	c *= (1.0 + 0.12 * fib) * (1.0 + 0.12 * fbm(vec2(q.x * 0.8, q.y * 8.0) + o + 5.0, s.fp * 8.0, 3)); // fibres, colour streaks
	c *= 1.0 - 0.35 * pore;
	c = mix(c, early * 1.12, fleck * 0.6);
	c *= (0.88 + 0.24 * fract(s.seed * 11.3)) * (cut == 2 ? 0.85 : 1.0); // board to board; end grain drinks the finish
	// satin finish over a small eased edge; figured wood shimmers where the light runs along its fibres
	// (chatoyance), and since the light is fixed to the screen the shimmer moves as a board turns
	float gw = max(s.halfW * 0.6, 0.5);
	float e = s.edgePx - gw;
	float t = clamp(1.0 - e / (0.025 * s.conf + 1.0), 0.0, 1.0);
	float ar = relief(s, 0.025);
	vec3 nn = normalize(vec3(-s.inward * t * t * 1.2 * ar, 1.0));
	vec2 gs = onScreen(s, gx);
	float chat = cut == 2 ? 0.0 : pow(abs(dot(normalize(gs + 1e-9), normalize(LAMP.xy))), 6.0) * (cut == 1 ? 0.35 : 0.15);
	float dif = max(dot(nn, LAMP), 0.0) / LAMP.z;
	float spec = pow(max(dot(nn, normalize(LAMP + VIEW)), 0.0), 40.0) * 0.25 * ar * smoothstep(0.0, 0.4, t);
	float ao = mix(0.7, 1.0, smoothstep(0.0, 1.5 + 0.02 * s.conf, e));
	vec3 col = c * (0.82 + 0.18 * dif) * ao * (1.0 + chat + fleck * 0.15) + vec3(1.0, 0.97, 0.9) * (0.04 * windowAt(s, nn) + spec);
	// one colour for every joint: a joint pixel on the boundary may land in either board
	return mix(col, vec3(0.13, 0.09, 0.06), joint(s, gw));
}

// ---- cobblestone: a paving sett per tile, laid in sand. Each stone rises from its joint and flattens on
// a top worn smooth by traffic, so its relief is a height field of the distance in from the joint plus a
// hammered roughness; both tilt the normal under a low sun fixed to the screen, which is what makes
// stone read as stone. Granite is speckled (dark mica, pale quartz); the joints fill with dirt and moss.
// stone k: base, speckle
void sett(int k, out vec3 base, out vec3 speck) {
	if (k == 0) { base = vec3(0.50, 0.50, 0.49); speck = vec3(0.14, 0.14, 0.15); }      // grey granite
	else if (k == 1) { base = vec3(0.62, 0.47, 0.41); speck = vec3(0.20, 0.16, 0.16); } // pink granite
	else if (k == 2) { base = vec3(0.23, 0.23, 0.24); speck = vec3(0.42, 0.42, 0.44); } // basalt
	else if (k == 3) { base = vec3(0.66, 0.55, 0.40); speck = vec3(0.48, 0.38, 0.26); } // sandstone
	else { base = vec3(0.46, 0.30, 0.29); speck = vec3(0.64, 0.57, 0.52); }             // porphyry
}
float bumps(vec2 p, float fp) { return fbm(p, fp, 4) + 0.35 * fbm(p * 3.1 + 9.0, fp * 3.1, 3); }
vec3 shadeCobble(Surf s) {
	vec3 base, speck;
	sett(sizeStep(s, 5.0), base, speck);
	float gw = max(s.halfW * 1.6, 1.0);
	// the rounded shoulder's width, hyperbolic: a share of the stone's size, which e + |p| measures along
	// this pixel's way in (continuous, unlike any one side's inradius)
	float eH = max(s.edgeH - gw * s.fp, 0.0);
	float rd = min(0.16, 0.4 * (eH + length(s.p)));
	float x = clamp(eH / max(rd, 1e-4), 0.0, 1.0);
	float slope = 0.75 * (1.0 - x) * relief(s, rd); // d/dx of the shoulder 1 − (1 − x)²
	// roughness by finite differences in p, turned onto the screen; the worn top is smoother
	vec2 pq = s.p * 3.0 + s.seed * 71.0;
	float b0 = bumps(pq, s.fp * 3.0);
	vec2 db = vec2(bumps(pq + vec2(0.03, 0.0), s.fp * 3.0) - b0, bumps(pq + vec2(0.0, 0.03), s.fp * 3.0) - b0) / 0.03 * 3.0 * 0.05;
	// The shoulder falls toward the nearest side, which snaps at a corner and leaves a crease along the
	// bisector; leaning it toward the stone's centre runs smoothly through the corner instead.
	vec2 toCentre = onScreen(s, -s.p);
	vec2 down = dot(toCentre, toCentre) > 0.0 ? normalize(s.inward + 2.0 * normalize(toCentre)) : s.inward;
	vec3 n = normalize(vec3(-down * slope - onScreen(s, db) * mix(1.0, 0.4, x), 1.0));
	// albedo: the stone's tone, mottled, speckled, and dirtier toward the joint
	float sp = gnoise(s.p * 90.0 + s.seed * 13.0);
	vec3 c = base * (0.85 + 0.3 * fract(s.seed * 9.1)) * (0.9 + 0.2 * fbm(s.p * 2.0 + s.seed * 5.0, s.fp * 2.0, 3));
	c = mix(c, speck, smoothstep(0.22, 0.38, sp) * 0.7 * band(s, 90.0));
	c = mix(c, c * 1.35 + 0.08, smoothstep(0.3, 0.45, -sp) * 0.35 * band(s, 90.0)); // quartz
	c = mix(c * 0.7, c, smoothstep(0.0, 0.7, x));
	vec3 L = normalize(vec3(-0.55, 0.55, 0.62)); // a low sun rakes the relief
	float dif = max(dot(n, L), 0.0) / L.z;
	float spec = pow(max(dot(n, normalize(L + VIEW)), 0.0), 30.0) * 0.12 * smoothstep(0.5, 1.0, x);
	vec3 col = c * (0.3 + 0.7 * dif) * mix(0.55, 1.0, smoothstep(0.0, 0.6, x)) + spec;
	// the joint: sand and dirt, greening with moss in places, deep in shadow
	vec3 jc = mix(vec3(0.30, 0.27, 0.22), vec3(0.19, 0.25, 0.12), smoothstep(0.05, 0.35, fbm(s.p * 4.0 + 3.0, s.fp * 4.0, 3)));
	jc *= 0.75 + 0.35 * gnoise(s.p * 50.0) * band(s, 50.0);
	return mix(col, jc * 0.7, joint(s, gw));
}

// ---- SCANNED surfaces: the same three materials, read from photographed PBR maps (albedo, height,
// normal, roughness, AO) and lit physically: GGX microfacets with Schlick's Fresnel and Smith's masking
// for a lamp, and for the room the split-sum environment term with Karis' analytic fit of its BRDF
// (Karis 2014, "Physically Based Shading on Mobile"). The view is a camera above the disk centre, so the
// view vector and with it every reflection varies across the floor, as it does on a real one.
struct Pbr { vec3 albedo; float height; vec3 n; float rough; float ao; };
// One layer of the family's scans, turned by rot and shifted by off per tile, scale texture repeats
// per hyperbolic unit. The footprint is analytic: a screen pixel carried back into uv through the map
// (toScreen), handed to textureGrad, so the mip level holds right up to a tile's edge, where screen
// derivatives would straddle two tiles and jump.
Pbr scanAt(Surf s, float layer, float scale, vec2 rot, vec2 off) {
	vec2 uv = cmul(s.p, rot) * scale + off;
	vec2 Tn = normalize(s.toScreen);
	vec2 dx = cmul(cdiv(vec2(1.0, 0.0), Tn), rot) * s.fp * scale;
	vec2 dy = cmul(cdiv(vec2(0.0, 1.0), Tn), rot) * s.fp * scale;
	vec4 c = textureGrad(uSurfC, vec3(uv, layer), dx, dy);
	vec4 n = textureGrad(uSurfN, vec3(uv, layer), dx, dy);
	Pbr o;
	o.albedo = c.rgb;
	o.height = c.a;
	o.rough = n.b;
	o.ao = n.a;
	// the map's tangent frame on the screen: uv's x axis, and its y axis a quarter turn on (the whole
	// chain of maps is conformal and keeps orientation)
	vec2 X = cmul(cconj(rot), Tn), Y = vec2(-X.y, X.x);
	vec2 nt = n.rg * 2.0 - 1.0;
	o.n = normalize(vec3(X * nt.x + Y * nt.y, sqrt(max(1.0 - dot(nt, nt), 0.0))));
	return o;
}
// the room: a soft ceiling and one large window, blurred by roughness
vec3 roomAt(vec3 R, float rough) {
	vec3 c = mix(vec3(0.16, 0.15, 0.14), vec3(0.62, 0.62, 0.60), smoothstep(-0.2, 1.0, R.z));
	float w = 0.03 + 0.55 * rough * rough;
	float win = smoothstep(1.0 - w - 0.03, 1.0 - 0.3 * w, dot(R, normalize(vec3(-0.42, 0.5, 0.76))));
	return c + vec3(2.6, 2.5, 2.35) * win / (1.0 + 6.0 * rough * rough);
}
vec3 litPbr(Surf s, Pbr m) {
	vec3 V = normalize(vec3(-s.z * 0.55, 1.0));
	vec3 L = normalize(vec3(-0.7, 0.9, 1.5) - vec3(s.z, 0.0)); // a lamp above the upper left
	vec3 N = m.n, H = normalize(L + V);
	// the lamp has a size: a sharper lobe than its disc only aliases on a normal map's sub-pixel detail
	float a = max(m.rough * m.rough, 0.05), a2 = a * a;
	float NdL = max(dot(N, L), 0.0), NdV = max(dot(N, V), 1e-3), NdH = max(dot(N, H), 0.0), VdH = max(dot(V, H), 0.0);
	float dd = NdH * NdH * (a2 - 1.0) + 1.0;
	float D = a2 / (3.14159265 * dd * dd);
	float k = (m.rough + 1.0) * (m.rough + 1.0) / 8.0;
	float G = NdL / (NdL * (1.0 - k) + k) * NdV / (NdV * (1.0 - k) + k);
	vec3 F0 = vec3(0.04);
	vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdH, 5.0);
	vec3 direct = ((1.0 - F) * m.albedo / 3.14159265 + D * G * F / (4.0 * NdL * NdV + 1e-4)) * vec3(1.0, 0.95, 0.88) * 2.4 * NdL;
	vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022), c1 = vec4(1.0, 0.0425, 1.04, -0.04);
	vec4 r = m.rough * c0 + c1;
	float a004 = min(r.x * r.x, exp2(-9.28 * NdV)) * r.x + r.y;
	vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
	vec3 env = roomAt(reflect(-V, N), m.rough) * (F0 * AB.x + AB.y);
	vec3 amb = (1.0 - F0) * m.albedo * vec3(0.42, 0.42, 0.44);
	return direct + (amb + env) * m.ao;
}
// A tile and the joint around it. The joint is geometry, not a stroke: the tile's edge is chipped where
// its own height map runs low and wanders with a slow noise, the tile eases down over a bevel into it,
// and the filler sits below with its own scan, shadowed against the walls either side.
vec3 shadeScanned(Surf s, int fam) {
	float h1 = fract(s.seed * 3.71), h2 = fract(s.seed * 5.13);
	int layer = fam == 1 && uWood.x > -0.5 ? int(uWood.x) : sizeStep(s, uSurfSlots);
	float ang = fam == 1 && uWood.z > 0.5 ? 0.0 : s.seed * 6.2831853;
	if (fam == 1 && layer == 0) ang += 1.5707963; // the oak scan's grain runs up the image, the others across
	float scale = fam == 0 ? 0.42 : fam == 1 ? 0.55 : 0.75;
	Pbr m = scanAt(s, float(layer), scale, vec2(cos(ang), sin(ang)), vec2(h1, h2) * 7.31);
	m.albedo *= 0.9 + 0.2 * fract(s.seed * 11.3); // pieces from one batch still differ a little
	if (fam == 0) {
		m.rough = mix(0.06, 0.2, m.rough); // the marble is polished: its scan is a honed slab
		m.n = normalize(m.n * vec3(0.4, 0.4, 1.0)); // and the polish has filled most of its relief
	}
	// Lippage: no two pieces are laid quite level, so each tilts a little and catches the room differently.
	// The tilt is the tile's own (its seed, in its own frame), so it turns with it.
	vec2 tilt = onScreen(s, (vec2(fract(s.seed * 17.3), fract(s.seed * 29.1)) - 0.5) * (fam == 2 ? 0.0 : 0.06));
	m.n = normalize(m.n + vec3(tilt, 0.0));
	if (fam == 2) m.rough = mix(0.55, 0.95, m.rough);
	// the joint: its half-width in px from the Line stroke, the edge chipped by the tile's own height
	float jw = fam == 1 ? max(s.halfW * 0.3, 0.4) : fam == 0 ? max(s.halfW * 0.65, 0.7) : max(s.halfW * 2.0, 1.5);
	float chip = (fam == 1 ? 0.004 : fam == 0 ? 0.012 : 0.05) * s.conf;
	float wander = (fam == 2 ? 0.03 : 0.01) * s.conf * (0.5 + fbm(s.p * 2.0 + s.seed * 17.0, s.fp * 2.0, 3));
	float e = s.edgePx - jw - chip * (1.0 - m.height) - wander; // px in from the tile's real edge
	float rel = relief(s, fam == 2 ? 0.14 : 0.04);
	vec2 toC = onScreen(s, -s.p);
	vec2 down = dot(toC, toC) > 0.0 ? normalize(s.inward + (fam == 2 ? 2.0 : 0.3) * normalize(toC)) : s.inward;
	if (fam == 2) {
		// a sett rises over a shoulder a share of its size and flattens on a worn top
		float rd = min(0.14 * s.conf, 0.4 * (e + length(s.p) * s.conf));
		float x = clamp(e / max(rd, 1e-3), 0.0, 1.0);
		m.n = normalize(m.n * vec3(mix(1.6, 0.8, x), mix(1.6, 0.8, x), 1.0) + vec3(-down * 1.6 * (1.0 - x) * (1.0 - x) * rel, 0.0));
		m.rough = mix(m.rough, 0.45, x * 0.6);
		m.ao *= mix(0.6, 1.0, smoothstep(0.0, 0.7, x));
	} else {
		// an eased arris a few px wide
		float bev = (fam == 0 ? 0.03 : 0.015) * s.conf + 0.8;
		float t = clamp(1.0 - e / bev, 0.0, 1.0);
		m.n = normalize(m.n + vec3(-down * t * t * 1.3 * rel, 0.0));
		m.ao *= mix(0.75, 1.0, smoothstep(0.0, bev, e));
	}
	vec3 col = litPbr(s, m);
	if (e < 0.75) {
		vec3 jc;
		if (fam == 1) jc = vec3(0.03, 0.02, 0.012); // boards butt: the gap is dark
		else {
			Pbr g = scanAt(s, uSurfSlots, fam == 0 ? 3.0 : 1.6, vec2(1.0, 0.0), vec2(h2, h1)); // the filler, last
			g.n = normalize(mix(vec3(0.0, 0.0, 1.0), g.n, 0.6));
			// the filler sits in the shadow of the walls; the darkest strip runs along them
			g.ao *= mix(0.25, 1.0, smoothstep(0.0, 0.9 * jw + 1.0, -e));
			if (fam == 0) g.albedo *= 0.55; // a dark grout: a pale one between dark slabs reads as a drawn line
			else g.albedo *= 0.62; // sand in the joint is damp and in shade
			jc = litPbr(s, g);
			// the wall on this side casts a shadow across the joint when the lamp is behind it
			vec2 Lxy = normalize(vec2(-0.7, 0.9) - s.z);
			float behind = smoothstep(0.0, 0.6, dot(s.inward, Lxy));
			jc *= 1.0 - (fam == 2 ? 0.65 : 0.4) * behind * (1.0 - smoothstep(0.0, (fam == 2 ? 1.4 : 1.0) * jw, -e));
			// The filler is read in this tile's frame, so on the boundary line itself a pixel could take
			// either neighbour's: there it settles to one value both share (mean filler, flat, unshadowed).
			Pbr mean;
			mean.albedo = fam == 0 ? vec3(0.06, 0.06, 0.058) : vec3(0.16, 0.13, 0.09);
			mean.n = vec3(0.0, 0.0, 1.0);
			mean.rough = 0.85;
			mean.ao = 0.8;
			mean.height = 0.0;
			jc = mix(litPbr(s, mean), jc, smoothstep(0.0, 1.5, s.edgePx));
		}
		col = mix(jc, col, smoothstep(-0.75, 0.75, e));
	}
	return col;
}
`;
