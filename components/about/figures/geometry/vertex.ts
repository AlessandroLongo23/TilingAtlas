// One rule for the vertex figure in all three geometries: regular polygons with one common edge length,
// that length solved in the geometry so the angles around the vertex add up to exactly 360°.
//
// A regular n-gon splits into 2n right triangles (centre, vertex, edge midpoint) with angle π/n at the
// centre and α/2 at the vertex. In curvature +1, 0 and −1 the right-triangle identities give
//   sin(α/2) = cos(π/n) / C(s/2)        C = cos, 1, cosh
//   C(R) = cot(π/n) · cot(α/2)          R = centre-to-vertex distance (flat: R = s / 2 sin(π/n))
// The flat sum decides the geometry; on the sphere α grows with s, in the hyperbolic plane it shrinks,
// so a bisection on s closes the vertex. Drawings: the flat plane as it is, the sphere in orthographic
// view with the vertex facing the viewer, the hyperbolic plane in the Poincaré disk with the vertex at
// its centre. Edges are sampled where they are straight (gnomonic chart on the sphere, Klein chart in
// the hyperbolic plane) and carried over, so every edge is a true geodesic.

export type Geometry = "sphere" | "plane" | "hyperbolic";
type P2 = { x: number; y: number };
type P3 = [number, number, number];

const SAMPLES = 24;
const flatAngle = (n: number) => Math.PI - (2 * Math.PI) / n;

function angleAt(n: number, s: number, g: Geometry) {
	if (g === "plane") return flatAngle(n);
	const c = g === "sphere" ? Math.cos(s / 2) : Math.cosh(s / 2);
	return 2 * Math.asin(Math.min(1, Math.cos(Math.PI / n) / c));
}

