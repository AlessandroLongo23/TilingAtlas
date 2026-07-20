// Symmetry group of a developed hyperbolic tiling → the data a per-pixel Poincaré-disk shader needs to
// draw it infinitely and pixel-perfectly (lib/render/hyperbolicDevelopedShader.ts). The shader REDUCES each
// pixel into a fundamental domain by repeatedly applying the tiling's symmetry-group generators (a small
// set of SU(1,1) isometries), then colours it by which fundamental tile it lands in.
// That works for ANY vertex configuration and — once k≥2 orbit data comes from the develop step — any k,
// because the generators carry the full combinatorial structure; there is no per-vertex config guessing.
//
// For the current 1-uniform patches the generators are recovered GEOMETRICALLY from the baked patch (no
// dependency on the Čtrnáct quotient, which over-produces degenerate covers for the regular cases): a
// symmetry is any isometry carrying the seed tile onto a same-size tile such that the whole central patch
// maps onto itself. The nearest such isometries are the Dirichlet neighbours that bound the fundamental
// domain. When develop later emits k≥2 orbit frames, only this extraction is replaced — the shader is the
// same.

import {
	type Complex,
	type Su11,
	su11Translation,
	su11Rotation,
	su11Mul,
	su11Inverse,
	su11Apply,
	su11ApplyInverse,
	su11Normalize,
	su11Identity,
	geodesicThroughPoints,
	hypDist,
	hypMidpoint,
	tileHue,
} from "@/lib/render/hyperbolic";
import { buildRegularPatch } from "@/lib/render/hyperbolicRegularPatch";

export interface GeodesicConic {
	c0: number;
	c1: number;
	c2: number;
	/** sign of the conic evaluated at the tile interior — a point is inside the edge iff its sign matches. */
	sign: number;
}

export interface GLTile {
	hue: number;
	sides: number;
	/** tile centre (fundamental frame) — mapped back through the reduction for per-tile depth shading. */
	centroid: [number, number];
	edges: GeodesicConic[];
}

export interface GLGenerator {
	/** g⁻¹ as SU(1,1) {a,b} — the shader applies this to move a pixel toward the fundamental domain. */
	gInv: Su11;
	/** g (forward) — used by the CPU view re-base to keep the view matrix bounded. */
	g: Su11;
	/** g·o, the Dirichlet-neighbour copy of the basepoint (the reduction site). */
	site: Complex;
}

export interface HyperbolicTilingGL {
	/** generic basepoint inside the fundamental domain (trivial rotation stabiliser). */
	basepoint: Complex;
	generators: GLGenerator[];
	/** tiles covering the fundamental domain, for the post-reduction colour lookup. */
	tiles: GLTile[];
	/** Every feature point of the baked patch — tile centroids, vertices, and edge midpoints — in world
	 *  coordinates, deduped. The click-to-centre anchor snaps to the nearest of these (see anchorPoint). */
	features: Complex[];
}

const eucCentroid = (pts: Complex[]): Complex => {
	let x = 0, y = 0;
	for (const p of pts) {
		x += p.x;
		y += p.y;
	}
	return { x: x / pts.length, y: y / pts.length };
};

const eucR = (p: Complex): number => Math.hypot(p.x, p.y);

/** The SU(1,1) frame F with F(0)=p and F(edge-endpoint)=q, i.e. F maps the origin to p and the +x edge to
 *  the direction of q. Two such frames compose into the isometry matching one edge to another. */
function mkFrame(p: Complex, q: Complex): Su11 {
	const T = su11Translation(p);
	const qL = su11ApplyInverse(T, q); // q seen from p at the origin
	const theta = Math.atan2(qL.y, qL.x);
	return su11Mul(T, su11Rotation(theta));
}

/** The orientation-preserving isometry taking directed edge (a0→a1) onto (b0→b1). Both edges must have the
 *  same hyperbolic length (they do — every tiling edge is ℓ), so this is exact. */
function edgeToEdge(a0: Complex, a1: Complex, b0: Complex, b1: Complex): Su11 {
	return su11Mul(mkFrame(b0, b1), su11Inverse(mkFrame(a0, a1)));
}

/** Vertices + faces for a REGULAR {p,q} tiling, grown analytically to `layers` edge-reflections (dedups
 *  the tile vertices into a shared index). Used to replace an under-developed regular baked patch. */
