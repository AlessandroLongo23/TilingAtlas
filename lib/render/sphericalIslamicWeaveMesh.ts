// Renders the spherical Islamic interlace (lib/render/sphericalInterlace.ts) as woven straps on the sphere
// surface: a cream strap BODY per ray (subdivided quad, projected to the sphere) plus dark BORDER ribbons.
// The over/under illusion is entirely in the borders — an under strand's sides are trimmed to the over
// strand's edge (done in sphericalInterlace), so drawing bodies (cream, overlaps invisible) then borders
// (dark, lifted just above) on the surface reproduces the flat "interlace" look wrapped onto the ball.
// Client-only (imports three).

import * as THREE from "three";
import { hexToRgb } from "./islamicGL";
import type { Polyhedron } from "./platonicSolids";
import { buildSphericalInterlace, type SphBand, type SphInterlaceOptions } from "./sphericalInterlace";

type V3 = [number, number, number];

const LIFT_STEP = 0.004; // radius delta per weave level (over = +1 → higher, under = −1 → lower)
const BORDER_EPS = 0.0015; // border floats just above its own body so it reads on top
const DEFAULT_BODY = "#f5ebd7"; // matches the flat interlace strap body (HSB 40,12,96)
const BORDER_HALF = 0.006; // border ribbon half-width (radians of arc)
const BODY_SEG = 0.05; // target arc length of a body sub-quad — sets the length subdivision

// Solid mode (interlace + wireframe): each strap becomes a real 3D ribbon with thickness. The over/under
// weave separates the two strands RADIALLY — the over strand rides out, the under strand sinks toward the
// centre, far enough that their solids clear each other at every crossing (SOLID_LIFT > SOLID_HALF_THICK, so
// the over ribbon's underside stays above the under ribbon's top). Bigger than the flat LIFT_STEP because now
// there is actual volume to keep apart, not just a z-order. No occluder ball — the ribbons are opaque solids,
// so depth-testing shows the far side through the gaps, which is the whole cage.
const SOLID_LIFT = 0.03; // radius delta per weave level in solid mode
const SOLID_HALF_THICK = 0.014; // radial half-thickness of a solid ribbon (world units at radius 1)
const SOLID_BODY_SEG = 0.03; // finer length subdivision than the flat body, so the eased ramp renders smooth

// Smoothstep (0 slope at both ends): eases the A→B radial ramp so a strand's over/under peaks at the crossings
// round off into a gradual wave instead of the sharp triangle-wave kink a linear ramp leaves.
function smooth01(t: number): number {
	return t * t * (3 - 2 * t);
}

