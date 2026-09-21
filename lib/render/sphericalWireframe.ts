// The tube skeleton: a set of arcs swept into 3D bars. Each arc is swept with a cross-section along a
// per-point frame (radial R outward, S tangent-to-surface perpendicular to the arc), so a rectangular
// section keeps its "width" flat on the surface and its "height" pointing radially. The arcs overshoot each
// vertex slightly so adjacent bars overlap into a filled joint — no sphere caps. Client-only (imports
// three); the sweep itself is arrays.
//
// Every edge bar in the Atlas comes through here: the flat solid's corners, the freedraw and star shelves'
// drawn edges, the spherical colourings, and the Islamic construction lines. Each vertex carries the point
// on the arc it wraps (`aAxis`), which is what lets a bar be hidden by the edge's own visibility instead of
// its surface's — see lib/render/edgeOcclusion.ts.
//
// ⚑ The BOOLEAN-UNION path is gone (2026-08-25). It welded the bars into one watertight solid via Manifold
// for clean joints, and only the Fill/Wireframe toggle ever asked for it; that toggle is now an opacity
// slider, and raw overlapping bars are what every remaining caller already used.

import * as THREE from "three";
import { tileHueRgb01 } from "@/lib/render/tilePalette";
import { applyEdgeOcclusion, markEdgeOverlay, type EdgeOcclusionUniforms } from "./edgeOcclusion";
import type { Crease } from "./sphStar";
import { polygonHue } from "@/lib/utils/renderTiling";

type V3 = [number, number, number];

function nrm(a: V3): V3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function crs(a: V3, b: V3): V3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export type WireSection = "tube" | "rect";