function regularPatch(p: number, q: number, layers: number): { verts: Complex[]; faces: number[][] } {
	const tiles = buildRegularPatch(p, q, layers);
	const verts: Complex[] = [];
	const vkey = new Map<string, number>();
	const vidOf = (c: Complex): number => {
		const k = `${Math.round(c.x * 5000)},${Math.round(c.y * 5000)}`;
		let v = vkey.get(k);
		if (v === undefined) {
			v = verts.length;
			vkey.set(k, v);
			verts.push(c);
		}
		return v;
	};
	return { verts, faces: tiles.map((t) => t.verts.map(vidOf)) };
}

/** Evaluate the geodesic conic c0(|z|²+1)+c1·x+c2·y at z. */
function conicAt(c: { c0: number; c1: number; c2: number }, z: Complex): number {
	return c.c0 * (z.x * z.x + z.y * z.y + 1) + c.c1 * z.x + c.c2 * z.y;
}

/** All face centroids with their sizes (for the symmetry test's nearest-centroid match). */
function centroidList(verts: Complex[], faces: number[][]): { x: number; y: number; size: number }[] {
	return faces.map((ring) => {
		const c = eucCentroid(ring.map((v) => verts[v]));
		return { x: c.x, y: c.y, size: ring.length };
	});
}

/** Whether `g` is a symmetry of the tiling, tested on the seed tile's CORONA (itself + its edge-neighbours).
 *  Each corona image is classified against the face centroids: landing ON a centroid (within `tol`) must
 *  match its size; landing INSIDE the patch but off any centroid means `g` is not a symmetry (reject);
 *  landing OUTSIDE the patch is unconfirmable and skipped (the develop patch is finite and often lopsided,
 *  so a genuine neighbour-move can send part of the corona past the boundary — dropping it here would lose
 *  the translation generators and leave only the rotation subgroup). Accept on a quorum of confirmations. */
function isSymmetry(
	g: Su11,
	corona: { c: Complex; size: number }[],
	cents: { x: number; y: number; size: number }[],
	patchR: number,
	tol = 0.02,
): boolean {
	const tol2 = tol * tol;
	let confirmed = 0;
	for (const f of corona) {
		const gc = su11Apply(g, f.c);
		let bestD = Infinity, bestSize = -1;
		for (const c of cents) {
			const dd = (c.x - gc.x) ** 2 + (c.y - gc.y) ** 2;
			if (dd < bestD) {
				bestD = dd;
				bestSize = c.size;
			}
		}
		if (bestD < tol2) {
			if (bestSize !== f.size) return false; // on a centroid of the wrong size
			confirmed++;
		} else if (eucR(gc) < patchR - 0.05) {
			return false; // inside the patch but off every centroid → not a symmetry
		}
		// else: image is past the patch boundary — unconfirmable, skip
	}
	return confirmed >= 2;
}

/** A DEEP generic basepoint for the Dirichlet reduction: the centroid of one flag of the seed tile — its
 *  centre C, an edge midpoint M, and a vertex V. C, V, M are the three rotation centres bounding a
 *  fundamental domain, so their centroid sits roughly equidistant from all of them, deep in the interior
 *  with trivial rotation stabiliser. This matters: a basepoint sitting NEAR a rotation centre has orbit
 *  copies arbitrarily close to it, which degenerate its Voronoi cell and starve the reduction of the
 *  translation neighbours it needs. A deep point's nearest orbit copies ARE its Dirichlet neighbours, all
 *  at comparable distance, so the nearest shell is a complete neighbour set and greedy reduction converges
 *  from anywhere (the standard Fuchsian Dirichlet-domain point reduction). */
function genericBasepoint(seed: Complex[]): Complex {
	const C = eucCentroid(seed);
	const V = seed[0];
	const M: Complex = { x: 0.5 * (seed[0].x + seed[1].x), y: 0.5 * (seed[0].y + seed[1].y) };
	return { x: (C.x + V.x + M.x) / 3, y: (C.y + V.y + M.y) / 3 };
}

/**
 * Build the full shader description of a 1-uniform developed patch: the fundamental-domain generators
 * (nearest self-symmetries), the basepoint, and the central tiles as geodesic-conic edge tests.
 */
