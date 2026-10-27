// The Tegula shelf's geometry: a straight skeleton per topological type, bent in the browser.
//
// A type from Tegula (Zeller, Delgado-Friedrichs, Huson 2021) is a Delaney-Dress symbol: topology and
// symmetry, no shape. tools/ctrnact-oracle/develop_dsym.py gives each one an equilibrium drawing with
// straight edges and ships THAT, with every side of every tile tagged by its edge class. The curves are
// made here, for two reasons: the file is a third of the size, and the reader can reshape them.
//
// WHY BEND AT ALL. The straight drawing has every symmetry of the underlying graph, so all the types
// on one topology look alike: 93 isogonal types, 11 pictures. Bending each edge class by a curve that
// has exactly the symmetry of that edge's stabilizer leaves the type's own group intact and removes
// the surplus. These are Grünbaum and Shephard's edge shapes, the same four Tactile uses:
//
//   J  nothing fixes the edge        any curve; the handle moves freely
//   U  a mirror crosses the edge     symmetric about the midpoint; the handle only moves in and out
//   S  a half-turn at the midpoint   odd about the midpoint; one handle at the quarter point
//   I  a mirror runs along the edge  must stay straight; no handle
//
// A side's tag is class * 4 + reversed * 2 + farSide: where this tile sits on its class's curve, which
// is drawn from the class representative's vertex towards the representative's tile.

import type { CellPolygonData, TranslationalCellData } from "@/lib/classes/algorithm/types";

export interface TegulaCell {
	basis: number[][];
	polys: { v: number[][]; hue: number; sides: number[] }[];
	/** Small triangles for the few types whose edges are all pinned straight (see develop_dsym.py). */
	marks?: number[][][];
	/** One letter per edge class: J, U, S or I. */
	kinds: string;
	/** Default handle per class: [position along the edge 0..1, height in edge lengths]. */
	shape: number[][];
}

// Segments per bent edge. 24 reads as a curve at /play zoom; the cost is only paid on first draw.
const SEG = 24;
const X_RANGE: [number, number] = [0.15, 0.85];
const Y_MAX = 0.45;

/** The shelf's fill: tile class i at the golden angle i·137.5°, as develop_dsym.py writes it. Every surface
 *  a Tegula type is drawn on uses this, so one class is one colour on the plane, the sphere and the disk. */
export function tegulaHue(cls: number): number {
	// Python's round sends a half to the even neighbour; the shipped cells were rounded that way.
	const x = (cls * 137.5) % 360;
	const f = Math.floor(x);
	return x - f === 0.5 ? f + (f % 2) : Math.round(x);
}

/** Height of a class's curve at parameter u along its representative edge, for a handle (x, y). */
function profile(kind: string, x: number, y: number, u: number): number {
	if (kind === "U") return y * Math.sin(Math.PI * u);
	if (kind === "S") return y * Math.sin(2 * Math.PI * u);
	if (kind === "J") return y * Math.sin(Math.PI * u ** (Math.log(0.5) / Math.log(x)));
	return 0;
}

/** Keep a dragged handle where its edge's symmetry allows it. */
export function clampHandle(kind: string, x: number, y: number): [number, number] {
	const h = Math.max(-Y_MAX, Math.min(Y_MAX, y));
	if (kind === "U") return [0.5, h];
	if (kind === "S") return [0.25, h];
	return [Math.max(X_RANGE[0], Math.min(X_RANGE[1], x)), h];
}

/** The drawable cell: every tile's ring with its bent sides flattened, true corners marked. */
export function bendTegula(t: TegulaCell, shape: number[][] = t.shape): TranslationalCellData {
	const cellPolygons: CellPolygonData[] = t.polys.map(({ v, hue, sides }) => {
		const vertices: number[][] = [];
		const corners: number[] = [];
		for (let i = 0; i < v.length; i++) {
			const a = v[i],
				b = v[(i + 1) % v.length];
			const cls = sides[i] >> 2,
				rev = (sides[i] & 2) !== 0,
				far = (sides[i] & 1) !== 0;
			const [x, y] = shape[cls] ?? t.shape[cls];
			corners.push(vertices.length);
			vertices.push(a);
			if (t.kinds[cls] === "I" || y === 0) continue;
			const dx = b[0] - a[0],
				dy = b[1] - a[1];
			for (let s = 1; s < SEG; s++) {
				const u = s / SEG;
				// Tiles are counter-clockwise, so (-dy, dx) points into this tile and is one edge long.
				const h = (far ? -1 : 1) * profile(t.kinds[cls], x, y, rev ? 1 - u : u);
				vertices.push([a[0] + u * dx - h * dy, a[1] + u * dy + h * dx]);
			}
		}
		return corners.length < vertices.length ? { n: v.length, vertices, corners, hue } : { n: v.length, vertices, hue };
	});
	for (const m of t.marks ?? []) cellPolygons.push({ n: m.length, vertices: m, hue: -1, mark: true });
	return { cellPolygons, basis: t.basis };
}

