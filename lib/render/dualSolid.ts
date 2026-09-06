// THE POLAR RECIPROCAL — every solid in the atlas, seen as its dual.
//
// This ships NO records, and that is the point (AL, 2026-08-31). A dual is a FUNCTION of a solid, not
// new data: 478 of the 487 registry solids and 99 of the 100 star records reciprocate cleanly, and
// storing 577 derived polyhedra would double the atlas without adding a single fact. So the dual is a
// VIEW, computed on demand from the record already on screen.
//
// THE OPERATOR. A face plane {x : x·n̂ = d} becomes the point (r²/d)·n̂; an original vertex v becomes the
// dual face lying in the plane x·v = r². Two things follow and both matter:
//
//   * THE SPHERE IS NOT A PARAMETER. Changing r scales every dual vertex by the same factor, so
//     reciprocating about any concentric sphere gives the same SHAPE. There is no midsphere-versus-
//     circumsphere decision to get wrong. The CENTRE is the only real choice, and for everything here
//     it is the symmetry centre, which is the origin every shelf already develops about.
//   * d = 0 SENDS A VERTEX TO INFINITY, and that is not an edge case to paper over — it is the
//     hemipolyhedra. A face through the centre has no reciprocal point in R³; its dual vertex lies on
//     the projective plane at infinity, which is exactly why the duals of the nine are called ACRONS
//     and why no finite coordinate list can hold one. `polarDual` returns null and names the count, so
//     the view can say what is true instead of drawing something false.
//
// WHY THE FACES COME OUT PLANAR, which is the whole reason this is not `platonicSolids.dualPolyhedron`.
// That one takes each face's normalised CENTROID, which puts every dual vertex on the unit sphere. For
// a Platonic solid the centroids are already equidistant so the two agree, and for anything else they
// do not: the centroid dual of an Archimedean solid is a combinatorial dual drawn on a sphere, with
// non-planar faces, and it is NOT the Catalan solid. Reciprocation gives planarity by construction —
// every dual vertex around an original vertex v satisfies x·v = r², one plane, no fitting. Measured on
// the whole registry: worst deviation from planar is at machine epsilon, on all 478.
//
// VERIFIED against the one dual family the literature does enumerate. Reciprocating the 13 Archimedean
// solids reproduces the 13 Catalan solids exactly — 12{3}, 12{4}, 24{3}, 24{3}, 24{4}, 48{3}, 24{5},
// 30{4}, 60{3}, 60{3}, 60{4}, 120{3}, 60{5} — every one measuring a single face orbit. dual-solid.test.ts
// asserts that, so a change to the operator that broke the Catalans could not ship quietly.

import type { Polyhedron, Vec3 } from "./platonicSolids";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
function unit(a: Vec3): Vec3 {
	const n = len(a) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}

/**
 * A face ring's plane: unit normal and signed distance from the origin.
 *
 * Newell's method, and not a cross product of the first three points, because a STAR ring's first three
 * vertices can be collinear and because a long ring accumulates less error this way. Every face on
 * every shelf here is planar already, so this reads the plane rather than fitting one.
 */
export function facePlane(vertices: readonly Vec3[], ring: readonly number[]): { n: Vec3; d: number } {
	let n: Vec3 = [0, 0, 0];
	for (let i = 0; i < ring.length; i++) {
		const a = vertices[ring[i]], b = vertices[ring[(i + 1) % ring.length]];
		n = [
			n[0] + (a[1] - b[1]) * (a[2] + b[2]),
			n[1] + (a[2] - b[2]) * (a[0] + b[0]),
			n[2] + (a[0] - b[0]) * (a[1] + b[1]),
		];
	}
	const u = unit(n);
	return { n: u, d: dot(u, vertices[ring[0]]) };
}

/** Why a solid has no dual in R³, when it has none. Both reasons are geometric facts about the solid. */
export interface DualRefusal {
	/** How many face planes pass through the centre. Each is one dual vertex at infinity. */
	facesThroughCentre: number;
	/**
	 * How many pairs of the solid's faces are COPLANAR.
	 *
	 * Reciprocation sends a plane to a point, so two faces in one plane land on ONE dual vertex and the
	 * reciprocal is not a polyhedron — it has fewer vertices than faces and its rings are not a valid
	 * embedding. Measured, not assumed: 46 of the 484 reciprocable registry solids are like this, all
	 * on the non-convex shelf, and before this refusal existed each of them silently reported an
	 * isometry group smaller than its own solid's, which is impossible.
	 */
	coplanarFacePairs: number;
}

