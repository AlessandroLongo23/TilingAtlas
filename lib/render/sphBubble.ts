// The SPHERICAL BUBBLE surface: a decorated solid drawn as coloured spherical tiles.
//
// A bubble tiling gives every edge a BUMP on one side and a BITE on the other, so its tiles are
// spherical polygons with curved sides. The profile of that curve is the shelf's own picker — arc,
// scallop, Koch, crenel, dovetail, jigsaw — and NONE of it is redefined here: `pushEdge` on the unit
// chord returns the very polyline the Euclidean canvas draws (lib/bubble/edges.ts), and this file only
// maps (t, h) onto the sphere. One table, one set of profiles, both geometries.
//
// ⚑ WHY THIS IS GEOMETRY AND NOT A SHADER. The spherical surface is normally drawn procedurally, by
// classifying each fragment against the face normals, and a bubble ARC is expressible there — offsetting
// a face-separating plane gives a small circle, which is an arc. That was built and verified, and it
// dies the moment the picker offers a crenel: a square tab is not a circle. So the tiles are meshed
// instead, which costs a mesh and buys every profile at once.
//
// Almost none of the machinery is new. `triangulateFillCell` (sphericalIslamicFill.ts) ear-clips a cell
// in a face's tangent plane — written because a centroid fan FOLDS OVER on a concave cell, which is
// exactly what a bitten tile is — and the barycentric subdivision below is the same one that file uses
// to keep a fill hugging the sphere instead of cutting across it as a flat chord.

import * as THREE from "three";
import { Vector } from "@/classes/Vector";
import { pushEdge, type BubbleEdgeStyle } from "@/lib/bubble/edges";
import type { BubbleGrid } from "@/lib/bubble/pattern";
import { bubbleDepth, orientFaces, sphereMapOf } from "@/lib/bubble/sphere";
import { tileHueOf } from "@/lib/bubble/pattern";
import { triangulateFillCell } from "./sphericalIslamicFill";
import { edgeRadius } from "./sphericalPolyhedron";
import { tileHueRgb01 } from "./hueRing";
import type { Polyhedron } from "./platonicSolids";
import type { Pt } from "./cubic";

type V3 = [number, number, number];

const SPHERE_RADIUS = 1;
/** Arc length per subdivision segment, and the ceiling on it — both as in sphericalIslamicFill. */
const TARGET_SEG = 0.09;
// The same tube colours the flat solid strokes with (sphericalPolyhedron.ts), so a bubble board's
// boundaries read like every other spherical shelf's edges.
const DARK_LINE: [number, number, number] = [0.1, 0.105, 0.125];
const LIGHT_LINE: [number, number, number] = [0.06, 0.06, 0.08];
// ⚑ HIGHER than the Islamic fill's, because these cells are far bigger. An Islamic cell is a sliver
// inside one face; a bubble tile IS a face, and on the octahedron it spans an octant — at the shared
// cap of 10 the fill chorded across it and the surface came out visibly banded. Boards with many small
// faces never reach this: L is derived from the largest cell's reach, so they stay cheap.
const MAX_SUBDIV = 26;

/**
 * Which planar board the profiles' SHAPE is taken from: the tightest one.
 *
 * The board argument is a EUCLIDEAN corner budget, and on a sphere it means nothing — the depth here is
 * `sphereDepths`. What it still fixes is the authored proportions of the tabbed profiles, and the
 * triangle's are the ones that fit everywhere; inflating them is what crossed the dovetail's flanks.
 */
const PROFILE_BOARD: BubbleGrid = "triangle";

export interface BubbleSphereOptions {
	style?: BubbleEdgeStyle;
	kochLevel?: number;
	hueOffset?: number;
	lineWidth?: number;
	dark?: boolean;
	faceOpacity?: number;
	radius?: number;
}

