// Fills the spherical Islamic pattern's cells — the regions the star construction lines cut the surface
// into — as coloured triangles on the sphere, sitting just under the line ribbons/tubes. The cells are
// traced with the SAME flat planar-arrangement code the Euclidean renderer uses (extractFaces): per
// Platonic face we gnomonically project the construction rays + the face boundary into the face's tangent
// plane, run the 2D arrangement there, then project each cell vertex back onto the sphere. Gnomonic
// projection maps great circles to straight lines, so the 2D cells are exactly the spherical cells and
// their edges land on the very arcs the line renderer draws.
//
// Colouring is the flat A/B/C scheme (colorFacesAbc), the same one the Euclidean "plain" Islamic fill uses:
// A = the star-body cells (the face's tile hue), B = the side fields, C = the edge-centre diamonds that
// open once the edge offset splits the contact point off the midpoint. A single centroid marker per face
// anchors A (a regular polygon's tips collapse onto its centroid, so the centroid is its only marker); the
// gnomonic origin (0,0) IS the face centre, so the marker sits there. The A/B/C parity is continuous across
// a shared edge because the two faces are mirror images about it, so a background field straddling the edge
// lands at the same ring-parity from either centre. Only A tracks the hue ring; B/C are fixed fields.
//
// A cell is not drawn as a few flat triangles (that reads as a low-poly facet — a big cell would cut across
// the sphere as a flat chord). Each cell is fan-triangulated from its centroid and every fan triangle is
// barycentrically SUBDIVIDED, with each sub-vertex projected onto the sphere, so the fill hugs the surface
// and the silhouette is round. The subdivision level is uniform per solid, so shared cell edges inside a
// face are sampled identically (no cracks). Client-only (imports three).

import * as THREE from "three";
import { Vector } from "@/classes/Vector";
import { extractFaces, colorFacesAbc, pointInPolygon, type Marker, type Segment } from "@/lib/utils/islamicArrangement";
import { twoColorFaces } from "@/lib/utils/islamicInterlace";
import { hexToRgb } from "./islamicGL";
import type { Polyhedron } from "./platonicSolids";
import { sphericalIslamicFaceData, type FaceFillData } from "./sphericalIslamic";
import { polygonHue } from "@/lib/utils/renderTiling";

type V3 = [number, number, number];