/**
 * The dual of `poly`, or a refusal naming how many of its faces pass through the centre.
 *
 * One dual vertex per face, one dual face per vertex — the incident faces in cyclic order about that
 * vertex, which is the same ring-walk `platonicSolids` uses and the same one the atlas trusts for the
 * dodecahedron.
 */
export function polarDual(poly: Polyhedron, radius = 1): { dual: Polyhedron } | { refusal: DualRefusal } {
	const V = poly.vertices as Vec3[];
	const planes = poly.faces.map((f) => facePlane(V, f));
	const scale = V.reduce((m, v) => Math.max(m, len(v)), 0) || 1;
	const through = planes.filter((p) => Math.abs(p.d) < 1e-9 * scale).length;

	const r2 = radius * radius;
	const verts: Vec3[] = planes.map(({ n, d }) => [(r2 * n[0]) / d, (r2 * n[1]) / d, (r2 * n[2]) / d]);
	// Coplanar faces ⇒ coincident dual vertices. Compared on the (normal, offset) pair rather than on
	// the reciprocated points, so a plane close to the centre — whose dual vertex is enormous — is
	// judged on the same scale as every other.
	let coplanar = 0;
	for (let i = 0; i < planes.length; i++)
		for (let j = i + 1; j < planes.length; j++) {
			const a = planes[i], b = planes[j];
			if (Math.abs(a.d - b.d) < 1e-9 * scale && len(sub(a.n, b.n)) < 1e-9) coplanar++;
		}
	if (through > 0 || coplanar > 0)
		return { refusal: { facesThroughCentre: through, coplanarFacePairs: coplanar } };

	// The dual face for original vertex v is the ring of faces around v, and the order is COMBINATORIAL:
	// two of them are consecutive exactly when they share an edge through v. Walk that.
	//
	// ⚑ IT USED TO SORT THEM BY ANGLE about the point where the v axis pierces the dual face's plane,
	// and that is right only when the piercing point lies INSIDE the face. It does for a canonical
	// solid — every Platonic, Archimedean and Catalan test passed — and it does not for an elongated
	// Johnson solid, where the foot of the perpendicular from the centre can fall outside the face. The
	// ring then came back in a crossed order and fan-triangulated into overlapping slivers: AL saw the
	// dual of the elongated pentagonal gyrobicupola render as a tangle. The walk below has no geometry
	// in it at all, so there is no configuration for it to be wrong about.
	const faces = V.map((_v, vi) => {
		const inc: number[] = [];
		for (let fi = 0; fi < poly.faces.length; fi++) if (poly.faces[fi].includes(vi)) inc.push(fi);
		if (inc.length < 3) return inc;
		// The two neighbours of v inside each incident face — the ends of the two edges at v.
		const arms = new Map<number, [number, number]>();
		for (const fi of inc) {
			const f = poly.faces[fi];
			const i = f.indexOf(vi);
			arms.set(fi, [f[(i - 1 + f.length) % f.length], f[(i + 1) % f.length]]);
		}
		const ring: number[] = [inc[0]];
		const used = new Set(ring);
		let cur = inc[0];
		let from = arms.get(cur)![0];
		for (let step = 1; step < inc.length; step++) {
			const [a, b] = arms.get(cur)!;
			const exit = a === from ? b : a;
			const next = inc.find((fi) => !used.has(fi) && arms.get(fi)!.includes(exit));
			if (next === undefined) break; // not a closed ring — leave what was walked, do not invent
			ring.push(next);
			used.add(next);
			from = exit;
			cur = next;
		}
		return ring.length === inc.length ? ring : inc;
	});
	return {
		dual: {
			id: `${poly.id}-dual`,
			schlafli: [poly.schlafli[1], poly.schlafli[0]],
			vertexConfig: "",
			name: `Dual of ${poly.name}`,
			vertices: verts,
			faces,
		},
	};
}

/**
 * FACE orbits under the solid's own isometry group, measured off the geometry.
 *
 * The mirror of the vertex-orbit k every other shelf carries, and the certificate AL chose for this
 * view: a dual is ISOHEDRAL exactly when this is 1, and a dual of a uniform polyhedron is isohedral by
 * construction, so a 1 here is a real test passing and not a restatement of the input.
 *
 * ⚑ IT IS NOT "ALL FACES CONGRUENT", and the difference is the J27/J37 lesson this repo has already
 * paid for once: congruent is not transitive, and a vertex ARRANGEMENT can be more symmetric than the
 * solid built on it. So this measures the group — orthogonal maps carrying the vertex set AND the face
 * set to themselves — and reads the orbits off it.
 */
