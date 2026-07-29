// The periodic-cell IR: ONE description of "a lattice-periodic drawing" that every Euclidean decoration
// emits and the inversive shader consumes. Before this existed the conformal lens knew exactly one data
// shape — a partition into ≤128 convex tiles coloured by polygon size — so colorings, edge patterns,
// hollow tilings and the Islamic construction had no representation and were force-cleared off the view
// (app/(app)/play/_play-client.tsx), not ported. A decoration now becomes lens-capable by writing
// an adapter to this type; nothing in the renderer changes.
//
// A cell is a lattice (v1, v2) plus a z-ordered list of primitives. A primitive is one ring or polyline
// carrying an optional fill and an optional stroke, which is enough for all five classes:
//
//   tilings     one ring per tile, fill by `hue` (so the sidebar's hue ring still rotates it live),
//               stroke = the shared tile-edge colour
//   colorings   one ring per grid cell, fill by explicit palette RGB
//   edges       one ring per grid cell filled by its face component, plus stroke-only polylines for the
//               drawn edges and the fainter scaffold
//   hollow      self-intersecting {n/d} rings with `nonzero` winding and alpha < 1, so overlaps
//               accumulate the way the 2D canvas's nonzero fill does
//   islamic     the Hankin field's cells as rings, straps as strokes
//
// PACKING. Four RGBA32F data textures (texelFetch, no filtering) and, in place of the old 3×3 loop over
// lattice copies, a uniform grid index built in LATTICE coordinates over the unit cell [0,1)². Every
// primitive is registered into each bucket its bbox overlaps, under each integer lattice shift that
// brings it into the unit cell — so the shader reduces a pixel once, reads one bucket, and tests only
// what is actually near it. That both removes the 9× copy factor the old shader paid on every pixel and
// lifts the 128-primitive ceiling, which no coloring or edge-pattern cell would have fit under.

/** One ring (implicitly closed) or polyline, with an optional fill and an optional stroke. */
export interface PeriodicPrim {
	/** Flat world coordinates, [x0, y0, x1, y1, …]. */
	verts: number[];
	/** Open polyline: no fill, and the last→first segment is not drawn. Default false (a closed ring). */
	open?: boolean;
	/**
	 * Fill hue in degrees. When ≥ 0 the shader colours the prim `hsb((hue + uHueOffset)/360, 0.4, 1)`,
	 * which is what keeps the sidebar's hue ring live for the tilings class without a geometry rebuild.
	 * Omit (or −1) to fill with `fillRgb` instead.
	 */
	hue?: number;
	/** Literal fill colour, 0..1 per channel. Ignored when `hue` ≥ 0. */
	fillRgb?: [number, number, number];
	/** 0 (the default when neither `hue` nor `fillRgb` is set) means "no fill" — a stroke-only prim. */
	fillAlpha?: number;
	/** Fill by nonzero winding, not even-odd. Only the hollow class needs it. */
	nonzero?: boolean;
	/** Stroke colour, 0..1 per channel. */
	strokeRgb?: [number, number, number];
	/** 0 (the default when `strokeRgb` is absent) means "no stroke". */
	strokeAlpha?: number;
	/**
	 * Stroke half-width as a MULTIPLE of the global width (`uStrokePx · uFeature`), so the sidebar's
	 * "Line stroke" slider keeps scaling every class's strokes without rebuilding geometry. Default 1.
	 */
	strokeScale?: number;
	/** Paint order, ascending. Ties break on array order. Default 0. */
	z?: number;
}

export interface PeriodicCell {
	v1: [number, number];
	v2: [number, number];
	prims: PeriodicPrim[];
	/** Median tile-edge length in world units — the resolution scale the centre fade tracks. */
	feature: number;
}

export interface PackedCell {
	verts: Float32Array; // RGBA32F, [x, y, 0, 0] per texel
	vertsW: number;
	vertsH: number;
	meta: Float32Array; // RGBA32F, PRIM_TEXELS texels per prim
	metaW: number;
	metaH: number;
	/** Bucket headers, G×G texels of [start, count, 0, 0] into `list`. */
	head: Float32Array;
	grid: number; // G
	/** Flat bucket entries, [primIndex, di, dj, 0] per texel, z-sorted within each bucket. */
	list: Float32Array;
	listW: number;
	listH: number;
	primCount: number;
	maxBucket: number; // longest bucket, for the shader's loop bound / diagnostics
	minv: [number, number, number, number]; // world → lattice (a, b), row-major
	v1: [number, number];
	v2: [number, number];
	feature: number;
	/** Area-weighted average fill (the unresolvable centre blends to this). */
	avg: [number, number, number];
	/** Per fill prim [hue, r, g, b, alpha, area] — lets the canvas recompute `avg` under a hue offset
	 *  (rotate hues THEN average RGB; rotating an averaged RGB would be wrong). */
	avgParts: Float32Array;
}