export interface BubbleSphere {
	/** Fill + outlines. A group, because a bubble tiling is unreadable without its tile boundaries: a
	 *  k=1 board often has only two or three tile types, so same-hued neighbours merge into one blob and
	 *  the decoration — the whole subject — disappears. */
	object: THREE.Group;
	recolor: (hueOffset: number) => void;
	/** Stroke width, live. 0 hides the outlines; the fill is unaffected. */
	setLineWidth: (w: number, dark: boolean) => void;
	/** Face opacity, live — no rebuild, so a slider drag stays smooth. */
	setOpacity: (o: number) => void;
	dispose: () => void;
}

// ── The stroke tube ──────────────────────────────────────────────────────────────────────────────
//
// ⚑ WHY THIS IS NOT `THREE.TubeGeometry`. A tube generator sweeps ONE ring per sample point, and at a
// corner there is no single right ring: three's Frenet frame there is perpendicular to the BISECTOR, so
// the band arriving at the corner is sheared, the band leaving it is sheared the other way, and the
// corner itself is a chord between two rings that never reaches the apex — AL's "bridge between two
// points, stretched and skewed geometry that doesn't follow the tube up to the vertex". Sampling more
// densely cannot fix it: the defect is one ring where two orientations are needed.
//
// So each SEGMENT gets its own pair of rings, exactly perpendicular to that segment, and each CORNER
// gets a round joint — extra rings sharing the corner's centre, rotating the section from the incoming
// direction to the outgoing one about the turn axis. The joint's outer silhouette is then an arc of the
// tube's own radius about the corner point, which is a round line join, and the apex is reached exactly.
// Path ends get a ball for the same reason: several decorated edges meet at a solid's vertex at wide
// angles, and flat caps leave a notch there.
const RADIAL = 8;
const RING_COS = Array.from({ length: RADIAL }, (_, i) => Math.cos((2 * Math.PI * i) / RADIAL));
const RING_SIN = Array.from({ length: RADIAL }, (_, i) => Math.sin((2 * Math.PI * i) / RADIAL));
/** Angular resolution of a round joint. 30° keeps a dovetail's near-hairpin turn visibly round. */
const JOINT_STEP = Math.PI / 6;
/** Below this the polyline is straight enough that a joint would be indistinguishable from the band. */
const JOINT_MIN = 0.02;

let ballPos: Float32Array | null = null;
/** The end ball, as raw unit-sphere triangles (PolyhedronGeometry is non-indexed, so this is a fan-free
 *  triangle soup that can be appended to the tube's own buffers verbatim). */
function ballTemplate(): Float32Array {
	if (!ballPos) {
		const g = new THREE.IcosahedronGeometry(1, 1);
		ballPos = (g.getAttribute("position").array as Float32Array).slice();
		g.dispose();
	}
	return ballPos;
}

/** Drop repeated points: a zero-length segment has no direction, and one would poison the frame. */
function dedupe(pts: THREE.Vector3[]): THREE.Vector3[] {
	const out: THREE.Vector3[] = [];
	for (const p of pts) if (!out.length || out[out.length - 1].distanceToSquared(p) > 1e-18) out.push(p);
	return out;
}

/** How many joint rings each interior corner of a path needs — 0 where it is effectively straight. */
function cornerSteps(pts: THREE.Vector3[]): Int32Array {
	const steps = new Int32Array(Math.max(0, pts.length - 2));
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	for (let i = 1; i < pts.length - 1; i++) {
		a.subVectors(pts[i], pts[i - 1]).normalize();
		b.subVectors(pts[i + 1], pts[i]).normalize();
		const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
		// A hairpin (a exactly opposite b) has no turn axis; it does not occur in any shipped profile,
		// and leaving its joint out is better than picking an arbitrary plane to swing through.
		steps[i - 1] = ang < JOINT_MIN || a.clone().cross(b).lengthSq() < 1e-14 ? 0 : Math.ceil(ang / JOINT_STEP);
	}
	return steps;
}