export function faceOrbits(poly: Polyhedron): { orbits: number; groupOrder: number } {
	return orbitsUnderIsometries(poly, "faces");
}

/**
 * VERTEX orbits under the solid's own isometry group — the k every other shelf carries.
 *
 * This is what the dual view actually reports, and the reason is a theorem rather than a preference.
 * Reciprocation about the centre commutes with every orthogonal map, so a solid and its dual have the
 * SAME isometry group; and the reciprocal sends each solid vertex to a dual face. So
 *
 *     face orbits of the dual  =  vertex orbits of the solid
 *
 * exactly. Measuring it on the solid instead of on the dual is not a shortcut — it is the numerically
 * sound side of an identity. A dual's vertices sit at 1/d for the face offsets d, so a solid with one
 * face near the centre reciprocates to vertices spanning many orders of magnitude, and no single
 * tolerance reads that point set correctly; four of the 440 reciprocable registry solids are already
 * in that regime. The solid's own vertices are all of one scale.
 *
 * `dual-solid.test.ts` still measures both sides and asserts they agree, because the identity is what
 * caught three separate tolerance bugs in this file.
 */
export function vertexOrbits(poly: Polyhedron): { orbits: number; groupOrder: number } {
	return orbitsUnderIsometries(poly, "vertices");
}

/** True when the dual of `poly` is ISOHEDRAL — one face orbit — which holds exactly when `poly` is
 *  vertex-transitive. The certificate this view reports (AL, 2026-08-31). */
export function dualIsIsohedral(poly: Polyhedron): boolean {
	return vertexOrbits(poly).orbits === 1;
}