/** The common edge length that closes the vertex, or null if none does (the sphere can run out). */
function solveEdge(ns: number[], g: Geometry): number | null {
	if (g === "plane") return 1;
	const gap = (s: number) => ns.reduce((t, n) => t + angleAt(n, s, g), 0) - 2 * Math.PI;
	let lo = 0,
		hi: number;
	if (g === "sphere") {
		hi = (2 * Math.PI) / Math.max(...ns) - 1e-9; // past this the largest polygon would be flat
		if (gap(hi) < 0) return null;
	} else {
		hi = 1;
		while (gap(hi) > 0) hi *= 2;
	}
	for (let i = 0; i < 80; i++) {
		const mid = (lo + hi) / 2;
		if (gap(mid) > 0 === (g === "hyperbolic")) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** Closed rings of sample points along the edges of a polygon in its chart (straight-edge) coordinates. */
function ring(n: number, r: number): P2[] {
	const out: P2[] = [];
	// Vertex 0 sits at angle π (on the −x side), so a move along +x by the circumradius brings it to the origin.
	const v = (k: number) => ({
		x: r * Math.cos(Math.PI + (2 * Math.PI * k) / n),
		y: r * Math.sin(Math.PI + (2 * Math.PI * k) / n),
	});
	for (let k = 0; k < n; k++) {
		const a = v(k),
			b = v(k + 1);
		for (let i = 0; i < SAMPLES; i++)
			out.push({ x: a.x + ((b.x - a.x) * i) / SAMPLES, y: a.y + ((b.y - a.y) * i) / SAMPLES });
	}
	return out;
}

const rot = (p: P2, t: number): P2 => ({
	x: p.x * Math.cos(t) - p.y * Math.sin(t),
	y: p.x * Math.sin(t) + p.y * Math.cos(t),
});

/** Clip a spherical polygon's boundary to the visible hemisphere z ≥ 0, following the rim where it is cut. */
function clipFront(pts: P3[]): P2[] {
	const out: P2[] = [];
	const rim = (p: P3) => {
		const h = Math.hypot(p[0], p[1]) || 1;
		return Math.atan2(p[1] / h, p[0] / h);
	};
	let exitAt: number | null = null;
	const cross = (a: P3, b: P3): P3 => {
		const t = a[2] / (a[2] - b[2]);
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
	};
	const m = pts.length;
	// Start from a visible point so the walk opens inside.
	const s0 = pts.findIndex((p) => p[2] >= 0);
	if (s0 < 0) return out;
	for (let i = 0; i <= m; i++) {
		const a = pts[(s0 + i) % m],
			b = pts[(s0 + i + 1) % m];
		if (a[2] >= 0) out.push({ x: a[0], y: a[1] });
		if (i === m) break;
		if (a[2] >= 0 && b[2] < 0) exitAt = rim(cross(a, b));
		if (a[2] < 0 && b[2] >= 0 && exitAt != null) {
			let t1 = rim(cross(a, b));
			// The shorter way round the rim from where the boundary left to where it returns.
			while (t1 - exitAt > Math.PI) t1 -= 2 * Math.PI;
			while (exitAt - t1 > Math.PI) t1 += 2 * Math.PI;
			for (let k = 0; k <= 16; k++) {
				const t = exitAt + ((t1 - exitAt) * k) / 16;
				out.push({ x: Math.cos(t), y: Math.sin(t) });
			}
			exitAt = null;
		}
	}
	return out;
}

export interface VertexFigure {
	geometry: Geometry;
	/** Angle sum of the polygons drawn flat, in degrees: what decides the geometry. */
	flatSum: number;
	/** The solved edge length (plane: 1; sphere: an arc of the unit sphere; hyperbolic: curvature −1). */
	edge: number | null;
	/** Each polygon's outline in figure coordinates: the plane as is, the sphere and disk of radius 1. */
	polygons: P2[][];
}

export function vertexFigure(ns: number[]): VertexFigure {
	const flatSum = ns.reduce((t, n) => t + flatAngle(n), 0);
	const geometry: Geometry =
		Math.abs(flatSum - 2 * Math.PI) < 1e-9 ? "plane" : flatSum < 2 * Math.PI ? "sphere" : "hyperbolic";
	const s = ns.length >= 3 ? solveEdge(ns, geometry) : geometry === "plane" ? 1 : null;
	const edge = ns.length >= 3 ? s : null;
	const len = s ?? 1;
	const g: Geometry = s == null ? "plane" : geometry; // nothing closes: show the flat fan
	const polygons: P2[][] = [];
	let from = 0;
	for (const n of ns) {
		const a = angleAt(n, len, g);
		const mid = from + a / 2;
		from += a;
		const cotA = 1 / Math.tan(Math.PI / n),
			cotH = 1 / Math.tan(a / 2);
		if (g === "plane") {
			const R = len / (2 * Math.sin(Math.PI / n));
			polygons.push(ring(n, R).map((p) => rot({ x: p.x + R, y: p.y }, mid)));
		} else if (g === "hyperbolic") {
			const R = Math.acosh(Math.max(1, cotA * cotH));
			// Klein chart: centred polygon with straight edges; lift to the hyperboloid, boost by R along x,
			// turn to the bisector, then down to the Poincaré disk.
			polygons.push(
				ring(n, Math.tanh(R)).map((k) => {
					const w = 1 / Math.sqrt(Math.max(1e-12, 1 - k.x * k.x - k.y * k.y));
					const [x, y, t] = [k.x * w, k.y * w, w];
					const x2 = x * Math.cosh(R) + t * Math.sinh(R),
						t2 = x * Math.sinh(R) + t * Math.cosh(R);
					return rot({ x: x2 / (1 + t2), y: y / (1 + t2) }, mid);
				}),
			);
		} else {
			const R = Math.acos(Math.min(1, cotA * cotH));
			// Gnomonic chart about the polygon's centre at the pole, then a turn about y by R, which brings
			// vertex 0 to the front (0, 0, 1) and the centre out along +x, then about z to the bisector.
			const pts: P3[] = ring(n, Math.tan(R)).map((q) => {
				const w = 1 / Math.hypot(q.x, q.y, 1);
				const [x, y, z] = [q.x * w, q.y * w, w];
				const x2 = x * Math.cos(R) + z * Math.sin(R),
					z2 = -x * Math.sin(R) + z * Math.cos(R);
				const r = rot({ x: x2, y }, mid);
				return [r.x, r.y, z2];
			});
			polygons.push(clipFront(pts));
		}
	}
	return { geometry, flatSum: (flatSum * 180) / Math.PI, edge, polygons };
}