/** Every stroke path as one indexed geometry: perpendicular segment bands, round joints, ball ends. */
function buildTubeGeometry(paths: THREE.Vector3[][], radius: number): THREE.BufferGeometry {
	const clean = paths.map(dedupe).filter((p) => p.length >= 2);
	const steps = clean.map(cornerSteps);
	const ball = ballTemplate();
	const ballVerts = ball.length / 3;
	let rings = 0;
	let bands = 0;
	clean.forEach((pts, p) => {
		let r = pts.length;
		for (const s of steps[p]) r += s;
		rings += r;
		bands += r - 1;
	});
	const balls = clean.length * 2;
	const vertCount = rings * RADIAL + balls * ballVerts;
	const pos = new Float32Array(vertCount * 3);
	const nor = new Float32Array(vertCount * 3);
	const idx = new Uint32Array(bands * RADIAL * 6 + balls * ballVerts);
	let vi = 0;
	let ii = 0;

	const emitRing = (c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3) => {
		const base = vi;
		for (let i = 0; i < RADIAL; i++, vi++) {
			const nx = RING_COS[i] * u.x + RING_SIN[i] * v.x;
			const ny = RING_COS[i] * u.y + RING_SIN[i] * v.y;
			const nz = RING_COS[i] * u.z + RING_SIN[i] * v.z;
			nor[vi * 3] = nx; nor[vi * 3 + 1] = ny; nor[vi * 3 + 2] = nz;
			pos[vi * 3] = c.x + radius * nx; pos[vi * 3 + 1] = c.y + radius * ny; pos[vi * 3 + 2] = c.z + radius * nz;
		}
		return base;
	};
	const emitBand = (a: number, b: number) => {
		for (let i = 0; i < RADIAL; i++) {
			const j = (i + 1) % RADIAL;
			idx[ii++] = a + i; idx[ii++] = b + i; idx[ii++] = b + j;
			idx[ii++] = a + i; idx[ii++] = b + j; idx[ii++] = a + j;
		}
	};
	const emitBall = (c: THREE.Vector3) => {
		for (let i = 0; i < ballVerts; i++, vi++) {
			const x = ball[i * 3], y = ball[i * 3 + 1], z = ball[i * 3 + 2];
			nor[vi * 3] = x; nor[vi * 3 + 1] = y; nor[vi * 3 + 2] = z;
			pos[vi * 3] = c.x + radius * x; pos[vi * 3 + 1] = c.y + radius * y; pos[vi * 3 + 2] = c.z + radius * z;
			idx[ii++] = vi;
		}
	};

	const dir = (i: number, pts: THREE.Vector3[]) => new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
	clean.forEach((pts, p) => {
		const d0 = dir(0, pts);
		let u = new THREE.Vector3(0, 0, 1).cross(d0);
		if (u.lengthSq() < 1e-8) u = new THREE.Vector3(1, 0, 0).cross(d0);
		u.normalize();
		let v = new THREE.Vector3().crossVectors(d0, u);
		let prev = emitRing(pts[0], u, v);
		for (let i = 1; i < pts.length; i++) {
			const cur = emitRing(pts[i], u, v); // still the incoming segment's frame: the band stays a cylinder
			emitBand(prev, cur);
			prev = cur;
			const n = i <= steps[p].length ? steps[p][i - 1] : 0;
			if (!n) continue;
			// Swing the section from the incoming direction to the outgoing one about the turn axis. Rotating
			// the frame is also its parallel transport, so the ring vertices stay in correspondence and no
			// twist accumulates along the path.
			const a = dir(i - 1, pts);
			const b = dir(i, pts);
			const axis = new THREE.Vector3().crossVectors(a, b).normalize();
			const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
			const q = new THREE.Quaternion();
			for (let s = 1; s <= n; s++) {
				q.setFromAxisAngle(axis, (ang * s) / n);
				const uu = u.clone().applyQuaternion(q);
				const vv = v.clone().applyQuaternion(q);
				const rr = emitRing(pts[i], uu, vv);
				emitBand(prev, rr);
				prev = rr;
				if (s === n) { u = uu; v = vv; }
			}
		}
		emitBall(pts[0]);
		emitBall(pts[pts.length - 1]);
	});

	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
	g.setIndex(new THREE.BufferAttribute(idx, 1));
	return g;
}

