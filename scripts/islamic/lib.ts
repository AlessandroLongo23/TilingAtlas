/*
 * scripts/islamic/lib.ts — geometry + assembler + validator for the curated Islamic tessellations.
 *
 * The atlas's Islamic category hand-encodes historical underlying tessellations (Bonner's systems) as
 * explicit-vertex translational cells. This module is the authoring toolkit: build prototiles by walking
 * unit edges, place rotated/translated copies into a fundamental domain, and VALIDATE that the copies
 * actually tile the plane under the given lattice. Nothing ships that fails validation — the validator is
 * the ship gate, standing in for the area certificate the engine's develop stage would otherwise provide.
 */

export type Pt = [number, number];

const DEG = Math.PI / 180;

// ── prototiles ────────────────────────────────────────────────────────────────────────────────────────
// Walk a closed polygon of unit-length edges, turning by each exterior angle in turn. Exterior angle =
// 180 − interior; a reflex interior (e.g. the bowtie's 216°) is a negative exterior turn. The exterior
// angles must sum to 360 for a simple closed polygon; the caller supplies them in order.
export function polygonFromTurns(exteriorDeg: number[], edge = 1, start: Pt = [0, 0], headingDeg = 0): Pt[] {
	const pts: Pt[] = [];
	let [x, y] = start;
	let heading = headingDeg * DEG;
	pts.push([x, y]);
	for (let i = 0; i < exteriorDeg.length - 1; i++) {
		x += edge * Math.cos(heading);
		y += edge * Math.sin(heading);
		pts.push([x, y]);
		heading += exteriorDeg[i] * DEG;
	}
	return pts;
}

export function regular(n: number, edge = 1): Pt[] {
	return polygonFromTurns(Array(n).fill(360 / n), edge);
}

// The five girih prototiles, unit edge, all angles multiples of 36°. Interior-angle words from
// docs/ISLAMIC_TILINGS.md; exterior = 180 − interior.
export const girih = {
	decagon: () => regular(10),
	pentagon: () => regular(5),
	// rhombus (torange): interior 72,108,72,108
	rhombus: () => polygonFromTurns([108, 72, 108, 72]),
	// elongated hexagon / bobbin (shesh band): interior 72,144,144,72,144,144
	bobbin: () => polygonFromTurns([108, 36, 36, 108, 36, 36]),
	// bowtie (sormeh dan): interior 72,72,216,72,72,216  →  the 216° reflex gives a −36 exterior turn
	bowtie: () => polygonFromTurns([108, 108, -36, 108, 108, -36]),
};

// ── affine helpers ──────────────────────────────────────────────────────────────────────────────────────
export function rotate(pts: Pt[], deg: number, about: Pt = [0, 0]): Pt[] {
	const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
	return pts.map(([x, y]) => {
		const dx = x - about[0], dy = y - about[1];
		return [about[0] + dx * c - dy * s, about[1] + dx * s + dy * c] as Pt;
	});
}
export function translate(pts: Pt[], dx: number, dy: number): Pt[] {
	return pts.map(([x, y]) => [x + dx, y + dy] as Pt);
}
export function centroid(pts: Pt[]): Pt {
	let x = 0, y = 0;
	for (const [px, py] of pts) { x += px; y += py; }
	return [x / pts.length, y / pts.length];
}
// Recenter a prototile on its centroid, so placements specify the tile CENTRE (convenient for lattices).
export function center(pts: Pt[]): Pt[] {
	const [cx, cy] = centroid(pts);
	return translate(pts, -cx, -cy);
}
export function signedArea(pts: Pt[]): number {
	let a = 0;
	for (let i = 0; i < pts.length; i++) {
		const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
		a += x1 * y2 - x2 * y1;
	}
	return a / 2;
}
export function area(pts: Pt[]): number {
	return Math.abs(signedArea(pts));
}
export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
	const [px, py] = pt;
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i], [xj, yj] = poly[j];
		const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

