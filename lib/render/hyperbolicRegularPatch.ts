// A regular {p,q} tiling patch in Poincaré coordinates, grown analytically by edge-reflection. Used by the
// developed-tiling group extraction (lib/render/hyperbolicGroup.ts) to replace an under-developed regular
// baked patch with a clean, arbitrarily large symmetric one.

import { type Complex, mirrorParams, tileHue } from "@/lib/render/hyperbolic";

/** Hyperbolic centroid of Poincaré points via the Klein average (affine in Klein), mapped back to Poincaré. */
function hypCentroid(pts: Complex[]): Complex {
	let kx = 0, ky = 0;
	for (const z of pts) {
		const s = 2 / (1 + z.x * z.x + z.y * z.y);
		kx += s * z.x; ky += s * z.y;
	}
	kx /= pts.length; ky /= pts.length;
	const d = 1 + Math.sqrt(Math.max(1 - (kx * kx + ky * ky), 0));
	return { x: kx / d, y: ky / d };
}

export interface HypTile { verts: Complex[]; centroid: Complex; hue: number; sides: number }

/** Reflect a disk point across the geodesic through disk points `a`,`b` (circle ⟂ the unit circle, or a
 *  diameter when a,b,O are collinear). Used to grow the tiling patch tile-by-tile across shared edges. */
function reflectAcrossGeodesic(z: Complex, a: Complex, b: Complex): Complex {
	// Centre κ of the orthogonal circle solves κ·a = (1+|a|²)/2 and κ·b = (1+|b|²)/2.
	const ka = 0.5 * (1 + a.x * a.x + a.y * a.y);
	const kb = 0.5 * (1 + b.x * b.x + b.y * b.y);
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-12) {
		// Diameter through the origin at angle atan2: reflect across that line.
		const ang = Math.atan2(b.y - a.y, b.x - a.x);
		const c = Math.cos(2 * ang), s = Math.sin(2 * ang);
		return { x: c * z.x + s * z.y, y: s * z.x - c * z.y };
	}
	const cx = (ka * b.y - kb * a.y) / det;
	const cy = (kb * a.x - ka * b.x) / det;
	const r2 = cx * cx + cy * cy - 1;
	const dx = z.x - cx, dy = z.y - cy;
	const dd = dx * dx + dy * dy || 1e-18;
	const k = r2 / dd;
	return { x: cx + k * dx, y: cy + k * dy };
}

/** A regular {p,q} tiling patch, `layers` edge-reflections deep from the central p-gon (BFS, deduped by
 *  tile centroid). Every tile is a p-gon of Poincaré vertices. */
export function buildRegularPatch(p: number, q: number, layers: number): HypTile[] {
	const { rC } = mirrorParams(p, q);
	const central: Complex[] = [];
	for (let k = 0; k < p; k++) {
		const ang = Math.PI / p + (2 * Math.PI * k) / p;
		central.push({ x: rC * Math.cos(ang), y: rC * Math.sin(ang) });
	}
	const hue = tileHue(p);
	const keyOf = (c: Complex) => `${Math.round(c.x * 1e4)},${Math.round(c.y * 1e4)}`;
	const mk = (verts: Complex[]): HypTile => {
		const centroid = hypCentroid(verts);
		return { verts, centroid, hue, sides: p };
	};
	const out: HypTile[] = [];
	const seen = new Set<string>();
	let frontier: HypTile[] = [mk(central)];
	seen.add(keyOf(frontier[0].centroid));
	for (let layer = 0; layer <= layers; layer++) {
		out.push(...frontier);
		if (layer === layers) break;
		const next: HypTile[] = [];
		for (const tile of frontier) {
			const n = tile.verts.length;
			for (let i = 0; i < n; i++) {
				const a = tile.verts[i], b = tile.verts[(i + 1) % n];
				const reflected = tile.verts.map((v) => reflectAcrossGeodesic(v, a, b));
				const t = mk(reflected);
				if (Math.hypot(t.centroid.x, t.centroid.y) >= 0.9999) continue; // ran off the disk
				const key = keyOf(t.centroid);
				if (seen.has(key)) continue;
				seen.add(key);
				next.push(t);
			}
		}
		frontier = next;
	}
	return out;
}