/**
 * Resample a path of surface directions so every step is a short arc.
 *
 * ⚑ A tube segment is a straight CHORD. Between two points far apart on a sphere the chord passes
 * BELOW the surface, so the middle of a long segment sinks into the fill and disappears — visible as
 * the stroke breaking up along the octahedron's long edges. Slerping to a maximum step keeps the tube
 * on the surface, and it also puts the stroke on the same great-circle arcs the fill's own subdivision
 * follows, which is what makes the two coincide.
 */
function densifyOnSphere(path: readonly V3[], maxStep = 0.035): THREE.Vector3[] {
	const out: THREE.Vector3[] = [];
	const push = (v: V3) => out.push(new THREE.Vector3(v[0], v[1], v[2]));
	for (let i = 0; i < path.length - 1; i++) {
		const a = path[i];
		const b = path[i + 1];
		const ra = Math.hypot(a[0], a[1], a[2]) || 1;
		const ang = Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (ra * (Math.hypot(b[0], b[1], b[2]) || 1)))));
		const steps = Math.max(1, Math.ceil(ang / maxStep));
		for (let k = 0; k < steps; k++) {
			const t = k / steps;
			const m = norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
			push([m[0] * ra, m[1] * ra, m[2] * ra]);
		}
	}
	push(path[path.length - 1]);
	return out;
}

const norm = (v: V3): V3 => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The two angular bounds a board's profiles are scaled against: how far a bite may cut into the
 *  smallest tile, and the angular length of an edge. */
export function sphereDepths(poly: Polyhedron): { cap: number; edgeArc: number } {
	const faces = orientFaces(poly.faces);
	const unit = poly.vertices.map((v) => norm([v[0], v[1], v[2]]));
	// A BITE of depth d eats d into its face, so on a board whose faces differ in size a depth that suits
	// the largest cuts deep into the smallest. The bound is a fraction of the TIGHTEST inradius on the
	// board: 0.6 keeps a bite clearly short of even the smallest tile's centre, where the 0.75 it shipped
	// at ate three quarters of the way in and left the icosahedron's all-bites triangle overlapping by
	// 2.25% of the sphere.
	let tightest = Infinity;
	for (const ring of faces) {
		const c = norm(ring.reduce<V3>((a, i) => [a[0] + unit[i][0], a[1] + unit[i][1], a[2] + unit[i][2]], [0, 0, 0]));
		const mid = norm([
			unit[ring[0]][0] + unit[ring[1]][0], unit[ring[0]][1] + unit[ring[1]][1], unit[ring[0]][2] + unit[ring[1]][2],
		]);
		tightest = Math.min(tightest, Math.acos(Math.max(-1, Math.min(1, dot(c, mid)))));
	}
	const unitEdge = (() => {
		const ring = faces[0];
		return Math.acos(Math.max(-1, Math.min(1, dot(unit[ring[0]], unit[ring[1]]))));
	})();
	return { cap: 0.6 * tightest, edgeArc: unitEdge };
}

/**
 * One decorated edge as directions on the sphere, from P to Q INCLUDING both endpoints.
 *
 * The profile's `t` runs along the great-circle arc from P to Q and its `h` lifts off that arc. Since P
 * and Q lie on the great circle, its unit normal `n` is perpendicular to every point of the arc, so a
 * point at angular offset φ is just cos φ · S + sin φ · n — no tangent frame to build and no drift.
 *
 * ⚑ Built ONCE PER EDGE and shared by the two faces, rather than once per face. The bump and bite
 * branches agree analytically (h_bite(s) = -h_bump(1-s), and the outward normals are opposite, so the
 * flips cancel), but computing the same curve twice in floating point leaves a hairline crack between
 * the tiles and draws the boundary tube twice.
 */
