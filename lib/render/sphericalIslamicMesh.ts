// Renders the spherical Islamic construction (lib/render/sphericalIslamic.ts) as a hollow line structure —
// the star pattern, with the underlying tiling not drawn at all. Two looks, switched by the Wireframe
// toggle:
//   • flat (Wireframe OFF): each great-circle arc is a thin FLAT ribbon (two-vertex strip, offset ±halfWidth
//     along the surface-tangent, lifted to radius 1.001). Dark ink, width from the lineWidth stroke slider.
//   • rigid (Wireframe ON): the SAME arcs are swept into round/rect tube bars by buildTubeSkeleton — the
//     identical geometry the tiling wireframe uses — so "the lines become rigid wireframe", shaped by the
//     Section / Thickness / Height / Bevel controls and coloured by the tile hue.
// Client-only (imports three).

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { sphericalIslamicArcs } from "./sphericalIslamic";
import { buildTubeSkeleton, type WireSection } from "./sphericalWireframe";
import { polygonHue } from "@/lib/utils/renderTiling";

type V3 = [number, number, number];

function nrm(a: V3): V3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function crs(a: V3, b: V3): V3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const LIFT = 1.001; // flat-ribbon radius — just clear of where the sphere would be
const HALFWIDTH_PER_STROKE = 0.014; // angular half-width (radians) per unit of the lineWidth slider

export interface IslamicPatternOptions {
	angleRad: number;
	edgeOffsetFrac?: number;
	intersectionCount?: number;
	segments?: number;
	// Flat mode (Wireframe OFF):
	lineWidth?: number; // the cfg.lineWidth stroke slider — sets ribbon width (0 ⇒ invisible)
	dark?: boolean; // theme: dark vs light line colour
	// Rigid mode (Wireframe ON): the lines swept as tube/rect bars, same geometry as the tiling wireframe.
	rigid?: boolean;
	section?: WireSection;
	thickness?: number;
	height?: number;
	bevel?: number;
	hueOffset?: number;
}

export interface IslamicPattern {
	object: THREE.Group; // add to the scene
	setColor: (hueOffset: number, dark: boolean) => void; // recolour in place (hue-ring / theme change)
	dispose: () => void;
}

// Sweep one arc (flattened xyz on the unit sphere) into a flat surface ribbon of the given angular
// half-width, appended to the shared position/normal/index buffers.
function sweepRibbon(pos: number[], nor: number[], idx: number[], arc: Float32Array, halfWidth: number) {
	const n = arc.length / 3;
	if (n < 2) return;
	const base = pos.length / 3;
	for (let i = 0; i < n; i++) {
		const p: V3 = [arc[3 * i], arc[3 * i + 1], arc[3 * i + 2]];
		const ia = Math.max(0, i - 1);
		const ib = Math.min(n - 1, i + 1);
		const t = nrm([arc[3 * ib] - arc[3 * ia], arc[3 * ib + 1] - arc[3 * ia + 1], arc[3 * ib + 2] - arc[3 * ia + 2]]);
		const r = nrm(p); // radial (p already on the unit sphere)
		const s = nrm(crs(t, r)); // surface tangent ⟂ the arc
		pos.push(p[0] * LIFT + s[0] * halfWidth, p[1] * LIFT + s[1] * halfWidth, p[2] * LIFT + s[2] * halfWidth);
		nor.push(r[0], r[1], r[2]);
		pos.push(p[0] * LIFT - s[0] * halfWidth, p[1] * LIFT - s[1] * halfWidth, p[2] * LIFT - s[2] * halfWidth);
		nor.push(r[0], r[1], r[2]);
	}
	for (let i = 0; i < n - 1; i++) {
		const a = base + i * 2;
		const b = base + i * 2 + 1;
		const c = base + (i + 1) * 2;
		const d = base + (i + 1) * 2 + 1;
		idx.push(a, c, b, b, c, d);
	}
}

