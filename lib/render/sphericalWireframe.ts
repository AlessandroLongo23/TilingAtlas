// The wireframe skeleton: the tiling's edges as 3D tubes with NO filled sphere — a hollow structure you
// see through. Each great-circle edge is swept with a cross-section along a per-point frame (radial R
// outward, S tangent-to-surface perpendicular to the edge), so a rectangular section keeps its "width" flat
// on the (absent) surface and its "height" pointing radially. The arcs overshoot each vertex slightly so
// adjacent bars overlap into a filled joint — no sphere caps. Client-only (imports three); sweep is arrays.

import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Polyhedron } from "./platonicSolids";
import { edgeArcs, straightEdges } from "./sphericalGeometry";
import { unionTubeParts } from "./manifoldUnion";
import { polygonHue } from "@/lib/utils/renderTiling";

// Crease angle for the unioned wireframe: edges sharper than this become a hard seam, gentler ones stay smooth.
// The tube's own facets (≤ 22.5° at 16 sides) stay smooth; the weld seams where bars meet (≫ this) turn crisp.
const WELD_CREASE_ANGLE = (40 * Math.PI) / 180;

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
	union?: boolean; // boolean-union the bars into one welded solid (clean joints) instead of raw overlap
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

// One bar as a WELDED, watertight, consistently-wound capped tube — the input the boolean union needs
// (Manifold rejects the render sweeps above: their rings aren't shared / the rect strips leave open edges).
// One ring of the cross-section polygon `ring2D` per arc sample, quad walls between consecutive rings, and a
// triangle-fan lid over each mouth. Positions only — the union recomputes normals with a crease threshold, so
// the round tube stays smooth while the weld seams turn crisp. The winding (wall a,c,b/b,c,d; start cap
// center,u,v; finish cap center,v,u) is the orientation Manifold validates as a positive-volume solid.
function sweepRingPart(arc: Float32Array, ring2D: [number, number][]): { pos: Float32Array; idx: Uint32Array } {
	const n = arc.length / 3;
	const { P, R, S } = framesOf(arc);
	const M = ring2D.length;
	const pos: number[] = [];
	const idx: number[] = [];
	for (let i = 0; i < n; i++) {
		for (const [cx, cy] of ring2D) {
			pos.push(
				P[i][0] + cx * S[i][0] + cy * R[i][0],
				P[i][1] + cx * S[i][1] + cy * R[i][1],
				P[i][2] + cx * S[i][2] + cy * R[i][2],
			);
		}
	}
	for (let i = 0; i < n - 1; i++) {
		for (let j = 0; j < M; j++) {
			const a = i * M + j;
			const b = i * M + ((j + 1) % M);
			const c = (i + 1) * M + j;
			const d = (i + 1) * M + ((j + 1) % M);
			idx.push(a, c, b, b, c, d);
		}
	}
	const cap = (i: number, start: boolean) => {
		const center = pos.length / 3;
		pos.push(P[i][0], P[i][1], P[i][2]);
		const ring = i * M;
		for (let j = 0; j < M; j++) {
			const u = ring + j;
			const v = ring + ((j + 1) % M);
			if (start) idx.push(center, u, v);
			else idx.push(center, v, u);
		}
	};
	cap(0, true);
	cap(n - 1, false);
	return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

// The cross-section polygon for the union sweep: an M-gon of the tube radius, or the rect/bevel profile.
function unionRing(section: WireSection, thickness: number, height: number, bevel: number): [number, number][] {
	if (section === "tube") {
		const M = 16;
		return Array.from({ length: M }, (_, j) => {
			const a = (2 * Math.PI * j) / M;
			return [thickness * Math.cos(a), thickness * Math.sin(a)] as [number, number];
		});
	}
	return rectProfile(thickness, height, bevel);
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

	const swap = (geom: THREE.BufferGeometry) => {
		if (tube) {
			group.remove(tube);
			(tube.geometry as THREE.BufferGeometry).dispose();
		}
		tube = new THREE.Mesh(geom, material);
		group.add(tube);
	};

	// Raw overlap: every bar swept independently, merged into one buffer. Fast and synchronous; used for the
	// Islamic construction lines and as the fallback if the union kernel fails to load. The overlapping bars
	// self-fill the joints imperfectly (the open-mouth "butterflies" at a vertex).
	const rebuildRaw = (o: WireframeOptions) => {
		const section = o.section ?? "tube";
		const thickness = Math.max(0.001, o.thickness ?? 0.025);
		const height = Math.max(0.001, o.height ?? thickness);
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
		swap(geom);
	};

	// Boolean union: each bar as a watertight solid, unioned by Manifold into ONE welded mesh so the joints are
	// clean seams. Async (WASM); a `seq` guard drops any result a newer rebuild has superseded, and the old mesh
	// stays on screen until the new one is ready. Overshoot a full radius so the bars overlap through the shared
	// vertex and the union actually merges them.
	let seq = 0;
	const rebuildUnion = (o: WireframeOptions) => {
		const section = o.section ?? "tube";
		const thickness = Math.max(0.001, o.thickness ?? 0.025);
		const height = Math.max(0.001, o.height ?? thickness);
		// Only a whisker of overshoot: the bars are fat enough to overlap at the shared vertex on their own, so
		// the union merges them without a long stub poking past the joint (which the union can't fully trim and
		// would leave as a small spike). Just enough to avoid the two arcs' endpoints landing exactly coincident.
		const crossExtent = section === "tube" ? thickness : 0.5 * Math.hypot(thickness, height);
		const extend = crossExtent * 0.12;
		const ring2D = unionRing(section, thickness, height, o.bevel ?? 0);
		const parts = arcsFor(extend).map((arc) => sweepRingPart(arc, ring2D));
		const mySeq = ++seq;
		unionTubeParts(parts)
			.then((res) => {
				if (mySeq !== seq) return; // superseded by a later rebuild
				const indexed = new THREE.BufferGeometry();
				indexed.setAttribute("position", new THREE.BufferAttribute(res.position, 3));
				indexed.setIndex(new THREE.BufferAttribute(res.index, 1));
				// Smooth along the tubes, hard crease at the weld seams.
				const geom = toCreasedNormals(indexed, WELD_CREASE_ANGLE);
				indexed.dispose();
				swap(geom);
			})
			.catch((err) => {
				if (mySeq !== seq) return;
				console.warn("[sphericalWireframe] boolean union unavailable, showing raw bars:", err);
				rebuildRaw(o);
			});
	};

	// Union rebuilds are debounced: a thickness/bevel drag fires setGeometry rapidly, but each union is a few
	// hundred ms, so only the settled value is computed.
	let debTimer: ReturnType<typeof setTimeout> | null = null;
	const setGeometry = (o: WireframeOptions) => {
		if (!opts.union) {
			rebuildRaw(o);
			return;
		}
		if (debTimer) clearTimeout(debTimer);
		debTimer = setTimeout(() => {
			debTimer = null;
			rebuildUnion(o);
		}, 90);
	};

	if (opts.union) rebuildUnion(opts);
	else rebuildRaw(opts);

	return {
		object: group,
		setGeometry,
		setColor: applyColor,
		dispose: () => {
			seq++; // cancel any in-flight union swap
			if (debTimer) clearTimeout(debTimer);
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
	// The wireframe unions its bars into one welded solid for clean joints; the Islamic pattern keeps raw bars.
	return buildTubeSkeleton(arcsFor, baseHue, { ...opts, union: true });
}