function edgeCurve(P: V3, Q: V3, interior: V3, profile: readonly Pt[], lift: number): V3[] {
	const n0 = norm(cross(P, Q));
	// Outward from the face that owns this profile = away from its interior.
	const n: V3 = dot(n0, interior) > 0 ? [-n0[0], -n0[1], -n0[2]] : n0;
	const arc = Math.acos(Math.max(-1, Math.min(1, dot(P, Q))));
	const sinArc = Math.sin(arc) || 1;
	const out: V3[] = [];
	for (const { x: t, y: h } of profile) {
		const a = Math.sin((1 - t) * arc) / sinArc;
		const b = Math.sin(t * arc) / sinArc;
		const S: V3 = [a * P[0] + b * Q[0], a * P[1] + b * Q[1], a * P[2] + b * Q[2]];
		const phi = h * lift;
		const c = Math.cos(phi);
		const sn = Math.sin(phi);
		out.push(norm([c * S[0] + sn * n[0], c * S[1] + sn * n[1], c * S[2] + sn * n[2]]));
	}
	out.push(Q);
	return out;
}

/** Build the decorated tiling of `poly` under `bites` as a mesh on the sphere. */
export function buildBubbleSphere(
	poly: Polyhedron | null,
	bites: number[][],
	opts: BubbleSphereOptions = {},
): BubbleSphere | null {
	if (!poly) return null;
	const radius = opts.radius ?? SPHERE_RADIUS;
	const faces = orientFaces(poly.faces);
	const m = sphereMapOf(poly);
	const unit = poly.vertices.map((v) => norm([v[0], v[1], v[2]]));

	// The profile, asked of the Euclidean edge code once per side. Its (t, h) is a SHAPE; the depth is
	// this solid's own.
	const style = opts.style ?? "arc";
	const level = opts.kochLevel ?? 1;
	const profile = (outward: boolean): Pt[] => {
		const p: Pt[] = [];
		pushEdge(p, [0, 0], [1, 0], outward, style, PROFILE_BOARD, level);
		return p;
	};
	const bump = profile(true);
	const bite = profile(false);
	// ⚑ DEPTH: the profile's PLANAR proportion, held under the bite bound.
	//
	// A profile keeps h × the edge's angular length, which is exactly what its h means on the flat canvas.
	// (Anchoring the depth to the solid instead — the sagitta that turns its biggest face into a circle —
	// made the arc far too shallow on boards with a big largest face: 7% of the edge on the
	// rhombicosidodecahedron against the plane's 13.4%, a decoration you have to hunt for.) `cap` is what
	// stops h × edgeArc self-intersecting on solids with long edges — the tetrahedron's jigsaw covered
	// 646% of the sphere before that bound existed.
	const { cap, edgeArc } = sphereDepths(poly);
	const maxH = Math.max(1e-6, ...bump.map((q) => Math.abs(q.y)));
	const lift = Math.min(maxH * edgeArc, cap) / maxH;

	// One curve per EDGE, from the bump/bite the face owning its first dart carries.
	const faceOfDart = new Int32Array(m.darts);
	{ let d = 0; m.faceSizes.forEach((n, f) => { for (let i = 0; i < n; i++) faceOfDart[d++] = f; }); }
	const centres = faces.map((ring) =>
		norm(ring.reduce<V3>((a, i) => [a[0] + unit[i][0], a[1] + unit[i][1], a[2] + unit[i][2]], [0, 0, 0])));
	const curves: V3[][] = new Array(m.edges);
	{
		let d = 0;
		const posInFace: number[] = new Array(m.darts);
		m.faceSizes.forEach((n) => { for (let i = 0; i < n; i++) posInFace[d++] = i; });
		for (let e = 0; e < m.edges; e++) {
			const fd = m.firstDartOf[e];
			const f = faceOfDart[fd];
			const i = posInFace[fd];
			const ring = faces[f];
			curves[e] = edgeCurve(unit[ring[i]], unit[ring[(i + 1) % ring.length]], centres[f],
				bites[f][i] === 0 ? bump : bite, lift);
		}
	}

	interface Cell { tris: Array<[Vector, Vector, Vector]>; hue: number; C: V3; u: V3; v: V3 }
	const cells: Cell[] = [];
	let baseTris = 0;
	let maxArc = 0;
	// One tube polyline per edge, so a shared boundary is drawn once and the two tiles cannot crack apart.
	//
	// ⚑ ON the fill, not above it. An earlier build pushed the stroke out radially by one tube radius to
	// stop it z-fighting the fill, and that offset is invisible looking straight down at the sphere and
	// exactly one stroke-width wide at the limb — AL's parallax. A radial offset cannot be right at every
	// viewing angle; the stroke has to sit on the boundary curve itself. The fill is given a polygon offset
	// instead, which biases only the DEPTH it is tested at and leaves both surfaces where they belong.
	const strokePaths: V3[][] = curves.map((c) => c.map((q) => [q[0] * radius, q[1] * radius, q[2] * radius] as V3));

	{
		let d = 0;
		for (let f = 0; f < faces.length; f++) {
			const ring = faces[f];
			const dirs: V3[] = [];
			for (let i = 0; i < ring.length; i++, d++) {
				const c = curves[m.edgeOf[d]];
				// The edge's curve runs from its FIRST dart's tail; this face walks it the other way when
				// it holds the twin.
				const fwd = m.firstDartOf[m.edgeOf[d]] === d;
				for (let j = 0; j < c.length - 1; j++) dirs.push(fwd ? c[j] : c[c.length - 1 - j]);
			}
			const centre = centres[f];
			const u = norm(cross(Math.abs(centre[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], centre));
			const v = cross(centre, u);
			const flat = dirs.map((q) => {
				const w = dot(q, centre) || 1e-6;
				return new Vector(dot(q, u) / w, dot(q, v) / w);
			});
			for (const q of flat) maxArc = Math.max(maxArc, Math.atan(Math.hypot(q.x, q.y)));
			const tris = triangulateFillCell(flat);
			if (!tris.length) continue;
			baseTris += tris.length;
			cells.push({ tris, hue: tileHueOf(bites[f], 1), C: centre, u, v });
		}
	}
	const L = Math.min(MAX_SUBDIV, Math.max(4, Math.ceil(maxArc / TARGET_SEG)));

	// Pass 2: subdivide each triangle barycentrically and project every sub-vertex onto the sphere, so
	// the tiles curve with the surface instead of chording across it.
	const triCount = baseTris * L * L;
	const pos = new Float32Array(triCount * 9);
	const hueOf = new Float32Array(triCount * 3);
	let vi = 0;
	const grid: V3[][] = Array.from({ length: L + 1 }, () => [] as V3[]);
	for (const cell of cells) {
		const to3 = (x: number, y: number): V3 => {
			const d = norm([
				cell.C[0] + x * cell.u[0] + y * cell.v[0],
				cell.C[1] + x * cell.u[1] + y * cell.v[1],
				cell.C[2] + x * cell.u[2] + y * cell.v[2],
			]);
			return [d[0] * radius, d[1] * radius, d[2] * radius];
		};
		const put = (p: V3) => { pos[vi * 3] = p[0]; pos[vi * 3 + 1] = p[1]; pos[vi * 3 + 2] = p[2]; hueOf[vi] = cell.hue; vi++; };
		for (const [t0, t1, t2] of cell.tris) {
			const ux = t1.x - t0.x, uy = t1.y - t0.y, wx = t2.x - t0.x, wy = t2.y - t0.y;
			for (let a = 0; a <= L; a++)
				for (let b = 0; b <= L - a; b++)
					grid[a][b] = to3(t0.x + (a / L) * ux + (b / L) * wx, t0.y + (a / L) * uy + (b / L) * wy);
			for (let a = 0; a < L; a++)
				for (let b = 0; b < L - a; b++) {
					put(grid[a][b]); put(grid[a + 1][b]); put(grid[a][b + 1]);
					if (b < L - a - 1) { put(grid[a + 1][b]); put(grid[a + 1][b + 1]); put(grid[a][b + 1]); }
				}
		}
	}

	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, vi * 3), 3));
	const colorAttr = new THREE.BufferAttribute(new Float32Array(vi * 3), 3);
	geom.setAttribute("color", colorAttr);
	const scratch = new THREE.Color();
	const applyColor = (hueOffset: number) => {
		const arr = colorAttr.array as Float32Array;
		for (let i = 0; i < vi; i++) {
			const [r, g, b] = tileHueRgb01(hueOf[i] + hueOffset);
			scratch.setRGB(r, g, b, THREE.SRGBColorSpace);
			arr[i * 3] = scratch.r; arr[i * 3 + 1] = scratch.g; arr[i * 3 + 2] = scratch.b;
		}
		colorAttr.needsUpdate = true;
	};
	applyColor(opts.hueOffset ?? 0);
	// ⚑ RADIAL normals, written directly — not `computeVertexNormals`, which averages the triangle normals
	// of a subdivided patch and leaves each sub-quad shaded as its own facet. On a sphere the normal at a
	// point IS that point, so this is both exact and cheaper, and it is what removes the blotchy banding
	// AL saw across every tile.
	{
		const nor = new Float32Array(vi * 3);
		for (let i = 0; i < vi; i++) {
			const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
			const L = Math.hypot(x, y, z) || 1;
			nor[i * 3] = x / L; nor[i * 3 + 1] = y / L; nor[i * 3 + 2] = z / L;
		}
		geom.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
	}
	// ⚑ STANDARD, not Basic. `applyStudioMaterials` only touches MeshStandardMaterial, so a Basic one is
	// skipped silently: the surface came out unlit and flat, which is why AL said it did not feel
	// three-dimensional even in perspective. Standard also gives the face opacity something to act on.
	const material = new THREE.MeshStandardMaterial({
		vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
		// Pushed back in DEPTH only (see the stroke note above): the tube's centreline lies exactly on the
		// tile boundary, so without this the two surfaces are tangent along the stroke's silhouette and
		// z-fight there. Nothing moves in space, so the stroke stays centred on the boundary at every angle.
		polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
	});
	const mesh = new THREE.Mesh(geom, material);
	let opacity = Math.min(Math.max(opts.faceOpacity ?? 1, 0), 1);
	const setOpacity = (o: number) => {
		opacity = Math.min(Math.max(o, 0), 1);
		material.opacity = opacity;
		material.transparent = opacity < 1;
		// Below 1 the facets must stop writing depth or the far side never shows through.
		material.depthWrite = opacity >= 1;
		material.needsUpdate = true;
	};
	setOpacity(opacity);

	// ⚑ TUBES. The cross-section is perpendicular to the direction of travel everywhere and the corners
	// carry a round joint — see `buildTubeGeometry`. Three earlier attempts were wrong: `LineBasicMaterial`
	// ignores `linewidth` in WebGL, so the stroke slider could only toggle the outline; sweeping ONE frame
	// along a whole polyline shears the section through a sharp turn; and `TubeGeometry`, which fixes the
	// shear along a segment, still has only one ring to spend at a corner.
	const tubeMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
	const setTubeColor = (dark: boolean) => {
		const [r, g, b] = dark ? DARK_LINE : LIGHT_LINE;
		tubeMat.color.setRGB(r, g, b, THREE.SRGBColorSpace);
	};
	setTubeColor(opts.dark ?? false);
	const tubeMesh = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
	const buildTubes = (w: number) => {
		tubeMesh.geometry.dispose();
		if (!(w > 0)) { tubeMesh.geometry = new THREE.BufferGeometry(); tubeMesh.visible = false; return; }
		tubeMesh.visible = true;
		// The stroke follows the polyline VERTEX BY VERTEX. (An arc-length-parameterised curve, which is what
		// `CurvePath` gives, samples between the vertices and shortcuts every corner — that is why the tube
		// once traced a visibly different line from the fill it bounds.)
		tubeMesh.geometry = buildTubeGeometry(strokePaths.map((p) => densifyOnSphere(p)), edgeRadius(w) * radius);
	};
	buildTubes(opts.lineWidth ?? 1);
	const setLineWidth = (w: number, dark: boolean) => {
		setTubeColor(dark);
		buildTubes(w);
	};

	const object = new THREE.Group();
	object.add(mesh, tubeMesh);
	return {
		object,
		recolor: applyColor,
		setLineWidth,
		setOpacity,
		dispose: () => { geom.dispose(); material.dispose(); tubeMesh.geometry.dispose(); tubeMat.dispose(); },
	};
}