export function buildTilingGL(
	inVerts: Complex[],
	inFaces: number[][],
	opts: { maxGen?: number } = {},
): HyperbolicTilingGL {
	const maxGen = opts.maxGen ?? 48;

	// A REGULAR {p,q} patch (all faces one size) from the develop step can be tiny (large tiles), too small
	// to hold the neighbour tiles the extraction needs. Rebuild it analytically with buildRegularPatch, which
	// grows a clean symmetric patch of any size. Mixed tilings keep their (adequate) baked patch.
	let verts = inVerts;
	let faces = inFaces;
	const sizes = faces.map((f) => f.length);
	if (sizes.length > 0 && sizes.every((s) => s === sizes[0])) {
		const inc = new Array<number>(verts.length).fill(0);
		for (const f of faces) for (const v of f) inc[v]++;
		const rp = regularPatch(sizes[0], Math.max(...inc), 4);
		verts = rp.verts;
		faces = rp.faces;
	}

	const cents = centroidList(verts, faces);
	const patchR = Math.max(...verts.map(eucR));

	// seed tile: the face whose centroid is nearest the origin
	let seedFace = 0, seedD = Infinity;
	faces.forEach((ring, fi) => {
		const d = eucR(eucCentroid(ring.map((v) => verts[v])));
		if (d < seedD) {
			seedD = d;
			seedFace = fi;
		}
	});
	const seed = faces[seedFace].map((v) => verts[v]);
	const m = seed.length;
	const basepoint = genericBasepoint(seed);

	// Radii scaled to the tile size (the seed's Euclidean diameter): big tiles put their neighbours and the
	// fundamental cell further out, so both the neighbour-search radius and the colour-lookup radius must grow
	// with them. Without this, {8,4}-style large tiles fall entirely outside fixed radii.
	let scale = 0;
	for (let i = 0; i < seed.length; i++)
		for (let j = i + 1; j < seed.length; j++) scale = Math.max(scale, Math.hypot(seed[i].x - seed[j].x, seed[i].y - seed[j].y));
	const genR = Math.min(0.97, Math.max(0.8, eucR(eucCentroid(seed)) + 3 * scale));

	// validation corona: the seed tile + its EDGE-neighbours (faces sharing ≥2 vertices, i.e. an edge).
	const seedVerts = new Set(faces[seedFace]);
	const corona = faces
		.filter((ring, fi) => fi === seedFace || ring.filter((v) => seedVerts.has(v)).length >= 2)
		.map((ring) => ({ c: eucCentroid(ring.map((v) => verts[v])), size: ring.length }));

	// Group elements: every symmetry carrying the seed tile onto a same-size tile within genR (each rotation
	// offset), validated against the seed corona, plus their inverses. These map the seed's flag onto every
	// nearby flag, so their basepoint images densely surround the basepoint — the Dirichlet neighbours that
	// bound its cell are exactly the nearest of them. No closure: composing SU(1,1) products to fill the ball
	// accumulates float noise (spurious near-identity elements) that drowns the real neighbours. The seed→tile
	// images are exact and directly cover every direction the patch reaches.
	const gkeyOf = (g: Su11) => {
		const s = g.a.x < -1e-9 || (Math.abs(g.a.x) <= 1e-9 && g.a.y < 0) ? -1 : 1;
		return `${Math.round(s * g.a.x * 1e4)},${Math.round(s * g.a.y * 1e4)},${Math.round(s * g.b.x * 1e4)},${Math.round(s * g.b.y * 1e4)}`;
	};
	const elems = new Map<string, { g: Su11; site: Complex }>();
	const add = (raw: Su11) => {
		const g = su11Normalize(raw);
		const site = su11Apply(g, basepoint);
		if (Math.hypot(site.x - basepoint.x, site.y - basepoint.y) < 1e-6) return; // identity
		const k = gkeyOf(g);
		if (elems.has(k)) return;
		if (!isSymmetry(g, corona, cents, patchR)) return;
		elems.set(k, { g, site });
		add(su11Inverse(g)); // the inverse is a symmetry too; its target tile may be past the patch boundary
	};
	for (const ring of faces) {
		if (ring.length !== m) continue;
		const T = ring.map((v) => verts[v]);
		if (eucR(eucCentroid(T)) > genR) continue;
		for (let r = 0; r < m; r++) add(edgeToEdge(seed[0], seed[1], T[r], T[(r + 1) % m]));
	}

	// The reduction's Dirichlet neighbours are the nearest copies of the (deep) basepoint; keep the nearest
	// maxGen, which surrounds it and bounds its cell.
	const generators = [...elems.values()]
		.sort((a, b) => hypDist(basepoint, a.site) - hypDist(basepoint, b.site))
		.slice(0, maxGen)
		.map((e) => ({ g: e.g, gInv: su11Inverse(e.g), site: e.site }));

	// Colour-lookup tiles: only the faces that OVERLAP the fundamental cell D(o), since the reduction lands
	// every pixel inside D(o). D(o) = the points closer to the basepoint than to any neighbour copy; a face
	// overlaps it iff one of its sample points (vertices, edge midpoints, centroid) lies in D(o). That is a
	// handful of tiles, not the whole central disc — keeping the shader's tile array small and complete.
	const invDen = (p: Complex) => 1 / Math.max(1 - (p.x * p.x + p.y * p.y), 1e-9);
	const oInvDen = invDen(basepoint);
	const sites = generators.map((g) => ({ s: g.site, invDen: invDen(g.site) }));
	// A sample counts as in-cell if no neighbour copy is CLEARLY closer than the basepoint (the 0.85 slack
	// pulls in tiles that only clip the cell boundary, so a pixel reduced onto such a boundary tile is never
	// left uncoloured).
	const inCell = (z: Complex): boolean => {
		const dO = ((z.x - basepoint.x) ** 2 + (z.y - basepoint.y) ** 2) * oInvDen;
		for (const { s, invDen: d } of sites) {
			if (((z.x - s.x) ** 2 + (z.y - s.y) ** 2) * d < dO * 0.85) return false;
		}
		return true;
	};
	const tiles: GLTile[] = [];
	for (const ring of faces) {
		const pts = ring.map((v) => verts[v]);
		const c = eucCentroid(pts);
		const samples = [c, ...pts, ...pts.map((p, i) => ({ x: 0.5 * (p.x + pts[(i + 1) % pts.length].x), y: 0.5 * (p.y + pts[(i + 1) % pts.length].y) }))];
		if (!samples.some(inCell)) continue;
		const edges: GeodesicConic[] = [];
		for (let i = 0; i < pts.length; i++) {
			const conic = geodesicThroughPoints(pts[i], pts[(i + 1) % pts.length]);
			edges.push({ ...conic, sign: Math.sign(conicAt(conic, c)) || 1 });
		}
		tiles.push({ hue: tileHue(ring.length), sides: ring.length, centroid: [c.x, c.y], edges });
	}

	// Feature points for click-to-centre: every tile centroid, vertex, and (hyperbolic) edge midpoint of the
	// patch, deduped by rounded position. anchorPoint snaps a clicked world point to the nearest of these.
	const featKey = new Map<string, Complex>();
	const addFeat = (c: Complex) => {
		const k = `${Math.round(c.x * 4000)},${Math.round(c.y * 4000)}`;
		if (!featKey.has(k)) featKey.set(k, c);
	};
	for (const ring of faces) {
		const pts = ring.map((v) => verts[v]);
		addFeat(eucCentroid(pts));
		for (let i = 0; i < pts.length; i++) {
			addFeat(pts[i]);
			addFeat(hypMidpoint(pts[i], pts[(i + 1) % pts.length]));
		}
	}
	const features = [...featKey.values()];

	return { basepoint, generators, tiles, features };
}

