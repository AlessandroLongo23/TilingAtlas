// Scene geometry for a Platonic-solid "freedraw" pattern — Marek Čtrnáct's spherical freedraw
// (2026-07-23). The base is one of the five Platonic solids; a pattern is a subset of its edges DRAWN,
// and the tiles are the regions the drawn edges cut out (connected runs of the solid's faces across
// UNDRAWN edges). We draw the tiles as coloured faces plus the drawn edges as tubes.
//
// Two consistent looks (mode): "polyhedron" = FLAT facets + STRAIGHT chord edges (both faceted), and
// "sphere" = curved spherical patches + GREAT-CIRCLE arc edges (both round). Faces may be triangles,
// squares or pentagons — each is fan-triangulated (and, in sphere mode, subdivided onto the sphere).
//
// The catalogue JSON references VERTEX INDICES (the platonicSolids.ts solid's own order), so `vertices`
// here is that same array normalised. Reuses buildTubeSkeleton (the wireframe sweep) for the edges.

import * as THREE from "three";
import { buildTubeSkeleton, type Wireframe } from "./sphericalWireframe";

export type IcoMode = "sphere" | "polyhedron";

export interface IcoPattern {
	id: string;
	k: number;
	achiral: boolean;
	drawn: [number, number][]; // edges as vertex-index pairs into the solid
	tiles: number[][][]; // per tile: its faces, each a vertex-index ring (length 3/4/5)
	nDrawn: number;
	nTiles: number;
	vorbit?: number[];
}

type V3 = [number, number, number];