// ── assembly ────────────────────────────────────────────────────────────────────────────────────────────
export interface Placement {
	tile: Pt[]; // a prototile (unit edge)
	rot?: number; // degrees, applied first (about origin)
	at?: Pt; // translation, applied after rotation
	n?: number; // side count to record (defaults to vertex count)
}
export type Basis = [Pt, Pt];

// Log-scale side-count → hue, matching lib/utils/renderTiling.ts polygonHue so the Islamic tiles read on
// the same colour ramp as the rest of the atlas. Set explicitly so both renderers agree.
export function polygonHue(n: number): number {
	return ((Math.log(n) - Math.log(3)) / (Math.log(30) - Math.log(3))) * 360;
}

export interface CellPoly { vertices: Pt[]; n: number; hue: number }
export interface RenderCell { cellPolygons: CellPoly[]; basis: number[][] }

export function place(p: Placement): CellPoly {
	let v = p.tile;
	if (p.rot) v = rotate(v, p.rot);
	if (p.at) v = translate(v, p.at[0], p.at[1]);
	const n = p.n ?? v.length;
	return { vertices: v.map(([x, y]) => [round(x), round(y)] as Pt), n, hue: polygonHue(n) };
}

export function assemble(placements: Placement[], basis: Basis): RenderCell {
	return { cellPolygons: placements.map(place), basis: [basis[0], basis[1]] };
}

// A parallelohexagon (opposite edges parallel + equal) tiles the plane by translation alone: one tile per
// cell, the lattice gluing each pair of opposite edges. Given a hexagon P0..P5 built by polygonFromTurns
// whose exterior-angle word has period 3 (so opposite edges are antiparallel), the generators are
// T1 = P0 − P4 and T2 = P1 − P5. Returns the single-tile render cell. Used for the girih bobbin and the
// sevenfold / fourfold-B representative tiles. Caller passes the hexagon and its recorded side count.
export function parallelohexagonCell(hex: Pt[], n = 6): RenderCell {
	if (hex.length !== 6) throw new Error("parallelohexagonCell expects 6 vertices");
	const T1: Pt = [hex[0][0] - hex[4][0], hex[0][1] - hex[4][1]];
	const T2: Pt = [hex[1][0] - hex[5][0], hex[1][1] - hex[5][1]];
	return assemble([{ tile: hex, n }], [T1, T2]);
}

// A rhombus (or any parallelogram) P0..P3 tiles by its two edge vectors. One tile per cell.
export function parallelogramCell(quad: Pt[], n = 4): RenderCell {
	if (quad.length !== 4) throw new Error("parallelogramCell expects 4 vertices");
	const T1: Pt = [quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]];
	const T2: Pt = [quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]];
	return assemble([{ tile: quad, n }], [T1, T2]);
}

function round(x: number): number {
	return Math.round(x * 1e9) / 1e9;
}
function det(b: Basis): number {
	return b[0][0] * b[1][1] - b[0][1] * b[1][0];
}

// ── validation (the ship gate) ──────────────────────────────────────────────────────────────────────────
export interface ValidationResult {
	ok: boolean;
	areaSum: number;
	det: number;
	areaError: number;
	coverageChecked: number;
	coverageBad: number; // sample points NOT covered exactly once
	vertexConfigs: string[]; // distinct vertex figures (sorted polygon-size multisets) in the cell
	messages: string[];
}