export interface WireframeOptions {
	section?: WireSection;
	thickness?: number; // tube radius / rectangular width along the surface
	height?: number; // rectangular radial depth (rect only)
	bevel?: number; // rectangular chamfer as a fraction 0..1 of half the smaller dimension (rect only)
	hueOffset?: number;
	color?: [number, number, number]; // fixed display RGB, overrides the hue (e.g. the flat solid's dark edges)
	/** Ball the shared bar ends into smooth joints, and stop overshooting them. Round sections only — a
	 *  rectangular bar has no radius for a sphere to match. */
	joints?: boolean;
	/** Hide the parts of each bar whose EDGE the solid covers, per pixel. See lib/render/edgeOcclusion.ts. */
	occlude?: EdgeOcclusionUniforms;
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
	// The point on the ARC each vertex wraps. The hidden-edge test asks whether the edge is visible, not
	// whether this scrap of tube wall is — see lib/render/edgeOcclusion.ts.
	axis: number[];
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

// Sides of the swept circle. 12 was plenty while a bar was a bar; a ball tangent to it wants the cylinder
// round enough that the two agree at the joint, and 16 halves the facet sag for a third more vertices.
const TUBE_SIDES = 16;

// Round tube: sweep a circle with smooth (radial-from-axis) normals.
function sweepTube(out: Sweep, arc: Float32Array, thickness: number, M = TUBE_SIDES) {
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
			out.axis.push(P[i][0], P[i][1], P[i][2]);
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

// ─── JOINTS ─────────────────────────────────────────────────────────────────────────────────────
//
// ⚑ A BALL WHERE BARS MEET. A swept tube is a bare cylinder wall with no lid, and the bars used to be run
// PAST the vertex they share so the overlap would fill the corner. It does not fill it: what meets at a
// degree-5 vertex is five open mouths and five cylinders cutting through one another, and the corner comes
// out as a dark star of flat facets and slivers (AL, 2026-08-26). The boolean union used to weld exactly
// this, and it is not the tool any more — it runs a few hundred ms of WASM per rebuild, and it hands back
// positions and indices only, so the per-vertex `aAxis` the hidden-edge test rides on does not survive it.
//
// A sphere at the vertex does the whole job with no CSG. Set its radius to the bar's and it is TANGENT to
// every cylinder leaving it — same surface point, same normal — so the joint is smooth in the silhouette
// and in the shading, at any valence, with no per-vertex case analysis. The bars then stop dead at the
// vertex instead of overshooting, and their mouths are inside the ball.
// ⚑ AND THE BALL IS EXACTLY THE BAR'S RADIUS, NOT A HAIR MORE. It went out 5% wider first, to cover the
// sagitta where two polygonal surfaces meet, and 5% is enough to read: the ball stopped being the corner of
// the bars and became a bead sitting on them, with its own silhouette and its own highlight (AL,
// 2026-08-26 — "you can clearly see the difference in material"). At equal radii the sphere is TANGENT to
// every cylinder leaving it, same surface point and same normal, so there is nothing to see.
//
// What the 5% was buying is bought instead by resolution. Both surfaces are polygonal and both sag inside
// the true radius between samples, so the fix is to make the sag smaller than a pixel: 20 meridians on the
// ball (0.6% sag) against 16 sides on the bar (1.9%), where 16 and 12 left 1.9% against 3.4%. At the widest
// stroke this shelf offers, r = 0.03 on a solid of radius 1, the residue is a fifth of a pixel.
const JOINT_MERIDIANS = 20;
const JOINT_RINGS = 12;

function sweepJoint(out: Sweep, c: V3, radius: number) {
	const base = out.pos.length / 3;
	for (let i = 0; i <= JOINT_RINGS; i++) {
		const phi = (Math.PI * i) / JOINT_RINGS;
		const sp = Math.sin(phi);
		const cp = Math.cos(phi);
		for (let j = 0; j <= JOINT_MERIDIANS; j++) {
			const th = (2 * Math.PI * j) / JOINT_MERIDIANS;
			const n: V3 = [sp * Math.cos(th), cp, sp * Math.sin(th)];
			out.pos.push(c[0] + n[0] * radius, c[1] + n[1] * radius, c[2] + n[2] * radius);
			out.nor.push(n[0], n[1], n[2]);
			// The whole ball answers for the vertex it sits on, so the hidden-edge test hides it exactly when
			// that vertex is hidden.
			out.axis.push(c[0], c[1], c[2]);
		}
	}
	const stride = JOINT_MERIDIANS + 1;
	for (let i = 0; i < JOINT_RINGS; i++) {
		for (let j = 0; j < JOINT_MERIDIANS; j++) {
			const a = base + i * stride + j;
			const b = a + 1;
			const c2 = a + stride;
			const d = c2 + 1;
			out.idx.push(a, c2, b, b, c2, d);
		}
	}
}

/** Ball every point two or more bars share, and round off the ends that no bar meets. */
function sweepJoints(out: Sweep, arcs: Float32Array[], radius: number) {
	const seen = new Set<string>();
	for (const arc of arcs) {
		if (arc.length < 6) continue;
		for (const at of [0, arc.length - 3]) {
			const c: V3 = [arc[at], arc[at + 1], arc[at + 2]];
			const key = `${c[0].toFixed(5)},${c[1].toFixed(5)},${c[2].toFixed(5)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			sweepJoint(out, c, radius);
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
				out.axis.push(P[i][0], P[i][1], P[i][2]);
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
// thickness). Used by the flat solid (arcs = the polyhedron's edges), the freedraw / star / colouring
// shelves (arcs = their drawn edges) and the Islamic pattern (arcs = the star construction lines), so a bar
// is the same geometry everywhere — only the source arcs and the base hue differ.
export function buildTubeSkeleton(
	arcsFor: (extend: number) => Float32Array[],
	baseHue: number,
	opts: WireframeOptions = {},
): Wireframe {
	const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
	if (opts.occlude) applyEdgeOcclusion(material, opts.occlude);
	// A fixed `color` (the flat solid's dark edges) overrides the tiling hue and ignores the hue-ring offset.
	const fixed = opts.color;
	const applyColor = (hueOffset: number) => {
		const [r, g, b] = fixed ?? tileHueRgb01(baseHue + hueOffset);
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
		if (opts.occlude) markEdgeOverlay(tube, material);
		group.add(tube);
	};

	// Every bar swept independently and merged into one buffer. Synchronous, and the overlapping bars
	// self-fill the joints at a shared vertex.
	const rebuildRaw = (o: WireframeOptions) => {
		const section = o.section ?? "tube";
		const thickness = Math.max(0.001, o.thickness ?? 0.025);
		const height = Math.max(0.001, o.height ?? thickness);
		// `joints` comes from the construction options, not `o`: setGeometry is called with a partial (the
		// stroke slider passes a thickness and nothing else) and the joint choice belongs to the caller.
		const joints = opts.joints === true && section === "tube";
		// Overshooting the shared vertex is the OLD way of filling a corner, and a ball fills it properly.
		const extend = joints ? 0 : thickness * 0.9;
		const arcs = arcsFor(extend);
		const out: Sweep = { pos: [], nor: [], idx: [], axis: [] };
		if (section === "tube") {
			for (const arc of arcs) sweepTube(out, arc, thickness);
			if (joints) sweepJoints(out, arcs, thickness);
		} else {
			const profile = rectProfile(thickness, height, o.bevel ?? 0);
			for (const arc of arcs) sweepProfile(out, arc, profile);
		}
		const geom = new THREE.BufferGeometry();
		geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(out.pos), 3));
		geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(out.nor), 3));
		geom.setAttribute("aAxis", new THREE.BufferAttribute(new Float32Array(out.axis), 3));
		geom.setIndex(new THREE.BufferAttribute(new Uint32Array(out.idx), 1));
		swap(geom);
	};

	rebuildRaw(opts);

	return {
		object: group,
		setGeometry: rebuildRaw,
		setColor: applyColor,
		dispose: () => {
			if (tube) (tube.geometry as THREE.BufferGeometry).dispose();
			material.dispose();
		},
	};
}

// ─── CREASES: A RIBBON IN THE FACE PLANE, NOT A TUBE ────────────────────────────────────────────
//
// A crease is where one face of a self-intersecting solid passes THROUGH another. It is a real feature of
// the surface and has to read exactly like a drawn edge, but it cannot be built like one: a crease lies IN
// both its faces' planes, so a tube round it sticks out a full radius on each side of each plane, and on a
// solid whose faces pass close by that perpendicular bulge surfaces through the neighbours as needles and
// slivers. Marek Čtrnáct found the creases missing on the pentagrammic prism (2026-08-19); AL found the
// bleeding they caused on ss-60-180-104-d4 two days later.
//
// A ribbon has no perpendicular extent to poke through anything. Each crease is drawn twice, once in each
// face's plane, so it wins the z-fight with its own face and nothing else; occlusion is then ordinary depth
// testing, which is what puts a hidden crease behind its face.
//
// ⚑ THE RIBBON CARRIES A TUBE'S NORMALS. Flat across its width it lit as a flat strip while the drawn edge
// beside it lit as a cylinder, and the two read as different objects under one light (AL, 2026-08-21: "the
// true edges and the intersection lines react different to light"). The geometry cannot become a tube, for
// the bleeding reason above, so the SHADING becomes one instead: the strip is widened into columns sampled
// around a half-circle, at offset r·sinθ across the crease and carrying the normal cosθ·n + sinθ·t. That is
// exactly the normal field of a cylinder of radius r lying half-buried in the face — which is what a drawn
// edge is — while every vertex stays dead flat in the plane.
//
// ⚑ THE DEPTH BIAS IS A CONSTANT, AND polygonOffsetFactor MUST STAY 0. A crease is COPLANAR with the face
// it is drawn on, so the two never diverge across the polygon and a constant `units` bias is the whole of
// what it needs to win that tie. `factor` scales with the polygon's DEPTH SLOPE, which on a steeply
// inclined face is large — and a star polyhedron is layers of steeply inclined faces, so a slope term pulls
// creases on hidden layers far enough forward to punch through the faces in front of them. Measured on
// ss-60-120-62-d13: factor -4 / units -8 differs from no offset at all by 1,171,827 in summed pixel
// difference, every bit of it hairlines wandering across faces that should be solid (AL, 2026-08-21);
// factor 0 / units -2 differs by 1,145, which is antialiasing.
//
// This lived inside lib/render/icoFreedraw.ts and served the star shelf alone. buildFlatSolid drew the very
// same creases as TUBES, so the whole non-convex reference shelf carried the artefact this had already
// fixed next door; it is shared now and the tube path there is gone.
const CREASE_COLUMNS = 7; // θ in 30° steps across the half-circle; the sweep is smooth well before this

/**
 * ⚑ TEMPORARY A/B (AL, 2026-08-26): "make use of the union method for creases as well … I want to see the
 * problem with my eyes if it really is a problem."
 *
 * true  — creases are capsules in the SAME union as the edges, so a joint welds across both.
 * false — creases are in-plane ribbons, which is how they have been drawn since 2026-08-19.
 *
 * One of the two goes once he has looked, and buildCreaseRibbons or this branch goes with it.
 */
export const CREASES_AS_TUBES = true;

export function buildCreaseRibbons(
	creases: Crease[],
	opts: { radius: number; thickness: number; color: [number, number, number]; occlude?: EdgeOcclusionUniforms },
): { object: THREE.Object3D; dispose: () => void } {
	const { radius, thickness, color } = opts;
	// A hair off the plane, for the same reason as the constant depth bias: enough to break the tie, far too
	// little to escape the face.
	const lift = thickness * 0.06;
	const cols = Array.from({ length: CREASE_COLUMNS }, (_, i) => {
		const th = -Math.PI / 2 + (Math.PI * i) / (CREASE_COLUMNS - 1);
		return { s: Math.sin(th), c: Math.cos(th) };
	});
	const pos: number[] = [];
	const nor: number[] = [];
	const axis: number[] = [];
	for (const c of creases) {
		for (const n of [c.na, c.nb]) {
			const a: V3 = [c.a[0] * radius + n[0] * lift, c.a[1] * radius + n[1] * lift, c.a[2] * radius + n[2] * lift];
			const b: V3 = [c.b[0] * radius + n[0] * lift, c.b[1] * radius + n[1] * lift, c.b[2] * radius + n[2] * lift];
			const d = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
			const t = nrm(crs(n, d)); // in-plane, across the crease
			const at = (p: V3, k: number): V3 => [
				p[0] + cols[k].s * thickness * t[0],
				p[1] + cols[k].s * thickness * t[1],
				p[2] + cols[k].s * thickness * t[2],
			];
			const nAt = (k: number): V3 =>
				nrm([cols[k].c * n[0] + cols[k].s * t[0], cols[k].c * n[1] + cols[k].s * t[1], cols[k].c * n[2] + cols[k].s * t[2]]);
			for (let k = 0; k < CREASE_COLUMNS - 1; k++) {
				const quad: [V3, V3, V3][] = [
					[at(a, k), nAt(k), a],
					[at(a, k + 1), nAt(k + 1), a],
					[at(b, k + 1), nAt(k + 1), b],
					[at(a, k), nAt(k), a],
					[at(b, k + 1), nAt(k + 1), b],
					[at(b, k), nAt(k), b],
				];
				for (const [v, vn, ax] of quad) {
					pos.push(v[0], v[1], v[2]);
					nor.push(vn[0], vn[1], vn[2]);
					axis.push(ax[0], ax[1], ax[2]);
				}
			}
		}
	}
	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
	geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
	geom.setAttribute("aAxis", new THREE.BufferAttribute(new Float32Array(axis), 3));
	// The edge tubes' material, parameter for parameter, so the studio look's role tuning lands identically.
	const mat = new THREE.MeshStandardMaterial({
		color: new THREE.Color().setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace),
		roughness: 0.5,
		metalness: 0.0,
		side: THREE.DoubleSide,
		polygonOffset: true,
		polygonOffsetFactor: 0,
		polygonOffsetUnits: -2,
	});
	const mesh = new THREE.Mesh(geom, mat);
	if (opts.occlude) {
		applyEdgeOcclusion(mat, opts.occlude);
		markEdgeOverlay(mesh, mat);
	}
	return {
		object: mesh,
		dispose: () => {
			geom.dispose();
			mat.dispose();
		},
	};
}
