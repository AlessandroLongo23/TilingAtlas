// The wireframe skeleton: the tiling's edges as 3D tubes with NO filled sphere — a hollow structure you
// see through. Each great-circle edge is swept with a cross-section along a per-point frame (radial R
// outward, S tangent-to-surface perpendicular to the edge), so a rectangular section keeps its "width" flat
// on the (absent) surface and its "height" pointing radially. The arcs overshoot each vertex slightly so
// adjacent bars overlap into a filled joint — no sphere caps. Client-only (imports three); sweep is arrays.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { edgeArcs, straightEdges } from "./sphericalGeometry";
import { polygonHue } from "@/lib/utils/renderTiling";

type V3 = [number, number, number];

function nrm(a: V3): V3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function crs(a: V3, b: V3): V3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// Matches the flat renderer's hsb2rgb so the skeleton takes the tiling's tile-shape hue.
function hsb2rgb(hueDeg: number, s: number, v: number): [number, number, number] {
	const h = (((hueDeg / 360) % 1) + 1) % 1;
	const k = (o: number) => {
		const x = (((h * 6 + o) % 6) + 6) % 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	const m = (kk: number) => v * (1 - s) + v * s * kk;
	return [m(k(0)), m(k(4)), m(k(2))];
}

export type WireSection = "tube" | "rect";

export interface WireframeOptions {
	section?: WireSection;
	thickness?: number; // tube radius / rectangular width along the surface
	height?: number; // rectangular radial depth (rect only)
	bevel?: number; // rectangular chamfer as a fraction 0..1 of half the smaller dimension (rect only)
	hueOffset?: number;
	radius?: number;
	straight?: boolean; // straight chord bars (the polyhedron's real edges) instead of curved great-circle arcs
	color?: [number, number, number]; // fixed display RGB, overrides the hue (e.g. the flat solid's dark edges)
}

export interface Wireframe {
	object: THREE.Group; // add to the scene
	setGeometry: (o: WireframeOptions) => void; // rebuild tubes (thickness / height / section / bevel change)
	setColor: (hueOffset: number) => void; // recolour in place (hue-ring change)
	dispose: () => void;
}

interface Sweep {
	pos: number[];
	nor: number[];
	idx: number[];
}

// Per-sample frame along one arc: point P, radial R (outward), and S (surface-tangent, ⟂ to the edge).
function framesOf(arc: Float32Array): { P: V3[]; R: V3[]; S: V3[] } {
	const n = arc.length / 3;
	const P: V3[] = [];
	const R: V3[] = [];
	const S: V3[] = [];
	for (let i = 0; i < n; i++) {
		const p: V3 = [arc[3 * i], arc[3 * i + 1], arc[3 * i + 2]];
		const ia = Math.max(0, i - 1);
		const ib = Math.min(n - 1, i + 1);
		const t = nrm([arc[3 * ib] - arc[3 * ia], arc[3 * ib + 1] - arc[3 * ia + 1], arc[3 * ib + 2] - arc[3 * ia + 2]]);
		const r = nrm(p);
		P.push(p);
		R.push(r);
		S.push(nrm(crs(t, r)));
	}
	return { P, R, S };
}

// Round tube: sweep a circle with smooth (radial-from-axis) normals.
function sweepTube(out: Sweep, arc: Float32Array, thickness: number, M = 12) {
	const n = arc.length / 3;
	if (n < 2) return;
	const { P, R, S } = framesOf(arc);
	const base = out.pos.length / 3;
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < M; j++) {
			const a = (2 * Math.PI * j) / M;
			const c = Math.cos(a);
			const s2 = Math.sin(a);
			const ox = thickness * (c * S[i][0] + s2 * R[i][0]);
			const oy = thickness * (c * S[i][1] + s2 * R[i][1]);
			const oz = thickness * (c * S[i][2] + s2 * R[i][2]);
			out.pos.push(P[i][0] + ox, P[i][1] + oy, P[i][2] + oz);
			const nl = Math.hypot(ox, oy, oz) || 1;
			out.nor.push(ox / nl, oy / nl, oz / nl);
		}
	}
	for (let i = 0; i < n - 1; i++) {
		for (let j = 0; j < M; j++) {
			const a = base + i * M + j;
			const b = base + i * M + ((j + 1) % M);
			const c = base + (i + 1) * M + j;
			const d = base + (i + 1) * M + ((j + 1) % M);
			out.idx.push(a, c, b, b, c, d);
		}
	}
}