/** Point-in-tile test used by tests and the CPU re-base sanity checks (mirrors the shader). */
export function tileContains(tile: GLTile, z: Complex): boolean {
	for (const e of tile.edges) {
		if (Math.sign(conicAt(e, z)) !== e.sign) return false;
	}
	return true;
}

/** Reduce a point into the fundamental domain by the generators (greedy nearest-site descent). Mirrors the
 *  shader's per-pixel loop; also the core of the view re-base. Returns the reduced point. */
export function reducePoint(gl: HyperbolicTilingGL, z0: Complex, maxIter = 128): Complex {
	let z = z0;
	const invDenO = 1 / Math.max(1 - (gl.basepoint.x ** 2 + gl.basepoint.y ** 2), 1e-9);
	for (let iter = 0; iter < maxIter; iter++) {
		const dz0x = z.x - gl.basepoint.x, dz0y = z.y - gl.basepoint.y;
		let bestF = (dz0x * dz0x + dz0y * dz0y) * invDenO;
		let best = -1;
		for (let j = 0; j < gl.generators.length; j++) {
			const s = gl.generators[j].site;
			const invDen = 1 / Math.max(1 - (s.x * s.x + s.y * s.y), 1e-9);
			const dx = z.x - s.x, dy = z.y - s.y;
			const f = (dx * dx + dy * dy) * invDen;
			if (f < bestF - 1e-9) {
				bestF = f;
				best = j;
			}
		}
		if (best < 0) return z;
		z = su11Apply(gl.generators[best].gInv, z);
	}
	return z;
}