// Matches the flat renderer's hsb2rgb so a star body is the same colour as the Euclidean tiles (S 0.40,
// B 1.0). Returns display (sRGB) components; converted to linear for the vertex-colour attribute below.
function hsb2rgb(hueDeg: number, s: number, v: number): [number, number, number] {
	const h = (((hueDeg / 360) % 1) + 1) % 1;
	const k = (o: number) => {
		const x = (((h * 6 + o) % 6) + 6) % 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	const m = (kk: number) => v * (1 - s) + v * s * kk;
	return [m(k(0)), m(k(4)), m(k(2))];
}

// Target arc length of a fill triangle edge (radians) — sets how finely each cell is subdivided so the
// surface and silhouette read as smooth. Only angle/offset/count slider drags re-tessellate.
const TARGET_SEG = 0.05;
const MAX_SUBDIV = 24;

// Default fill fields (the store's islamicFillColorB/C and islamicCheckerColorA/B defaults) — used when the
// caller doesn't pass them.
const DEFAULT_COLOR_B = "#e7dcc0";
const DEFAULT_COLOR_C = "#3a4a52";

export interface IslamicFillOptions {
	angleRad: number;
	edgeOffsetFrac?: number;
	intersectionCount?: number;
	radius?: number;
	hueOffset?: number;
	/** "checkerboard" 2-colours every cell with the two checker colours; anything else is the A/B/C plain
	 *  fill (star bodies in the tile hue + two background fields). */
	style?: string;
	fillColorB?: string; // A/B/C side-field colour (CSS hex)
	fillColorC?: string; // A/B/C edge-diamond colour (CSS hex)
	checkerColorA?: string; // checkerboard field A (CSS hex) — the centre-cell parity
	checkerColorB?: string; // checkerboard field B (CSS hex)
}

export interface IslamicFill {
	object: THREE.Group;
	setColor: (hueOffset: number) => void; // recolour in place on a hue-ring change (A only)
	dispose: () => void;
}

// klass: 0 = A (tile hue, rotates with the hue ring), 1 = B (side field), 2 = C (edge diamond). aHue is the
// star-body hue, meaningful only for A. `tris` is the cell's triangulation (2D, face-plane) — subdivided and
// projected in pass 2.
interface Cell {
	tris: Array<[Vector, Vector, Vector]>;
	klass: number;
	aHue: number;
}

// Triangulate one fill cell. The regions the star lines cut are frequently NON-CONVEX — star bodies and side
// fields grow concave arms at extreme contact angles — and a naive fan from the vertex-average centroid folds
// over there: the apex leaves the polygon, so the fan triangles spill outside the cell, overlap the neighbour
// and z-fight into a hatched moiré (the artefact visible at very low / high Islamic angles). Ear-clipping
// (THREE.ShapeUtils) triangulates any simple polygon correctly, and every cell-boundary edge stays a triangle
// edge — so adjacent cells still sample a shared edge identically (no cracks). Falls back to a centroid fan
// only if ear-clipping degenerates (not observed for these cells; kept so a pathological polygon still fills).
export function triangulateFillCell(vs: Vector[]): Array<[Vector, Vector, Vector]> {
	const n = vs.length;
	if (n < 3) return [];
	const idx = THREE.ShapeUtils.triangulateShape(
		vs.map((p) => new THREE.Vector2(p.x, p.y)),
		[],
	);
	if (idx.length > 0) return idx.map(([i, j, k]) => [vs[i], vs[j], vs[k]] as [Vector, Vector, Vector]);
	let cx = 0;
	let cy = 0;
	for (const p of vs) {
		cx += p.x;
		cy += p.y;
	}
	const c = new Vector(cx / n, cy / n);
	const out: Array<[Vector, Vector, Vector]> = [];
	for (let e = 0; e < n; e++) out.push([c, vs[e], vs[(e + 1) % n]]);
	return out;
}

export function buildIslamicFill(poly: Polyhedron | null, opts: IslamicFillOptions): IslamicFill | null {
	if (!poly) return null;

	const radius = opts.radius ?? 1;
	const frac = opts.edgeOffsetFrac ?? 0;
	const nCount = opts.intersectionCount ?? 1;
	// Off-midpoint contact (offset) and pass-through rays (count > 1) put real crossings mid-segment, so the
	// arrangement must inject them as vertices — same rule as the flat renderer.
	const splitCrossings = frac > 0 || nCount > 1;
	const isChecker = opts.style === "checkerboard";

	const faceData = sphericalIslamicFaceData(poly, {
		angleRad: opts.angleRad,
		edgeOffsetFrac: frac,
		intersectionCount: nCount,
	});

	// Uniform subdivision level from the largest cell reach (gnomonic 2D radius r ↦ arc atan(r)).
	let maxArc = 0;
	for (const fd of faceData) {
		for (const [x, y] of fd.boundary) maxArc = Math.max(maxArc, Math.atan(Math.hypot(x, y)));
	}
	const L = Math.min(MAX_SUBDIV, Math.max(6, Math.ceil(maxArc / TARGET_SEG)));

	// Pass 1: trace + A/B/C-classify the cells of every face, triangulate each, count triangles (× L² sub-tris).
	const perFace: { fd: FaceFillData; cells: Cell[] }[] = [];
	let baseTris = 0;
	for (const fd of faceData) {
		const segs: Segment[] = [];
		for (const [ox, oy, ex, ey] of fd.rays) segs.push([new Vector(ox, oy), new Vector(ex, ey)]);
		for (let i = 0; i < fd.boundary.length; i++) {
			const p = fd.boundary[i];
			const q = fd.boundary[(i + 1) % fd.boundary.length];
			segs.push([new Vector(p[0], p[1]), new Vector(q[0], q[1])]);
		}
		const rawFaces = extractFaces(segs, splitCrossings);
		const cells: Cell[] = [];
		const pushCell = (vs: Vector[], klass: number, aHue: number) => {
			if (vs.length < 3) return;
			const tris = triangulateFillCell(vs);
			if (tris.length === 0) return;
			cells.push({ tris, klass, aHue });
			baseTris += tris.length;
		};
		if (isChecker) {
			// Bipartite 2-colouring of every cell. Anchor the parity so the centre cell (the one holding the
			// projection origin) is always colour A — that keeps the checkerboard from flipping across a shared
			// edge, since the centre cell is the same on both faces by their mirror symmetry.
			const colors = twoColorFaces(rawFaces);
			const origin = new Vector(0, 0);
			let centre = 0;
			for (let i = 0; i < rawFaces.length; i++) {
				if (pointInPolygon(rawFaces[i].vertices, origin)) {
					centre = colors[i];
					break;
				}
			}
			for (let i = 0; i < rawFaces.length; i++) {
				const parity = colors[i] ^ centre; // 0 at the centre
				pushCell(rawFaces[i].vertices, parity === 0 ? 1 : 2, 0); // both fixed colours, no hue
			}
		} else {
			// A/B/C plain fill. A regular p-gon's only star marker is the centroid = the projection origin.
			const markers: Marker[] = [{ point: new Vector(0, 0), kind: "centroid", hue: polygonHue(fd.boundary.length) }];
			const { faces: abc, degenerate } = colorFacesAbc(rawFaces, markers);
			for (const { face, klass, hue } of abc) {
				// A → 0 (tile hue); C → 2 unless the split degenerated (folds into B, a clean two-tone); B → 1.
				pushCell(face.vertices, klass === "A" ? 0 : klass === "C" && !degenerate ? 2 : 1, hue);
			}
		}
		perFace.push({ fd, cells });
	}

	// Pass 2: subdivide and project. Pre-sized buffers (exactly baseTris·L² triangles).
	const triCount = baseTris * L * L;
	const pos = new Float32Array(triCount * 9);
	const vClass = new Uint8Array(triCount * 3); // per vertex: 0 A / 1 B / 2 C
	const vAHue = new Float32Array(triCount * 3); // per vertex: star-body hue (A only)
	let vi = 0;
	const writeVert = (p: V3, klass: number, aHue: number) => {
		pos[vi * 3] = p[0];
		pos[vi * 3 + 1] = p[1];
		pos[vi * 3 + 2] = p[2];
		vClass[vi] = klass;
		vAHue[vi] = aHue;
		vi++;
	};

	// Reused subdivision grid (row-major, (L+1) rows).
	const grid: V3[][] = Array.from({ length: L + 1 }, () => [] as V3[]);

	for (const { fd, cells } of perFace) {
		// 2D (face-plane) → sphere: the gnomonic inverse for this face, scaled onto the sphere.
		const to3 = (x: number, y: number): V3 => {
			const dx = fd.C[0] + x * fd.u[0] + y * fd.v[0];
			const dy = fd.C[1] + x * fd.u[1] + y * fd.v[1];
			const dz = fd.C[2] + x * fd.u[2] + y * fd.v[2];
			const len = Math.hypot(dx, dy, dz) || 1;
			return [(dx / len) * radius, (dy / len) * radius, (dz / len) * radius];
		};

		for (const cell of cells) {
			const { tris, klass, aHue } = cell;
			for (const [t0, t1, t2] of tris) {
				// One triangle of the cell's triangulation, barycentrically subdivided at level L (t0 the apex).
				const ax = t0.x;
				const ay = t0.y;
				const ux = t1.x - ax;
				const uy = t1.y - ay;
				const wx = t2.x - ax;
				const wy = t2.y - ay;
				for (let a = 0; a <= L; a++) {
					for (let b = 0; b <= L - a; b++) {
						const s = a / L;
						const t = b / L;
						grid[a][b] = to3(ax + s * ux + t * wx, ay + s * uy + t * wy);
					}
				}
				for (let a = 0; a < L; a++) {
					for (let b = 0; b < L - a; b++) {
						writeVert(grid[a][b], klass, aHue);
						writeVert(grid[a + 1][b], klass, aHue);
						writeVert(grid[a][b + 1], klass, aHue);
						if (a + b < L - 1) {
							writeVert(grid[a + 1][b], klass, aHue);
							writeVert(grid[a + 1][b + 1], klass, aHue);
							writeVert(grid[a][b + 1], klass, aHue);
						}
					}
				}
			}
		}
	}

	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	const colorAttr = new THREE.BufferAttribute(new Float32Array(triCount * 9), 3);
	geom.setAttribute("color", colorAttr);

	// DoubleSide: the cells tile the whole sphere into an opaque shell (near side occludes far). Unlit — flat
	// tile colours.
	const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

	// The two fixed cell colours (class 1 / class 2) — plain: the A/B/C background fields; checkerboard: the
	// two checker fields (class 1 = the centre-cell parity). Neither rotates with the hue ring.
	const fixed1 = isChecker ? (opts.checkerColorA ?? DEFAULT_COLOR_B) : (opts.fillColorB ?? DEFAULT_COLOR_B);
	const fixed2 = isChecker ? (opts.checkerColorB ?? DEFAULT_COLOR_C) : (opts.fillColorC ?? DEFAULT_COLOR_C);
	const bLin = new THREE.Color().setRGB(...hexToRgb(fixed1), THREE.SRGBColorSpace);
	const cLin = new THREE.Color().setRGB(...hexToRgb(fixed2), THREE.SRGBColorSpace);

	const scratch = new THREE.Color();
	const applyColor = (hueOffset: number) => {
		const arr = colorAttr.array as Float32Array;
		for (let i = 0; i < vClass.length; i++) {
			let r: number;
			let g: number;
			let b: number;
			if (vClass[i] === 0) {
				const [sr, sg, sb] = hsb2rgb(vAHue[i] + hueOffset, 0.4, 1.0);
				scratch.setRGB(sr, sg, sb, THREE.SRGBColorSpace); // → linear, matching the wireframe/line colours
				r = scratch.r;
				g = scratch.g;
				b = scratch.b;
			} else if (vClass[i] === 1) {
				r = bLin.r;
				g = bLin.g;
				b = bLin.b;
			} else {
				r = cLin.r;
				g = cLin.g;
				b = cLin.b;
			}
			arr[i * 3] = r;
			arr[i * 3 + 1] = g;
			arr[i * 3 + 2] = b;
		}
		colorAttr.needsUpdate = true;
	};
	applyColor(opts.hueOffset ?? 0);

	const group = new THREE.Group();
	group.add(new THREE.Mesh(geom, material));

	return {
		object: group,
		setColor: applyColor,
		dispose: () => {
			geom.dispose();
			material.dispose();
		},
	};
}