// A round cap: a small filled disc (radius = the ribbon half-width) laid flat on the surface at an arc
// endpoint. Every construction ray ends where other rays meet it (a star tip or a T-junction); the ribbons
// there are separate strips whose butt ends leave a gap at the acute corners. Dropping a disc at each
// endpoint rounds the cap, and overlapping discs at a shared meeting point merge into one seamless joint —
// the round-cap / round-join treatment (dark ink over dark ink, so overlaps are invisible).
function addCap(pos: number[], nor: number[], idx: number[], p: V3, radius: number, segs = 12) {
	if (radius <= 0) return;
	const r = nrm(p);
	const ref: V3 = Math.abs(r[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
	const u = nrm(crs(r, ref));
	const v = crs(r, u);
	const c = pos.length / 3;
	pos.push(p[0] * LIFT, p[1] * LIFT, p[2] * LIFT);
	nor.push(r[0], r[1], r[2]);
	for (let k = 0; k <= segs; k++) {
		const a = (k / segs) * 2 * Math.PI;
		const du = Math.cos(a) * radius;
		const dv = Math.sin(a) * radius;
		pos.push(p[0] * LIFT + u[0] * du + v[0] * dv, p[1] * LIFT + u[1] * du + v[1] * dv, p[2] * LIFT + u[2] * du + v[2] * dv);
		nor.push(r[0], r[1], r[2]);
	}
	for (let k = 0; k < segs; k++) idx.push(c, c + 1 + k, c + 2 + k);
}

export function buildIslamicPattern(poly: Polyhedron | null, opts: IslamicPatternOptions): IslamicPattern | null {
	if (!poly) return null;

	const islamicOpts = {
		angleRad: opts.angleRad,
		edgeOffsetFrac: opts.edgeOffsetFrac,
		intersectionCount: opts.intersectionCount,
		segments: opts.segments ?? 24,
	};

	if (opts.rigid) {
		// The star lines become the SAME rigid tube/rect skeleton the tiling wireframe uses — only the source
		// arcs differ (the star construction lines).
		//
		// Crucially, NO end extension here (extend 0), unlike the wireframe. A star ray stops on another ray's
		// body (a mid-bar T-junction), so the crossing point lies on BOTH bars' centrelines — both tubes
		// already contain it, and the joint fills by overlap with a clean seam. Extending the bar past that
		// point (as the wireframe does at its polyhedron vertices, where bars meet only end-to-end) would poke
		// a stub out the far side of the crossed bar — the overshoot artefact. So the bars butt exactly at the
		// crossings and connect there.
		const baseHue = polygonHue(poly.faces[0].length);
		const wf = buildTubeSkeleton(
			() => sphericalIslamicArcs(poly, { ...islamicOpts, radius: 1 }),
			baseHue,
			{ section: opts.section, thickness: opts.thickness, height: opts.height, bevel: opts.bevel, hueOffset: opts.hueOffset },
		);
		return {
			object: wf.object,
			setColor: (hueOffset) => wf.setColor(hueOffset),
			dispose: wf.dispose,
		};
	}

	// Flat mode: thin surface ribbons in the theme dark ink colour.
	const halfWidth = Math.max(0, opts.lineWidth ?? 1) * HALFWIDTH_PER_STROKE;
	const arcs = sphericalIslamicArcs(poly, { ...islamicOpts, radius: 1 });
	const pos: number[] = [];
	const nor: number[] = [];
	const idx: number[] = [];
	for (const arc of arcs) {
		sweepRibbon(pos, nor, idx, arc, halfWidth);
		const n = arc.length / 3;
		if (n >= 2) {
			// Round both ends so rays meeting at a star tip / T-junction connect with no gap.
			addCap(pos, nor, idx, [arc[0], arc[1], arc[2]], halfWidth);
			addCap(pos, nor, idx, [arc[3 * (n - 1)], arc[3 * (n - 1) + 1], arc[3 * (n - 1) + 2]], halfWidth);
		}
	}

	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
	geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
	geom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));

	const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
	const applyColor = (dark: boolean) => {
		const rgb = dark ? [0.1, 0.105, 0.125] : [0.06, 0.06, 0.08];
		material.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
	};
	applyColor(opts.dark ?? true);

	const group = new THREE.Group();
	group.add(new THREE.Mesh(geom, material));

	return {
		object: group,
		setColor: (_hueOffset, dark) => applyColor(dark),
		dispose: () => {
			geom.dispose();
			material.dispose();
		},
	};
}