/** Texels per primitive in the meta texture. See `packPeriodicCell` for the layout. */
export const PRIM_TEXELS = 5;
const VERTS_TEX_W = 1024;
const META_TEX_W = 1024;
const LIST_TEX_W = 1024;
/**
 * Widest bucket the shader will walk, and the GLSL loop bound.
 *
 * For most classes a bucket holds a handful of primitives, because their tiles are small next to the
 * fundamental domain. The hollow class is the opposite: its faces OVERLAP by construction and each one
 * spans several lattice cells, so a single point is genuinely covered by dozens of face copies and the
 * per-bucket count stops depending on the grid resolution at all — it converges to the sum of the
 * primitives' lattice-space bbox areas. Measured across public/hollow the worst shelf entry wants 420
 * (hollow-12-5_12-5_3-2), so this is 512 with headroom, not a number picked by feel. Going over
 * it drops geometry, which is why `packPeriodicCell` warns instead of truncating quietly.
 */
export const MAX_BUCKET_ENTRIES = 512;

/** Matches the shader's hsb2rgb(h, s, v). Periodic in h with period 1, so an offset needs no wrap. */
export function hsb2rgb(h: number, s: number, v: number): [number, number, number] {
	const f = (n: number) => {
		const k = Math.min(Math.max(Math.abs(((h * 6 + n) % 6) - 3) - 1, 0), 1);
		return v * (1 - s + s * k);
	};
	return [f(0), f(4), f(2)];
}

/**
 * Bucket margin as a fraction of `feature`. A prim's stroke reaches `strokeScale · uStrokePx · uFeature`
 * beyond its outline, and uStrokePx = lineWidth · 0.028 with the slider topping out well under 12, so
 * 0.34·feature·strokeScale covers the widest stroke the UI can ask for. Buckets are cheap; being
 * generous here costs a few duplicate entries and buys immunity to a slider range change.
 */
const STROKE_MARGIN_FRAC = 0.34;