function nrm(a: V3): V3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function dot(a: V3, b: V3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function sub(a: V3, b: V3): V3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V3, b: V3): V3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// HSB→RGB (0..1), matching the app's tile-hue convention (hsb2rgb in sphericalWireframe).
function hsb2rgb(hueDeg: number, s: number, v: number): [number, number, number] {
	const h = (((hueDeg / 360) % 1) + 1) % 1;
	const k = (o: number) => {
		const x = (((h * 6 + o) % 6) + 6) % 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	const m = (kk: number) => v * (1 - s) + v * s * kk;
	return [m(k(0)), m(k(4)), m(k(2))];
}

// A tile's colour: golden-angle hue spacing keyed on tile index, so adjacent tiles stay distinct. The
// single-tile case (a blank solid) gets a neutral base hue so it doesn't scream.
export function tileColor(tileIndex: number, tileCount: number, hueOffset = 0): [number, number, number] {
	if (tileCount <= 1) return hsb2rgb(210 + hueOffset, 0.32, 0.95);
	return hsb2rgb(tileIndex * 137.508 + hueOffset, 0.5, 0.98);
}

// A great-circle arc between two unit vertices (slerp), radius `radius`, `extend` overshoots each end.
function greatCircleArc(u: V3, v: V3, segments: number, radius: number, extend = 0): Float32Array {
	const out = new Float32Array((segments + 1) * 3);
	const omega = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
	const sinOmega = Math.sin(omega);
	const span = omega + 2 * extend;
	for (let i = 0; i <= segments; i++) {
		const theta = -extend + (i / segments) * span;
		let x: number, y: number, z: number;
		if (sinOmega < 1e-6) {
			const t = theta / (omega || 1);
			x = u[0] + (v[0] - u[0]) * t;
			y = u[1] + (v[1] - u[1]) * t;
			z = u[2] + (v[2] - u[2]) * t;
		} else {
			const wa = Math.sin(omega - theta) / sinOmega;
			const wb = Math.sin(theta) / sinOmega;
			x = u[0] * wa + v[0] * wb;
			y = u[1] * wa + v[1] * wb;
			z = u[2] * wa + v[2] * wb;
		}
		const p = nrm([x, y, z]);
		out[i * 3] = p[0] * radius;
		out[i * 3 + 1] = p[1] * radius;
		out[i * 3 + 2] = p[2] * radius;
	}
	return out;
}

// A straight chord between two unit vertices (the flat solid's real edge), extended along the chord.
function straightArc(u: V3, v: V3, radius: number, extend = 0): Float32Array {
	const a: V3 = [u[0] * radius, u[1] * radius, u[2] * radius];
	const b: V3 = [v[0] * radius, v[1] * radius, v[2] * radius];
	const d = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
	return new Float32Array([
		a[0] - d[0] * extend, a[1] - d[1] * extend, a[2] - d[2] * extend,
		b[0] + d[0] * extend, b[1] + d[1] * extend, b[2] + d[2] * extend,
	]);
}

export interface IcoFreedraw {
	object: THREE.Group;
	dispose: () => void;
}

export interface IcoOptions {
	mode?: IcoMode; // "polyhedron" flat facets + chord edges, "sphere" curved patches + arc edges
	radius?: number; // sphere radius (default 1)
	hueOffset?: number;
	dark?: boolean;
	edgeThickness?: number; // drawn-edge tube radius (default 0.006 = buildFlatSolid's edgeRadius(1))
	showGrid?: boolean; // draw ALL of the solid's edges faintly (the underlying grid)
	allEdges?: [number, number][]; // the full edge list (vertex-index pairs), for showGrid
}

// Subdivision order for the curved spherical patches (sphere mode). N² sub-triangles per fan triangle.
// High enough that the projected mesh reads as a true sphere — the rim is N segments per face edge, so
// ~20 makes the silhouette a smooth circle. Shading is already smooth (radial per-vertex normals); this
// only refines the geometry/silhouette. One sphere is cheap, so a fine mesh is fine.
const SPHERE_SUBDIV = 22;

// One spherical sub-patch of the triangle (A,B,C): a barycentric grid pushed onto the sphere, SMOOTH
// (radial) per-vertex normals so the patches shade as one continuous surface.
function pushSphericalTri(positions: number[], normals: number[], colors: number[], A: V3, B: V3, C: V3, radius: number, col: V3) {
	const M = SPHERE_SUBDIV;
	const dir = (i: number, j: number): V3 => {
		const u = i / M, v = j / M, w = 1 - u - v;
		return nrm([A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, A[2] * w + B[2] * u + C[2] * v]);
	};
	const emit = (d: V3) => {
		positions.push(d[0] * radius, d[1] * radius, d[2] * radius);
		normals.push(d[0], d[1], d[2]);
		colors.push(col[0], col[1], col[2]);
	};
	for (let i = 0; i < M; i++) {
		for (let j = 0; j < M - i; j++) {
			emit(dir(i, j)); emit(dir(i + 1, j)); emit(dir(i, j + 1));
			if (i + j < M - 1) { emit(dir(i + 1, j)); emit(dir(i + 1, j + 1)); emit(dir(i, j + 1)); }
		}
	}
}

// A flat polygon face (any ring length), fan-triangulated with the polygon's single OUTWARD plane
// normal. Winding is irrelevant: the material is DoubleSide and every vertex carries this explicit
// normal, so the facet shades flat and correctly regardless of ring orientation.
function pushFlatFace(positions: number[], normals: number[], colors: number[], ring: V3[], radius: number, col: V3) {
	const P = ring.map((v) => [v[0] * radius, v[1] * radius, v[2] * radius] as V3);
	let n = nrm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
	if (dot(n, P[0]) < 0) n = [-n[0], -n[1], -n[2]]; // outward
	for (let i = 1; i < P.length - 1; i++) {
		for (const p of [P[0], P[i], P[i + 1]]) {
			positions.push(p[0], p[1], p[2]);
			normals.push(n[0], n[1], n[2]);
			colors.push(col[0], col[1], col[2]);
		}
	}
}

// A curved spherical face (any ring length): fan-triangulate on the unit sphere, each fan triangle a
// subdivided spherical patch. Fan triangles share the diagonal from ring[0], evaluated identically on
// both sides, so no cracks.
function pushSphericalFace(positions: number[], normals: number[], colors: number[], ring: V3[], radius: number, col: V3) {
	const U = ring.map(nrm);
	// outward test on the flat polygon; if inward, reverse so sub-triangles wind outward
	let fn = cross(sub(U[1], U[0]), sub(U[2], U[0]));
	const flip = dot(fn, U[0]) < 0;
	for (let i = 1; i < U.length - 1; i++) {
		const a = U[0], b = flip ? U[i + 1] : U[i], c = flip ? U[i] : U[i + 1];
		pushSphericalTri(positions, normals, colors, a, b, c, radius, col);
	}
}

export function buildIcoFreedraw(pattern: IcoPattern, rawVertices: V3[], opts: IcoOptions = {}): IcoFreedraw {
	const radius = opts.radius ?? 1;
	const mode: IcoMode = opts.mode ?? "polyhedron";
	const dark = opts.dark ?? true;
	// Same edge-tube builder and radius as a normal spherical solid (buildFlatSolid → edgeRadius(1) = 0.006),
	// so a freedraw drawn edge and a normal tiling edge read the same weight at stroke width 1.
	const thickness = opts.edgeThickness ?? 0.006;
	const V = rawVertices.map(nrm);

	const group = new THREE.Group();
	const disposers: (() => void)[] = [];

	// --- coloured faces, by tile ---
	const positions: number[] = [];
	const normals: number[] = [];
	const colors: number[] = [];
	pattern.tiles.forEach((tile, ti) => {
		const col = tileColor(ti, pattern.nTiles, opts.hueOffset ?? 0);
		for (const face of tile) {
			const ring = face.map((idx) => V[idx]);
			if (mode === "sphere") pushSphericalFace(positions, normals, colors, ring, radius, col);
			else pushFlatFace(positions, normals, colors, ring, radius, col);
		}
	});
	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
	geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
	geom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
	const facetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
	const facetMesh = new THREE.Mesh(geom, facetMat);
	group.add(facetMesh);
	disposers.push(() => {
		geom.dispose();
		facetMat.dispose();
	});

	const edgeArc = (i: number, j: number, r: number, extend: number) =>
		mode === "sphere" ? greatCircleArc(V[i], V[j], 20, r, extend) : straightArc(V[i], V[j], r, extend);

	// --- underlying grid: all of the solid's edges, faint and thin, under the drawn ink. Tube centre sits
	// ON the surface (radius), so half is buried and only the thin outer sliver shows; plus low opacity. ---
	if (opts.showGrid && opts.allEdges && opts.allEdges.length) {
		const gridThick = thickness * 0.28;
		const gridColor: [number, number, number] = dark ? [0.5, 0.5, 0.56] : [0.5, 0.5, 0.55];
		const gridArcs = (extend: number) => opts.allEdges!.map(([i, j]) => edgeArc(i, j, radius, extend));
		const grid = buildTubeSkeleton(gridArcs, 0, { section: "tube", thickness: gridThick, color: gridColor, union: false });
		grid.object.traverse((o) => {
			const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
			if (mat) {
				mat.transparent = true;
				(mat as THREE.MeshStandardMaterial).opacity = 0.45;
			}
		});
		group.add(grid.object);
		disposers.push(() => grid.dispose());
	}

	// --- drawn edges as tubes: arcs on the sphere, chords on the solid. Tube CENTRE on the surface
	// (radius), so half the section is inside the sphere and only the outer half is visible — ink on the
	// surface, not a bar floating above it. ---
	if (pattern.drawn.length > 0) {
		const edgeColor: [number, number, number] = dark ? [0.06, 0.06, 0.08] : [0.1, 0.1, 0.12];
		const arcsFor = (extend: number) => pattern.drawn.map(([i, j]) => edgeArc(i, j, radius, extend));
		const tubes: Wireframe = buildTubeSkeleton(arcsFor, 0, { section: "tube", thickness, color: edgeColor, union: false });
		group.add(tubes.object);
		disposers.push(() => tubes.dispose());
	}

	return {
		object: group,
		dispose: () => disposers.forEach((d) => d()),
	};
}