export interface TegulaHandle {
	cls: number;
	kind: string;
	/** The representative edge: start, and the vector to its far end. */
	a: number[];
	d: number[];
	/** Where the handle sits, in cell coordinates. */
	at: number[];
}

/** One handle per bendable class, on the first side that is that class's representative. */
export function tegulaHandles(t: TegulaCell, shape: number[][] = t.shape): TegulaHandle[] {
	const out: TegulaHandle[] = [];
	const seen = new Set<number>();
	for (const { v, sides } of t.polys) {
		for (let i = 0; i < v.length; i++) {
			const cls = sides[i] >> 2;
			if ((sides[i] & 3) !== 0 || seen.has(cls) || t.kinds[cls] === "I") continue;
			seen.add(cls);
			const a = v[i],
				b = v[(i + 1) % v.length];
			const d = [b[0] - a[0], b[1] - a[1]];
			const [x, y] = shape[cls] ?? t.shape[cls];
			out.push({ cls, kind: t.kinds[cls], a, d, at: [a[0] + x * d[0] - y * d[1], a[1] + x * d[1] + y * d[0]] });
		}
	}
	return out;
}

/** A point in cell coordinates, read as a handle (x, y) on the edge from `a` along `d`. */
export function handleFromPoint(h: Pick<TegulaHandle, "a" | "d" | "kind">, p: number[]): [number, number] {
	const len2 = h.d[0] ** 2 + h.d[1] ** 2 || 1;
	const rx = p[0] - h.a[0],
		ry = p[1] - h.a[1];
	return clampHandle(h.kind, (rx * h.d[0] + ry * h.d[1]) / len2, (ry * h.d[0] - rx * h.d[1]) / len2);
}

// ---------------------------------------------------------------------------------------------------
// The same bends on a sphere. A spherical type ships as a solid (SphPolyPattern) with every ring side
// tagged exactly as a plane tile's sides are, so the profiles above apply unchanged; what differs is
// that an edge is a great-circle arc, and a height is an angle off that arc, towards the tile.

type V3 = [number, number, number];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix3 = (a: V3, ka: number, b: V3, kb: number): V3 => [
	a[0] * ka + b[0] * kb,
	a[1] * ka + b[1] * kb,
	a[2] * ka + b[2] * kb,
];
const unit3 = (a: V3): V3 => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
};

/** The arc from a to b as a frame: its length, the unit tangent at a, and the pole on the tile's side
 *  (rings are counter-clockwise seen from outside, so the tile is to the left of travel). */
function arcFrame(a: V3, b: V3) {
	const n = unit3(cross3(a, b));
	return { len: Math.acos(Math.max(-1, Math.min(1, dot3(a, b)))), t: cross3(n, a), n };
}

/** The point at fraction u along the arc, lifted h arc-lengths towards the tile. */
function arcPoint(a: V3, f: ReturnType<typeof arcFrame>, u: number, h: number): V3 {
	const g = mix3(a, Math.cos(u * f.len), f.t, Math.sin(u * f.len));
	return unit3(mix3(g, Math.cos(h * f.len), f.n, Math.sin(h * f.len)));
}

/** What a spherical record needs to be bent: lib/tilings/sph-poly.ts SphPolyPattern, the fields used. */
export interface SphereBendable {
	vertices: V3[];
	faces: number[][];
	fillGroup?: number[];
	symOrbit: number[];
	bend?: { sides: number[][]; kinds: string; centers: V3[]; shape: number[][]; halves?: boolean };
}

/** Every tile's ring with its bent sides sampled: points on the unit sphere, in ring order. */
export function sphereRings(p: SphereBendable, shape: number[][] = p.bend!.shape): V3[][] {
	const { sides, kinds } = p.bend!;
	return p.faces.map((ring, f) => {
		const out: V3[] = [];
		for (let i = 0; i < ring.length; i++) {
			const a = p.vertices[ring[i]],
				b = p.vertices[ring[(i + 1) % ring.length]];
			const tag = sides[f][i],
				cls = tag >> 2;
			const [x, y] = shape[cls] ?? p.bend!.shape[cls];
			out.push(a);
			if (kinds[cls] === "I" || y === 0) continue;
			const fr = arcFrame(a, b);
			for (let s = 1; s < SEG; s++) {
				const u = s / SEG;
				out.push(
					arcPoint(a, fr, u, ((tag & 1) !== 0 ? -1 : 1) * profile(kinds[cls], x, y, (tag & 2) !== 0 ? 1 - u : u)),
				);
			}
		}
		return out;
	});
}