/** Snap a world point to the nearest tiling feature (tile centroid, vertex, or edge midpoint) for the
 *  click-to-centre interaction.
 *  Reduces the point into the fundamental domain (so it works anywhere on the disk, however far the view has
 *  panned), accumulating the reduction isometry g (z_reduced = g·world); finds the nearest FUNDAMENTAL
 *  feature to the reduced point; then maps it back through g⁻¹ to the copy nearest the click. Returns the
 *  world point to bring to the disk centre. */
export function anchorPoint(gl: HyperbolicTilingGL, world: Complex, maxIter = 128): Complex {
	let z = world;
	let g = su11Identity(); // z = g · world
	const o = gl.basepoint;
	const invDenO = 1 / Math.max(1 - (o.x * o.x + o.y * o.y), 1e-9);
	for (let iter = 0; iter < maxIter; iter++) {
		const dz0x = z.x - o.x, dz0y = z.y - o.y;
		let bestF = (dz0x * dz0x + dz0y * dz0y) * invDenO;
		let best = -1;
		for (let j = 0; j < gl.generators.length; j++) {
			const s = gl.generators[j].site;
			const invDen = 1 / Math.max(1 - (s.x * s.x + s.y * s.y), 1e-9);
			const dx = z.x - s.x, dy = z.y - s.y;
			const f = (dx * dx + dy * dy) * invDen;
			if (f < bestF - 1e-9) {
				bestF = f;
				best = j;
			}
		}
		if (best < 0) break;
		z = su11Apply(gl.generators[best].gInv, z);
		g = su11Normalize(su11Mul(gl.generators[best].gInv, g));
	}
	if (gl.features.length === 0) return world;
	let bf = gl.features[0], bd = Infinity;
	for (const f of gl.features) {
		const d = (f.x - z.x) ** 2 + (f.y - z.y) ** 2;
		if (d < bd) {
			bd = d;
			bf = f;
		}
	}
	return su11ApplyInverse(g, bf); // g⁻¹ · (nearest fundamental feature) → the copy nearest the click
}

/** Re-base the view so its centre sits in the fundamental domain, keeping |view·0| bounded under unbounded
 *  panning (the general-tiling analogue of su11Rebase). The image is unchanged: view ← view·g. */
export function rebaseView(gl: HyperbolicTilingGL, view: Su11, maxIter = 64): Su11 {
	let v = view;
	const o = gl.basepoint;
	const invDenO = 1 / Math.max(1 - (o.x * o.x + o.y * o.y), 1e-9);
	for (let iter = 0; iter < maxIter; iter++) {
		const w = su11ApplyInverse(v, { x: 0, y: 0 }); // world point at the screen centre
		const dwx = w.x - o.x, dwy = w.y - o.y;
		let bestF = (dwx * dwx + dwy * dwy) * invDenO;
		let best = -1;
		for (let j = 0; j < gl.generators.length; j++) {
			const s = gl.generators[j].site;
			const invDen = 1 / Math.max(1 - (s.x * s.x + s.y * s.y), 1e-9);
			const dx = w.x - s.x, dy = w.y - s.y;
			const f = (dx * dx + dy * dy) * invDen;
			if (f < bestF - 1e-9) {
				bestF = f;
				best = j;
			}
		}
		if (best < 0) break;
		v = su11Normalize(su11Mul(v, gl.generators[best].g));
	}
	return v;
}