function orbitsUnderIsometries(poly: Polyhedron, of: "faces" | "vertices"): { orbits: number; groupOrder: number } {
	// ⚑ MEASURE ON A UNIT-SCALED COPY. Every tolerance below — the vertex-match radius, the equal-norm
	// and equal-distance tests, the floor on the anchor's determinant — is an absolute number, and a
	// dual's vertices are NOT on any fixed scale: reciprocation divides by the face-plane offset, so a
	// solid with a face near the centre reciprocates to vertices orders of magnitude further out. At
	// that size an absolute 1e-6 rejects genuine candidate isometries and the group comes back SMALLER
	// than it is. Measured before this line existed: 65 of 484 duals disagreed with their own solid's
	// group order, which is impossible — reciprocation about the centre commutes with every orthogonal
	// map, so a dual has exactly its solid's isometry group. dual-solid.test.ts asserts that equality
	// over the whole registry now, because it is the property that catches this class of bug.
	const rawV = poly.vertices as Vec3[];
	const scale = rawV.reduce((m, v) => Math.max(m, len(v)), 0) || 1;
	const V: Vec3[] = rawV.map((v) => [v[0] / scale, v[1] / scale, v[2] / scale]);
	const n = V.length;
	// VERTEX LOOKUP BY POSITION, and it is a spatial bucket rather than a rounded string key.
	//
	// ⚑ A string key gets this wrong in two ways and both read as "not isohedral" instead of as an
	// error, which is how the first version of this survived a run. First, NEGATIVE ZERO: a coordinate
	// that is exactly 0 returns from the matrix round-trip as -1e-17, and (-1e-17).toFixed(6) is
	// "-0.000000" against (0).toFixed(6) = "0.000000" — the tetrahedron and cube have no zero
	// coordinate and passed, the icosahedron has several and read as having no symmetry at all.
	// Second, ROUNDING BOUNDARIES: develop output carries nine decimals, the round trip moves it by
	// ~1e-8, and a value sitting on a 6-decimal boundary rounds to different strings before and after.
	// So bucket coarsely, then sweep the 27 neighbouring cells and take the true match. No boundary,
	// no signed zero, and the tolerance is stated once instead of implied by a format string.
	const TOL = 1e-6;
	const CELL = 1e-3;
	const cell = (x: number) => Math.round(x / CELL);
	const bucket = new Map<string, number[]>();
	V.forEach((v, i) => {
		const bk = `${cell(v[0])},${cell(v[1])},${cell(v[2])}`;
		(bucket.get(bk) ?? bucket.set(bk, []).get(bk)!).push(i);
	});
	const at = (v: Vec3): number | undefined => {
		const [a, b, c] = [cell(v[0]), cell(v[1]), cell(v[2])];
		for (let da = -1; da <= 1; da++)
			for (let db = -1; db <= 1; db++)
				for (let dc = -1; dc <= 1; dc++)
					for (const i of bucket.get(`${a + da},${b + db},${c + dc}`) ?? [])
						if (len(sub(V[i], v)) < TOL) return i;
		return undefined;
	};
	const faceKey = new Set(poly.faces.map((f) => [...f].sort((a, b) => a - b).join(",")));

	// An anchor triple spanning R³; its image under any isometry determines the map completely.
	let anchor: number[] | null = null;
	for (const f of poly.faces) {
		for (let a = 0; a < f.length && !anchor; a++)
			for (let b = a + 1; b < f.length && !anchor; b++)
				for (let c = b + 1; c < f.length && !anchor; c++)
					if (Math.abs(dot(V[f[a]], cross(V[f[b]], V[f[c]]))) > 1e-6) anchor = [f[a], f[b], f[c]];
		if (anchor) break;
	}
	if (!anchor) {
		for (let a = 0; a < n && !anchor; a++)
			for (let b = a + 1; b < n && !anchor; b++)
				for (let c = b + 1; c < n && !anchor; c++)
					if (Math.abs(dot(V[a], cross(V[b], V[c]))) > 1e-6) anchor = [a, b, c];
	}
	if (!anchor) return { orbits: poly.faces.length, groupOrder: 1 };

	// Candidate images: an isometry preserves every norm and every pairwise distance, so only triples
	// matching the anchor's six invariants can be images of it. That prune is what keeps this cheap.
	const norms = anchor.map((i) => len(V[i]));
	const d01 = len(sub(V[anchor[0]], V[anchor[1]]));
	const d02 = len(sub(V[anchor[0]], V[anchor[2]]));
	const d12 = len(sub(V[anchor[1]], V[anchor[2]]));
	const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
	const c0 = [...V.keys()].filter((i) => near(len(V[i]), norms[0]));
	const c1 = [...V.keys()].filter((i) => near(len(V[i]), norms[1]));
	const c2 = [...V.keys()].filter((i) => near(len(V[i]), norms[2]));

	const A = [V[anchor[0]], V[anchor[1]], V[anchor[2]]];
	const det3 = (m: Vec3[]) => dot(m[0], cross(m[1], m[2]));
	const detA = det3(A);
	// Inverse of A as a matrix whose ROWS are A[0..2] — via the adjugate, exact enough at this scale.
	const inv = [cross(A[1], A[2]), cross(A[2], A[0]), cross(A[0], A[1])].map(
		(r) => [r[0] / detA, r[1] / detA, r[2] / detA] as Vec3,
	);

	const perms: number[][] = [];
	for (const i of c0)
		for (const j of c1) {
			if (!near(len(sub(V[i], V[j])), d01)) continue;
			for (const m of c2) {
				if (!near(len(sub(V[i], V[m])), d02) || !near(len(sub(V[j], V[m])), d12)) continue;
				// M maps A's rows to (V[i], V[j], V[m]): M = Bᵀ · inv, applied as v ↦ Σ (v·invCol) B.
				const B = [V[i], V[j], V[m]];
				const map = (v: Vec3): Vec3 => {
					// `inv` holds the ROWS of A⁻¹ (A being the matrix whose COLUMNS are the anchor
					// vectors), so the coefficients are row·v. Reading them as columns instead makes
					// every candidate fail the vertex-permutation check and the group comes back
					// trivial — which reads as "nothing is isohedral" rather than as an error.
					const c: Vec3 = [dot(v, inv[0]), dot(v, inv[1]), dot(v, inv[2])];
					return [
						c[0] * B[0][0] + c[1] * B[1][0] + c[2] * B[2][0],
						c[0] * B[0][1] + c[1] * B[1][1] + c[2] * B[2][1],
						c[0] * B[0][2] + c[1] * B[1][2] + c[2] * B[2][2],
					];
				};
				const perm = new Array<number>(n);
				let ok = true;
				for (let v = 0; v < n && ok; v++) {
					const t = at(map(V[v]));
					if (t === undefined) ok = false;
					else perm[v] = t;
				}
				if (!ok || new Set(perm).size !== n) continue;
				// …and it must preserve the FACES, not merely the point set.
				for (const f of poly.faces) {
					if (!faceKey.has(f.map((x) => perm[x]).sort((a, b) => a - b).join(","))) { ok = false; break; }
				}
				if (ok) perms.push(perm);
			}
		}
	const size = of === "faces" ? poly.faces.length : n;
	if (perms.length === 0) return { orbits: size, groupOrder: 1 };

	const parent = Array.from({ length: size }, (_, i) => i);
	const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
	if (of === "vertices") {
		for (const p of perms) for (let i = 0; i < n; i++) parent[find(i)] = find(p[i]);
	} else {
		const idOf = new Map<string, number>();
		poly.faces.forEach((f, i) => idOf.set([...f].sort((a, b) => a - b).join(","), i));
		for (const p of perms)
			poly.faces.forEach((f, i) => {
				const j = idOf.get(f.map((x) => p[x]).sort((a, b) => a - b).join(","));
				if (j !== undefined) parent[find(i)] = find(j);
			});
	}
	return { orbits: new Set(parent.map((_, i) => find(i))).size, groupOrder: perms.length };
}