/**
 * The solid with its edges bent, in the record's own shape so the same canvas draws it. A bent tile is
 * not a spherical polygon any more, so it is handed over as a fan of triangles about its centre, all in
 * the tile's own fill group, and its outline as the short arcs between consecutive ring points.
 *
 * Unbent, a record that has no edge points is returned as it is: its picture is the polyhedron. One
 * that has them (a type with an edge too long for a single arc) is fanned even when unbent, because a
 * ring through those points is a lune or a near-hemisphere and a flat face through it is not the tile.
 */
export function bendSphere<T extends SphereBendable>(p: T, shape: number[][] = p.bend?.shape ?? []): T {
	if (!p.bend) return p;
	if (!p.bend.halves && shape.every((q, c) => p.bend!.kinds[c] === "I" || (q?.[1] ?? 0) === 0)) return p;
	const vertices: V3[] = [...p.vertices];
	const faces: number[][] = [];
	const fillGroup: number[] = [];
	const edges = new Map<string, [number, number]>();
	const index = new Map<string, number>();
	const at = (q: V3) => {
		const k = `${Math.round(q[0] * 1e5)},${Math.round(q[1] * 1e5)},${Math.round(q[2] * 1e5)}`;
		let i = index.get(k);
		if (i === undefined) {
			i = vertices.push(q) - 1;
			index.set(k, i);
		}
		return i;
	};
	p.vertices.forEach((q, i) =>
		index.set(`${Math.round(q[0] * 1e5)},${Math.round(q[1] * 1e5)},${Math.round(q[2] * 1e5)}`, i),
	);
	sphereRings(p, shape).forEach((ring, f) => {
		const c = at(p.bend!.centers[f]);
		const idx = ring.map(at);
		for (let i = 0; i < idx.length; i++) {
			const a = idx[i],
				b = idx[(i + 1) % idx.length];
			faces.push([c, a, b]);
			fillGroup.push(p.fillGroup?.[f] ?? 0);
			edges.set(a < b ? `${a}-${b}` : `${b}-${a}`, [a, b]);
		}
	});
	// Points added along the edges belong to no vertex orbit: one label past the real ones.
	const symOrbit = vertices.map((_, i) => p.symOrbit[i] ?? -1);
	return {
		...p,
		vertices,
		faces,
		faceSize: faces.map(() => 3),
		fillGroup,
		edges: [...edges.values()],
		symOrbit,
		vorbit: symOrbit,
	};
}

export interface SphereHandle {
	cls: number;
	kind: string;
	/** The representative edge, as unit vectors. */
	a: V3;
	b: V3;
	/** Where the handle sits on the sphere. */
	at: V3;
}

/** One handle per bendable class, on the copy of its representative side that faces `axis` most. A
 *  class has a copy for every symmetry of the solid, so one of them is always on the near side. */
export function sphereHandles(p: SphereBendable, shape: number[][], axis: V3): SphereHandle[] {
	const best = new Map<number, { a: V3; b: V3; face: number }>();
	p.faces.forEach((ring, f) => {
		for (let i = 0; i < ring.length; i++) {
			const tag = p.bend!.sides[f][i],
				cls = tag >> 2;
			if ((tag & 3) !== 0 || p.bend!.kinds[cls] === "I") continue;
			const a = p.vertices[ring[i]],
				b = p.vertices[ring[(i + 1) % ring.length]];
			const face = dot3(unit3(mix3(a, 1, b, 1)), axis);
			if (face > (best.get(cls)?.face ?? -2)) best.set(cls, { a, b, face });
		}
	});
	return [...best.entries()]
		.sort((x, y) => x[0] - y[0])
		.map(([cls, { a, b }]) => {
			const [x, y] = shape[cls] ?? p.bend!.shape[cls];
			return { cls, kind: p.bend!.kinds[cls], a, b, at: arcPoint(a, arcFrame(a, b), x, y) };
		});
}

/** A point of the sphere, read as a handle (x, y) on the arc from a to b. */
export function sphereHandleFromPoint(h: Pick<SphereHandle, "a" | "b" | "kind">, q: V3): [number, number] {
	const f = arcFrame(h.a, h.b);
	const up = dot3(q, f.n);
	const flat = mix3(q, 1, f.n, -up);
	return clampHandle(
		h.kind,
		Math.atan2(dot3(flat, f.t), dot3(flat, h.a)) / f.len,
		Math.asin(Math.max(-1, Math.min(1, up))) / f.len,
	);
}