// Sweep a flat-sided cross-section given as a closed 2D profile in the (S, R) plane — one flat face per
// profile edge (used for the rectangular section, with or without chamfered bevel corners).
function sweepProfile(out: Sweep, arc: Float32Array, profile: [number, number][]) {
	const n = arc.length / 3;
	if (n < 2) return;
	const { P, R, S } = framesOf(arc);
	const L = profile.length;
	for (let k = 0; k < L; k++) {
		const c0 = profile[k];
		const c1 = profile[(k + 1) % L];
		const ex = c1[0] - c0[0];
		const ey = c1[1] - c0[1];
		if (Math.hypot(ex, ey) < 1e-6) continue; // degenerate side (bevel = 0 chamfer)
		let n2: [number, number] = [ey, -ex]; // perpendicular to the side
		const mx = (c0[0] + c1[0]) / 2;
		const my = (c0[1] + c1[1]) / 2;
		if (n2[0] * mx + n2[1] * my < 0) n2 = [-n2[0], -n2[1]]; // outward
		const nl2 = Math.hypot(n2[0], n2[1]) || 1;
		n2 = [n2[0] / nl2, n2[1] / nl2];
		const base = out.pos.length / 3;
		for (let i = 0; i < n; i++) {
			const wn: V3 = [
				n2[0] * S[i][0] + n2[1] * R[i][0],
				n2[0] * S[i][1] + n2[1] * R[i][1],
				n2[0] * S[i][2] + n2[1] * R[i][2],
			];
			for (const cc of [c0, c1]) {
				out.pos.push(
					P[i][0] + cc[0] * S[i][0] + cc[1] * R[i][0],
					P[i][1] + cc[0] * S[i][1] + cc[1] * R[i][1],
					P[i][2] + cc[0] * S[i][2] + cc[1] * R[i][2],
				);
				out.nor.push(wn[0], wn[1], wn[2]);
			}
		}
		for (let i = 0; i < n - 1; i++) {
			const a = base + i * 2;
			const b = base + i * 2 + 1;
			const c = base + (i + 1) * 2;
			const d = base + (i + 1) * 2 + 1;
			out.idx.push(a, c, b, b, c, d);
		}
	}
}

// Rectangular cross-section (width = thickness along S, height = radial along R), with an optional 45°
// chamfer on each corner. bevelFrac in [0,1] scales the chamfer up to (nearly) half the smaller dimension.
function rectProfile(thickness: number, height: number, bevelFrac: number): [number, number][] {
	const w = thickness / 2;
	const h = height / 2;
	const b = Math.min(Math.max(bevelFrac, 0), 0.98) * Math.min(w, h);
	if (b < 1e-4) {
		return [
			[w, h],
			[-w, h],
			[-w, -h],
			[w, -h],
		];
	}
	return [
		[w - b, h],
		[-w + b, h],
		[-w, h - b],
		[-w, -h + b],
		[-w + b, -h],
		[w - b, -h],
		[w, -h + b],
		[w, h - b],
	];
}

// Sweep an arbitrary set of great-circle arcs into a rigid tube/rect skeleton. `arcsFor(extend)` supplies
// the arcs for a given per-joint overshoot (recomputed on each rebuild because the overshoot tracks the bar
// thickness). Used by buildWireframe (arcs = the tiling edges) AND by the Islamic pattern (arcs = the star
// construction lines), so "rigid wireframe" means the same tube geometry either way — only the source arcs
// and the base hue differ.
export function buildTubeSkeleton(
	arcsFor: (extend: number) => Float32Array[],
	baseHue: number,
	opts: WireframeOptions = {},
): Wireframe {
	const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
	// A fixed `color` (the flat solid's dark edges) overrides the tiling hue and ignores the hue-ring offset.
	const fixed = opts.color;
	const applyColor = (hueOffset: number) => {
		const [r, g, b] = fixed ?? hsb2rgb(baseHue + hueOffset, 0.4, 1.0);
		material.color.setRGB(r, g, b, THREE.SRGBColorSpace);
	};
	applyColor(opts.hueOffset ?? 0);

	const group = new THREE.Group();
	let tube: THREE.Mesh | null = null;

	const rebuild = (o: WireframeOptions) => {
		if (tube) {
			group.remove(tube);
			(tube.geometry as THREE.BufferGeometry).dispose();
			tube = null;
		}
		const section = o.section ?? "tube";
		const thickness = Math.max(0.001, o.thickness ?? 0.025);
		const height = Math.max(0.001, o.height ?? thickness);
		// Overshoot each joint by ~the bar width so adjacent bars overlap into a filled joint (no caps).
		const extend = thickness * 0.9;
		const arcs = arcsFor(extend);
		const out: Sweep = { pos: [], nor: [], idx: [] };
		if (section === "tube") {
			for (const arc of arcs) sweepTube(out, arc, thickness);
		} else {
			const profile = rectProfile(thickness, height, o.bevel ?? 0);
			for (const arc of arcs) sweepProfile(out, arc, profile);
		}
		const geom = new THREE.BufferGeometry();
		geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(out.pos), 3));
		geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(out.nor), 3));
		geom.setIndex(new THREE.BufferAttribute(new Uint32Array(out.idx), 1));
		tube = new THREE.Mesh(geom, material);
		group.add(tube);
	};
	rebuild(opts);

	return {
		object: group,
		setGeometry: rebuild,
		setColor: applyColor,
		dispose: () => {
			if (tube) (tube.geometry as THREE.BufferGeometry).dispose();
			material.dispose();
		},
	};
}

export function buildWireframe(poly: Polyhedron | null, opts: WireframeOptions = {}): Wireframe | null {
	if (!poly) return null;
	const radius = opts.radius ?? 1;
	const baseHue = polygonHue(poly.faces[0].length);
	// straight ⇒ the polyhedron's real chord edges (Polyhedron + Wireframe); else the curved great-circle arcs.
	const arcsFor = opts.straight
		? (extend: number) => straightEdges(poly, radius, extend)
		: (extend: number) => edgeArcs(poly, 28, radius, extend);
	return buildTubeSkeleton(arcsFor, baseHue, opts);
}