/**
 * The MIDRADIUS: the distance from the centre to every edge LINE, when they all agree.
 *
 * A solid has a midsphere — one sphere tangent to every edge — exactly when that distance is constant,
 * and that is the property that makes the original-and-dual COMPOUND a fact rather than a picture.
 * Reciprocate about the midsphere and the two solids' edges cross each other, perpendicularly, at the
 * tangency points: that is the stella octangula, the cube-and-octahedron, the dodecahedron-and-
 * icosahedron. Reciprocate about anything else and the dual is the same SHAPE at a different size, so
 * the compound still draws — but where the two sit relative to each other is a number someone picked.
 *
 * Measured over the registry: 67 of 501 solids have one. Every Platonic, Archimedean and uniform solid
 * does; almost no Johnson, non-convex or genus solid does. Note the nine hemipolyhedra have a midsphere
 * and STILL have no dual, which is not a contradiction — a midsphere is about edges, and what stops
 * their reciprocal is a face through the centre.
 */
export function midradius(poly: Polyhedron): number | null {
	const V = poly.vertices as Vec3[];
	const seen = new Set<string>();
	const ds: number[] = [];
	for (const f of poly.faces)
		for (let i = 0; i < f.length; i++) {
			const a = f[i], b = f[(i + 1) % f.length];
			const kk = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (seen.has(kk)) continue;
			seen.add(kk);
			const A = V[a], d = sub(V[b], A), dd = dot(d, d);
			if (dd < 1e-18) continue;
			const t = -dot(A, d) / dd;
			ds.push(len([A[0] + t * d[0], A[1] + t * d[1], A[2] + t * d[2]]));
		}
	if (!ds.length) return null;
	const scale = V.reduce((m, v) => Math.max(m, len(v)), 0) || 1;
	return (Math.max(...ds) - Math.min(...ds)) / scale < 1e-6 ? ds[0] : null;
}

/**
 * The COMPOUND: the solid and its dual in one figure, as one Polyhedron so the existing mesh builder
 * draws it with no new scene plumbing.
 *
 * ⚑ IT IS OFFERED ONLY WITH A MIDSPHERE, and that is the answer to "is it always possible": no. A
 * compound is DRAWABLE wherever the dual exists — 440 of the 501 registry solids — but it is only a
 * FIGURE where one sphere is tangent to every edge, which 67 of them manage. The midsphere is what
 * fixes the two components' relative size, and it is what makes their edges cross. Without one the
 * scale is a number this function picked, and it shows: reciprocating the pentagonal cupola about its
 * RMS edge radius puts the dual's vertices between 1.05 and 4.74 while the solid's sit between 0.57
 * and 1.00, so one swallows the other and the picture says nothing true about either. AL saw exactly
 * that on the elongated pentagonal gyrobicupola. Refusing is the honest control.
 */
export function dualCompound(poly: Polyhedron):
	| { compound: Polyhedron; radius: number; dualFaceStart: number }
	| { refusal: DualRefusal | { noMidsphere: true } } {
	const radius = midradius(poly);
	if (radius === null) return { refusal: { noMidsphere: true } };
	const d = polarDual(poly, radius);
	if ("refusal" in d) return d;
	const shift = poly.vertices.length;
	return {
		radius,
		/** Faces at this index and after belong to the DUAL — the compound view colours on it. */
		dualFaceStart: poly.faces.length,
		compound: {
			id: `${poly.id}-compound`,
			schlafli: [0, 0],
			vertexConfig: "",
			name: `${poly.name} and its dual`,
			vertices: [...poly.vertices, ...d.dual.vertices],
			faces: [...poly.faces, ...d.dual.faces.map((f) => f.map((i) => i + shift))],
		},
	};
}