export function packPeriodicCell(cell: PeriodicCell | null): PackedCell | null {
	if (!cell || cell.prims.length === 0) return null;
	const [v1x, v1y] = cell.v1;
	const [v2x, v2y] = cell.v2;
	const det = v1x * v2y - v2x * v1y;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;

	// world → lattice (a, b)
	const m00 = v2y / det, m01 = -v2x / det, m10 = -v1y / det, m11 = v1x / det;

	const prims = cell.prims;
	const primCount = prims.length;
	const totalVerts = prims.reduce((s, p) => s + (p.verts.length >> 1), 0);
	if (totalVerts === 0) return null;

	const vertsW = Math.min(VERTS_TEX_W, Math.max(1, totalVerts));
	const vertsH = Math.max(1, Math.ceil(totalVerts / vertsW));
	const verts = new Float32Array(vertsW * vertsH * 4);

	const metaTexels = primCount * PRIM_TEXELS;
	const metaW = Math.min(META_TEX_W, Math.max(1, metaTexels));
	const metaH = Math.max(1, Math.ceil(metaTexels / metaW));
	const meta = new Float32Array(metaW * metaH * 4);

	// Per-prim lattice bbox, kept for the index pass below.
	const laBox = new Float64Array(primCount * 4);
	const avgParts = new Float32Array(primCount * 6);

	let vi = 0;
	let avgR = 0, avgG = 0, avgB = 0, avgW = 0;

	for (let p = 0; p < primCount; p++) {
		const prim = prims[p];
		const n = prim.verts.length >> 1;
		const start = vi;

		// A decoration may anchor its geometry anywhere in the plane, many lattice cells from the origin.
		// Shift each prim by a whole lattice vector (a valid periodic copy) so its centroid lands in the
		// fundamental parallelogram; the index below then only has to consider shifts near zero.
		let cx = 0, cy = 0;
		for (let i = 0; i < n; i++) { cx += prim.verts[2 * i]; cy += prim.verts[2 * i + 1]; }
		cx /= n; cy /= n;
		const fa = Math.floor(m00 * cx + m01 * cy);
		const fb = Math.floor(m10 * cx + m11 * cy);
		const shx = fa * v1x + fb * v2x;
		const shy = fa * v1y + fb * v2y;

		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		let area2 = 0;
		for (let i = 0; i < n; i++) {
			const x = prim.verts[2 * i] - shx;
			const y = prim.verts[2 * i + 1] - shy;
			const o = vi * 4;
			verts[o] = x;
			verts[o + 1] = y;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
			const jx = prim.verts[2 * ((i + 1) % n)] - shx;
			const jy = prim.verts[2 * ((i + 1) % n) + 1] - shy;
			area2 += x * jy - jx * y;
			vi++;
		}
		const area = Math.abs(area2) * 0.5;

		const hue = prim.hue ?? -1;
		const hasFill = !prim.open && (hue >= 0 || !!prim.fillRgb);
		const fillAlpha = hasFill ? (prim.fillAlpha ?? 1) : 0;
		const strokeAlpha = prim.strokeRgb ? (prim.strokeAlpha ?? 1) : 0;
		const strokeScale = prim.strokeScale ?? 1;
		const fillRgb = prim.fillRgb ?? [0, 0, 0];
		const strokeRgb = prim.strokeRgb ?? [0, 0, 0];

		// flags: bit0 open polyline, bit1 nonzero winding, bit2 hue-driven fill
		const flags = (prim.open ? 1 : 0) | (prim.nonzero ? 2 : 0) | (hue >= 0 ? 4 : 0);

		const m = p * PRIM_TEXELS * 4;
		meta[m] = start;
		meta[m + 1] = n;
		meta[m + 2] = flags;
		meta[m + 3] = hue;
		meta[m + 4] = fillRgb[0];
		meta[m + 5] = fillRgb[1];
		meta[m + 6] = fillRgb[2];
		meta[m + 7] = fillAlpha;
		meta[m + 8] = strokeRgb[0];
		meta[m + 9] = strokeRgb[1];
		meta[m + 10] = strokeRgb[2];
		meta[m + 11] = strokeAlpha;
		meta[m + 12] = minX;
		meta[m + 13] = minY;
		meta[m + 14] = maxX;
		meta[m + 15] = maxY;
		meta[m + 16] = strokeScale;
		meta[m + 17] = prim.z ?? 0;

		// Average fill, area-weighted, for the centre blend.
		const rgb = hue >= 0 ? hsb2rgb(hue / 360, 0.4, 1) : (fillRgb as [number, number, number]);
		const w = area * fillAlpha;
		avgR += rgb[0] * w;
		avgG += rgb[1] * w;
		avgB += rgb[2] * w;
		avgW += w;
		avgParts[p * 6] = hue;
		avgParts[p * 6 + 1] = fillRgb[0];
		avgParts[p * 6 + 2] = fillRgb[1];
		avgParts[p * 6 + 3] = fillRgb[2];
		avgParts[p * 6 + 4] = fillAlpha;
		avgParts[p * 6 + 5] = area;

		// Lattice bbox of the world bbox, widened by the widest stroke this prim can grow. The corner map
		// is affine, so the lattice bbox is the box over the four mapped corners.
		const mg = strokeAlpha > 0 ? STROKE_MARGIN_FRAC * cell.feature * Math.max(1, strokeScale) : 0;
		const x0 = minX - mg, x1 = maxX + mg, y0 = minY - mg, y1 = maxY + mg;
		let la0 = Infinity, la1 = -Infinity, lb0 = Infinity, lb1 = -Infinity;
		for (const [cxx, cyy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
			const a = m00 * cxx + m01 * cyy;
			const b = m10 * cxx + m11 * cyy;
			if (a < la0) la0 = a;
			if (a > la1) la1 = a;
			if (b < lb0) lb0 = b;
			if (b > lb1) lb1 = b;
		}
		laBox[p * 4] = la0;
		laBox[p * 4 + 1] = la1;
		laBox[p * 4 + 2] = lb0;
		laBox[p * 4 + 3] = lb1;
	}

	// The uniform grid over [0,1)². Aim for a handful of prims per bucket; a prim spanning many buckets
	// (a strip face, a long scaffold line) is registered in each, which is why G is capped and not
	// scaled straight off primCount.
	const grid = Math.max(1, Math.min(48, Math.round(Math.sqrt(primCount))));
	const buckets: { p: number; di: number; dj: number; z: number }[][] = Array.from(
		{ length: grid * grid },
		() => [],
	);

	for (let p = 0; p < primCount; p++) {
		const la0 = laBox[p * 4], la1 = laBox[p * 4 + 1];
		const lb0 = laBox[p * 4 + 2], lb1 = laBox[p * 4 + 3];
		const z = prims[p].z ?? 0;
		// The shader tests `q = w − (di·v1 + dj·v2)` against the prim, which is the same as testing w
		// against the prim TRANSLATED BY +(di, dj). So the copies worth filing are those whose shifted box
		// [la0+di, la1+di] meets [0,1): di ≥ −la1 and di < 1−la0. Getting this sign backwards files a
		// boundary-straddling tile under the mirror-image shift, and the tiling comes out with holes.
		const di0 = Math.ceil(-la1 - 1e-9);
		const di1 = Math.ceil(1 - la0 - 1e-9) - 1;
		const dj0 = Math.ceil(-lb1 - 1e-9);
		const dj1 = Math.ceil(1 - lb0 - 1e-9) - 1;
		for (let dj = dj0; dj <= dj1; dj++) {
			for (let di = di0; di <= di1; di++) {
				const a0 = Math.max(0, la0 + di), a1 = Math.min(1 - 1e-9, la1 + di);
				const b0 = Math.max(0, lb0 + dj), b1 = Math.min(1 - 1e-9, lb1 + dj);
				if (a0 > a1 || b0 > b1) continue;
				const bi0 = Math.floor(a0 * grid), bi1 = Math.floor(a1 * grid);
				const bj0 = Math.floor(b0 * grid), bj1 = Math.floor(b1 * grid);
				for (let bj = bj0; bj <= bj1; bj++) {
					for (let bi = bi0; bi <= bi1; bi++) {
						buckets[bj * grid + bi].push({ p, di, dj, z });
					}
				}
			}
		}
	}

	let maxBucket = 0;
	let total = 0;
	let dropped = 0;
	let demand = 0;
	for (const b of buckets) {
		// Painter's order within the bucket: the shader composites in the order it walks them.
		b.sort((x, y) => x.z - y.z || x.p - y.p);
		if (b.length > demand) demand = b.length;
		if (b.length > MAX_BUCKET_ENTRIES) {
			dropped += b.length - MAX_BUCKET_ENTRIES;
			b.length = MAX_BUCKET_ENTRIES;
		}
		if (b.length > maxBucket) maxBucket = b.length;
		total += b.length;
	}
	// Truncation loses primitives, and the failure mode is a picture that looks plausible, not an
	// error — so say so. Raise MAX_BUCKET_ENTRIES (and the shader's matching loop bound) if this fires.
	if (dropped > 0) {
		console.warn(
			`periodicCell: bucket cap ${MAX_BUCKET_ENTRIES} exceeded (widest bucket wanted ${demand}); ` +
			`dropped ${dropped} primitive copies — the render is incomplete.`,
		);
	}

	const head = new Float32Array(grid * grid * 4);
	const listW = Math.min(LIST_TEX_W, Math.max(1, total));
	const listH = Math.max(1, Math.ceil(Math.max(1, total) / listW));
	const list = new Float32Array(listW * listH * 4);
	let li = 0;
	for (let i = 0; i < buckets.length; i++) {
		head[i * 4] = li;
		head[i * 4 + 1] = buckets[i].length;
		for (const e of buckets[i]) {
			const o = li * 4;
			list[o] = e.p;
			list[o + 1] = e.di;
			list[o + 2] = e.dj;
			li++;
		}
	}

	return {
		verts, vertsW, vertsH,
		meta, metaW, metaH,
		head, grid, list, listW, listH,
		primCount, maxBucket,
		minv: [m00, m01, m10, m11],
		v1: [v1x, v1y],
		v2: [v2x, v2y],
		feature: cell.feature,
		avg: avgW > 0 ? [avgR / avgW, avgG / avgW, avgB / avgW] : [0.5, 0.5, 0.5],
		avgParts,
	};
}

/** Area-weighted average fill under a global hue offset — the offset counterpart of `PackedCell.avg`.
 *  Only hue-driven prims move with the ring; literal-RGB fills (colorings, hollow, …) stay put. */
export function averageCellFill(avgParts: Float32Array, hueOffsetDeg: number): [number, number, number] {
	let r = 0, g = 0, b = 0, w = 0;
	for (let i = 0; i < avgParts.length; i += 6) {
		const hue = avgParts[i];
		const alpha = avgParts[i + 4];
		const area = avgParts[i + 5];
		const weight = area * alpha;
		if (weight <= 0) continue;
		const rgb = hue >= 0
			? hsb2rgb((hue + hueOffsetDeg) / 360, 0.4, 1)
			: [avgParts[i + 1], avgParts[i + 2], avgParts[i + 3]];
		r += rgb[0] * weight;
		g += rgb[1] * weight;
		b += rgb[2] * weight;
		w += weight;
	}
	return w > 0 ? [r / w, g / w, b / w] : [0.5, 0.5, 0.5];
}