// A translational tiling is valid iff (a) the tiles' total area equals |det Λ| (no net gap/overlap) and
// (b) every point of the fundamental parallelogram is covered by exactly one tile, counting the tile's
// copies over the 3×3 neighbourhood of lattice vectors (to catch tiles that straddle the cell boundary).
// (a) alone can be fooled by a compensating gap+overlap; (b) alone can miss a systematic double-count that
// nets to the right area — together they are a strong check for hand-authored cells.
export function validateTiling(cell: RenderCell, samples = 4000, eps = 1e-6): ValidationResult {
	const basis: Basis = [
		[cell.basis[0][0], cell.basis[0][1]],
		[cell.basis[1][0], cell.basis[1][1]],
	];
	const D = Math.abs(det(basis));
	const polys = cell.cellPolygons.map((p) => p.vertices);
	const areaSum = polys.reduce((s, p) => s + area(p), 0);
	const areaError = Math.abs(areaSum - D);
	const messages: string[] = [];
	if (areaError > 1e-4) messages.push(`area mismatch: Σtile=${areaSum.toFixed(6)} vs |detΛ|=${D.toFixed(6)} (Δ=${areaError.toExponential(2)})`);

	// stratified sampling over the unit parallelogram [0,1)² mapped by the basis. A fixed irrational jitter
	// keeps sample points off the tile edges (points exactly on an edge read as 0 under a strict ray-cast
	// and would show as false gaps — see the 4.8.8 case). The lattice neighbourhood radius R is adaptive:
	// a tile can sit several cells away from the fundamental parallelogram (e.g. a single parallelohexagon
	// whose cell lies in −y while the tile lies in +y), so R must reach every copy that can cover the cell.
	const [b0, b1] = basis;
	const side = Math.max(1, Math.floor(Math.sqrt(samples)));
	let maxExtent = 0;
	for (const poly of polys) for (const [x, y] of poly) maxExtent = Math.max(maxExtent, Math.hypot(x, y));
	const minVec = Math.min(Math.hypot(b0[0], b0[1]), Math.hypot(b1[0], b1[1])) || 1;
	const R = Math.min(6, Math.ceil(maxExtent / minVec) + 2);
	const L: Pt[] = [];
	for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) L.push([i * b0[0] + j * b1[0], i * b0[1] + j * b1[1]]);
	const jx = 0.123456789, jy = 0.077215665; // fixed irrational offsets within one sub-cell
	let coverageChecked = 0, coverageBad = 0;
	for (let a = 0; a < side; a++) {
		for (let b = 0; b < side; b++) {
			const u = (a + jx) / side, w = (b + jy) / side;
			const px = u * b0[0] + w * b1[0], py = u * b0[1] + w * b1[1];
			let cover = 0;
			for (const poly of polys) {
				for (const [lx, ly] of L) {
					if (pointInPolygon([px - lx, py - ly], poly)) { cover++; break; }
				}
			}
			coverageChecked++;
			if (cover !== 1) coverageBad++;
		}
	}
	if (coverageBad > 0) messages.push(`coverage: ${coverageBad}/${coverageChecked} sample points not covered exactly once`);

	const ok = areaError <= 1e-4 && coverageBad === 0;
	return { ok, areaSum, det: D, areaError, coverageChecked, coverageBad, vertexConfigs: vertexConfigsOf(cell, eps), messages };
}

// Distinct vertex figures in the fundamental domain: cluster all tile-corner points (mod the lattice) that
// coincide, and for each cluster where ≥3 corners meet, record the sorted multiset of the incident tiles'
// side counts. Descriptive only (a lower bound on k for curated tilings); logged as a sanity cross-check.
function vertexConfigsOf(cell: RenderCell, eps = 1e-6): string[] {
	const basis: Basis = [
		[cell.basis[0][0], cell.basis[0][1]],
		[cell.basis[1][0], cell.basis[1][1]],
	];
	const [b0, b1] = basis;
	const D = det(basis);
	// fractional lattice coordinates of a point, wrapped into [0,1)
	const frac = (p: Pt): Pt => {
		const u = (p[0] * b1[1] - p[1] * b1[0]) / D;
		const w = (p[1] * b0[0] - p[0] * b0[1]) / D;
		return [u - Math.floor(u + eps), w - Math.floor(w + eps)];
	};
	const buckets = new Map<string, number[]>(); // key → incident side counts
	for (const poly of cell.cellPolygons) {
		for (const v of poly.vertices) {
			const [u, w] = frac(v);
			const key = `${Math.round(u / eps)}:${Math.round(w / eps)}`;
			(buckets.get(key) ?? buckets.set(key, []).get(key)!).push(poly.n);
		}
	}
	const configs = new Set<string>();
	for (const sides of buckets.values()) {
		if (sides.length >= 3) configs.add(sides.slice().sort((a, b) => a - b).join("."));
	}
	return [...configs].sort();
}