function nrm(a: V3): V3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function crs(a: V3, b: V3): V3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: V3, b: V3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function neg(a: V3): V3 {
	return [-a[0], -a[1], -a[2]];
}
// Component of v tangent to the sphere at unit point r (drop the radial part).
function rejectRadial(v: V3, r: V3): V3 {
	const d = dot(v, r);
	return [v[0] - r[0] * d, v[1] - r[1] * d, v[2] - r[2] * d];
}
function arcAngle(a: V3, b: V3): number {
	return Math.acos(Math.min(1, Math.max(-1, dot(nrm(a), nrm(b)))));
}
// Great-circle interpolation between two unit points.
function slerp(a: V3, b: V3, f: number): V3 {
	const o = arcAngle(a, b);
	if (o < 1e-6) return nrm([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
	const s = Math.sin(o);
	const wa = Math.sin((1 - f) * o) / s;
	const wb = Math.sin(f * o) / s;
	return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

export interface IslamicWeaveOptions extends SphInterlaceOptions {
	radius?: number;
	dark?: boolean;
	bodyColor?: string;
	/** Polygon-fill toggle: bodies on ⇒ filled weave; off ⇒ just the dark outlined straps. */
	showBodies?: boolean;
	/** Interlace + Wireframe: extrude each strap into a lit 3D ribbon, over/under separated radially. */
	solid?: boolean;
	/** Solid mode: true ⇒ flat coplanar ribbons (no over/under relief), still 3D solids. */
	solidFlat?: boolean;
}

export interface IslamicWeave {
	object: THREE.Group;
	setColor: (dark: boolean) => void; // theme change: recolour the borders
	dispose: () => void;
}

// One strap → a closed solid ribbon: outer shell + inner shell + two side walls + two end caps, appended to
// the shared position/normal buffers. The centre radius ramps A→B with the weave level (over rides out, under
// sinks in); the shell sits ±SOLID_HALF_THICK around it, so the ribbon has real thickness and the over/under
// solids clear each other. Normals: radial on the shells, surface-tangent on the walls, arc-tangent on the caps.
function emitSolidRibbon(pos: number[], nor: number[], band: SphBand, radius: number, lift: number) {
	const [c00, c10, c01, c11] = band.fillCorners; // A.fL, A.fR, B.fR, B.fL — s=0 is the left edge, t runs A→B
	const midA: V3 = [(c00[0] + c10[0]) / 2, (c00[1] + c10[1]) / 2, (c00[2] + c10[2]) / 2];
	const midB: V3 = [(c01[0] + c11[0]) / 2, (c01[1] + c11[1]) / 2, (c01[2] + c11[2]) / 2];
	const Tl = Math.min(40, Math.max(8, Math.ceil(arcAngle(midA, midB) / SOLID_BODY_SEG)));
	const HT = radius * SOLID_HALF_THICK;

	interface Sec {
		Lo: V3;
		Ro: V3;
		Li: V3;
		Ri: V3;
		nL: V3;
		nR: V3;
		wL: V3;
		wR: V3;
	}
	const secs: Sec[] = [];
	for (let ti = 0; ti <= Tl; ti++) {
		const t = ti / Tl;
		const pL = nrm([c00[0] + (c01[0] - c00[0]) * t, c00[1] + (c01[1] - c00[1]) * t, c00[2] + (c01[2] - c00[2]) * t]);
		const pR = nrm([c10[0] + (c11[0] - c10[0]) * t, c10[1] + (c11[1] - c10[1]) * t, c10[2] + (c11[2] - c10[2]) * t]);
		const lvl = band.levelA + (band.levelB - band.levelA) * smooth01(t);
		const rc = radius * (1 + lvl * lift);
		const rO = rc + HT;
		const rI = rc - HT;
		const sdir = nrm([pL[0] - pR[0], pL[1] - pR[1], pL[2] - pR[2]]); // across the strap, right→left
		secs.push({
			Lo: [pL[0] * rO, pL[1] * rO, pL[2] * rO],
			Ro: [pR[0] * rO, pR[1] * rO, pR[2] * rO],
			Li: [pL[0] * rI, pL[1] * rI, pL[2] * rI],
			Ri: [pR[0] * rI, pR[1] * rI, pR[2] * rI],
			nL: pL,
			nR: pR,
			wL: nrm(rejectRadial(sdir, pL)), // outward at the left edge
			wR: nrm(rejectRadial(neg(sdir), pR)), // outward at the right edge
		});
	}

	const quad = (a: V3, na: V3, b: V3, nb: V3, c: V3, nc: V3, d: V3, nd: V3) => {
		pos.push(...a, ...b, ...c, ...a, ...c, ...d);
		nor.push(...na, ...nb, ...nc, ...na, ...nc, ...nd);
	};
	for (let i = 0; i < Tl; i++) {
		const s0 = secs[i];
		const s1 = secs[i + 1];
		quad(s0.Lo, s0.nL, s0.Ro, s0.nR, s1.Ro, s1.nR, s1.Lo, s1.nL); // outer shell (radial out)
		quad(s0.Li, neg(s0.nL), s1.Li, neg(s1.nL), s1.Ri, neg(s1.nR), s0.Ri, neg(s0.nR)); // inner shell (radial in)
		quad(s0.Lo, s0.wL, s1.Lo, s1.wL, s1.Li, s1.wL, s0.Li, s0.wL); // left wall
		quad(s0.Ro, s0.wR, s0.Ri, s0.wR, s1.Ri, s1.wR, s1.Ro, s1.wR); // right wall
	}
	const nA = nrm([midA[0] - midB[0], midA[1] - midB[1], midA[2] - midB[2]]); // A-end cap faces away from B
	const nB = neg(nA);
	const a0 = secs[0];
	const aN = secs[Tl];
	quad(a0.Lo, nA, a0.Li, nA, a0.Ri, nA, a0.Ro, nA);
	quad(aN.Lo, nB, aN.Ro, nB, aN.Ri, nB, aN.Li, nB);
}

// Interlace + Wireframe: the weave as lit 3D ribbons, no base surface — you see the whole cage, front and far
// side through the gaps (the ribbons are opaque solids, so depth-testing sorts them). The over/under is carried
// by real radial separation (emitSolidRibbon), so no borders/trim — the volume and the light rig do the reading.
function buildSolidWeave(bands: SphBand[], radius: number, opts: IslamicWeaveOptions): IslamicWeave {
	const pos: number[] = [];
	const nor: number[] = [];
	// Flat mode zeroes the relief: every band sits coplanar on the sphere. Coplanar crossings don't z-fight —
	// all ribbons share one cream material with radial normals, so overlapping top faces shade identically.
	const lift = opts.solidFlat ? 0 : SOLID_LIFT;
	for (const band of bands) emitSolidRibbon(pos, nor, band, radius, lift);

	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
	geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
	const [br, bg, bb] = hexToRgb(opts.bodyColor ?? DEFAULT_BODY);
	const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
	mat.color.setRGB(br, bg, bb, THREE.SRGBColorSpace);

	const group = new THREE.Group();
	group.add(new THREE.Mesh(geom, mat));

	return {
		object: group,
		setColor: () => {}, // the cream ribbon is theme-independent, and there is no ground ball to recolour
		dispose: () => {
			geom.dispose();
			mat.dispose();
		},
	};
}

export function buildIslamicWeave(poly: Polyhedron | null, opts: IslamicWeaveOptions): IslamicWeave | null {
	if (!poly) return null;
	const radius = opts.radius ?? 1;
	const showBodies = opts.showBodies !== false;
	const { bands } = buildSphericalInterlace(poly, opts);
	if (opts.solid) return buildSolidWeave(bands, radius, opts);

	// Strap bodies: each quad [A.fL, A.fR, B.fL, B.fR] as a bilinear patch, subdivided along its length and
	// projected onto the sphere. s runs left→right (width), t runs A→B (length).
	const bodyPos: number[] = [];
	if (showBodies) {
		for (const { fillCorners, levelA, levelB } of bands) {
			const [c00, c10, c01, c11] = fillCorners; // (s,t): 00=A.fL 10=A.fR 01=B.fR 11=B.fL
			const midA: V3 = [(c00[0] + c10[0]) / 2, (c00[1] + c10[1]) / 2, (c00[2] + c10[2]) / 2];
			const midB: V3 = [(c01[0] + c11[0]) / 2, (c01[1] + c11[1]) / 2, (c01[2] + c11[2]) / 2];
			const Tl = Math.min(16, Math.max(2, Math.ceil(arcAngle(midA, midB) / BODY_SEG)));
			const Sw = 2;
			const at = (si: number, ti: number): V3 => {
				const s = si / Sw;
				const t = ti / Tl;
				const x = (1 - s) * (1 - t) * c00[0] + s * (1 - t) * c10[0] + (1 - s) * t * c01[0] + s * t * c11[0];
				const y = (1 - s) * (1 - t) * c00[1] + s * (1 - t) * c10[1] + (1 - s) * t * c01[1] + s * t * c11[1];
				const z = (1 - s) * (1 - t) * c00[2] + s * (1 - t) * c10[2] + (1 - s) * t * c01[2] + s * t * c11[2];
				const p = nrm([x, y, z]);
				const r = radius * (1 + (levelA + (levelB - levelA) * t) * LIFT_STEP); // ramp the weave height A→B
				return [p[0] * r, p[1] * r, p[2] * r];
			};
			for (let ti = 0; ti < Tl; ti++) {
				for (let si = 0; si < Sw; si++) {
					const p00 = at(si, ti);
					const p10 = at(si + 1, ti);
					const p01 = at(si, ti + 1);
					const p11 = at(si + 1, ti + 1);
					bodyPos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
				}
			}
		}
	}

	// Border ribbons: each outline segment swept into a thin flat ribbon along its great-circle arc, lifted
	// just above the bodies. Trimmed under-strand segments simply stop short — that break is the weave.
	const borderPos: number[] = [];
	const sweep = (a: V3, b: V3, la: number, lb: number) => {
		const seg = Math.max(1, Math.round(arcAngle(a, b) / BODY_SEG));
		let prev: { l: V3; r: V3 } | null = null;
		for (let i = 0; i <= seg; i++) {
			const f = i / seg;
			const p = nrm(slerp(a, b, f));
			const pa = nrm(slerp(a, b, Math.max(0, i - 1) / seg));
			const pb = nrm(slerp(a, b, Math.min(seg, i + 1) / seg));
			const tan = nrm([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]);
			const side = nrm(crs(tan, p)); // surface tangent ⟂ the arc
			const rr = radius * (1 + (la + (lb - la) * f) * LIFT_STEP) + radius * BORDER_EPS; // ramp with the body, just above it
			const L: V3 = [(p[0] + side[0] * BORDER_HALF) * rr, (p[1] + side[1] * BORDER_HALF) * rr, (p[2] + side[2] * BORDER_HALF) * rr];
			const R: V3 = [(p[0] - side[0] * BORDER_HALF) * rr, (p[1] - side[1] * BORDER_HALF) * rr, (p[2] - side[2] * BORDER_HALF) * rr];
			if (prev) borderPos.push(...prev.l, ...prev.r, ...L, ...prev.r, ...R, ...L);
			prev = { l: L, r: R };
		}
	};
	for (const { outline } of bands) for (const s of outline) sweep(s.a, s.b, s.la, s.lb);

	const group = new THREE.Group();
	const materials: THREE.Material[] = [];
	const geometries: THREE.BufferGeometry[] = [];

	// Opaque base ball just under the straps: the weave doesn't tile the whole sphere, so without it you see
	// through the gaps to the far hemisphere's straps. The ground occludes the far side and gives the straps
	// something to sit on. Theme-aware, and dark enough that the cream straps read against it.
	const groundGeom = new THREE.SphereGeometry(radius * 0.994, 96, 64);
	const groundMat = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
	const applyGround = (dark: boolean) => {
		const c = dark ? [0.1, 0.11, 0.14] : [0.86, 0.85, 0.82];
		groundMat.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
	};
	applyGround(opts.dark ?? true);
	group.add(new THREE.Mesh(groundGeom, groundMat));
	materials.push(groundMat);
	geometries.push(groundGeom);

	if (bodyPos.length) {
		const geom = new THREE.BufferGeometry();
		geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bodyPos), 3));
		const [br, bg, bb] = hexToRgb(opts.bodyColor ?? DEFAULT_BODY);
		const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
		mat.color.setRGB(br, bg, bb, THREE.SRGBColorSpace);
		group.add(new THREE.Mesh(geom, mat));
		materials.push(mat);
		geometries.push(geom);
	}

	const borderGeom = new THREE.BufferGeometry();
	borderGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(borderPos), 3));
	const borderMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
	const applyBorder = (dark: boolean) => {
		// With bodies drawn, the border is near-black so each cream strap gets a crisp outline. With bodies OFF
		// (outline-only), there is nothing but the outline, so it takes the strap colour instead — light on the
		// dark ground, dark on the light ground — otherwise the straps vanish into the ground.
		let rgb: number[];
		if (showBodies) rgb = dark ? [0.02, 0.02, 0.03] : [0.06, 0.06, 0.08];
		else rgb = dark ? hexToRgb(opts.bodyColor ?? DEFAULT_BODY) : [0.06, 0.06, 0.08];
		borderMat.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
	};
	applyBorder(opts.dark ?? true);
	group.add(new THREE.Mesh(borderGeom, borderMat));
	materials.push(borderMat);
	geometries.push(borderGeom);

	return {
		object: group,
		setColor: (dark) => {
			applyBorder(dark);
			applyGround(dark);
		},
		dispose: () => {
			for (const g of geometries) g.dispose();
			for (const m of materials) m.dispose();
		},
	};
}
