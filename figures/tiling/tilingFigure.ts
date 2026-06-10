/**
 * Tiling → FigureIR under a coloring strategy, with PHYSICAL window sizing.
 *
 * Galleries need uniform physical panels: the window is fixed in mm and the model-unit side is
 * windowMm/edgeMm. If that wouldn't show `minPeriods` cell diameters (large k=3 cells), edgeMm is
 * shrunk for that tiling — the panel stays exactly windowMm × windowMm, density gives way to
 * completeness-of-period. The resolved edgeMm travels with the IR (BuiltFigure).
 *
 * byOrbit draws near-neutral tiles + a colored marker per tiling vertex (deduped across the
 * adjacent polygons sharing it; orbit ids agree by lattice invariance — checked loudly).
 */
import type { FigureIR, FigureElement, Rect } from '../ir/types';
import { tileStyleRef, type ColorStrategy } from '../style/palette';
import type { CellModel } from './cellModel';
import { replicate } from './patch';

export type TilingFigureOptions = {
	strategy: ColorStrategy;
	/** Physical panel side (the figure is a windowMm × windowMm square). */
	windowMm: number;
	/** Desired mm per unit edge; may be shrunk to fit `minPeriods` cell diameters. */
	edgeMm: number;
	/** Minimum number of cell diameters the window must span (default 2.05). */
	minPeriods?: number;
	/** Vertex-orbit markers (default: strategy === 'byOrbit'). */
	markers?: boolean;
	/**
	 * "Anatomy" mode for single-tiling explanatory figures (NOT galleries): the (0,0) cell stays at
	 * full strength while the rest fades toward white with distance, optionally overlaid with the
	 * basis parallelogram, u/v arrows, and lattice points. Fade is color-mixing, not opacity.
	 */
	anatomy?: {
		/** Radial fade: full strength within `fullR` cell-diameters of the cell centre, ramping down
		 *  to `minStrength`% at the window corner. Defaults: fullR 0.55, minStrength 18. */
		fade?: { fullR?: number; minStrength?: number };
		/** Left→right FILL-only transition (strokes stay full — fill→white IS the wireframe):
		 *  steep logistic centred on the window; higher steepness = narrower band (default 22). */
		transition?: { steepness?: number };
		/** Keep one parallelogram's worth of tiles at 100% regardless of distance (fade mode only;
		 *  default true). */
		highlightCell?: boolean;
		/** Basis parallelogram outline + u/v arrows + corner lattice points + math labels. */
		basis?: boolean;
		/** Lattice points across the window (in transition mode: wireframe half only). */
		latticePoints?: boolean;
		/** Where to aim the parallelogram anchor (model coords). The anchor is ALWAYS snapped to the
		 *  nearest actual tiling vertex, so lattice dots coincide with construction points. */
		anchorTarget?: { x: number; y: number };
	};
};

export type BuiltFigure = { ir: FigureIR; edgeMm: number };

export function tilingFigure(model: CellModel, opts: TilingFigureOptions): BuiltFigure {
	const minPeriods = opts.minPeriods ?? 2.05;
	let edgeMm = opts.edgeMm;
	let side = opts.windowMm / edgeMm;
	if (side < minPeriods * model.cellDiam) {
		side = minPeriods * model.cellDiam;
		edgeMm = opts.windowMm / side;
	}

	const cx = (model.bbox.minX + model.bbox.maxX) / 2;
	const cy = (model.bbox.minY + model.bbox.maxY) / 2;
	const window: Rect = {
		minX: cx - side / 2,
		minY: cy - side / 2,
		maxX: cx + side / 2,
		maxY: cy + side / 2,
	};

	const placed = replicate(model, window);
	const elements: FigureElement[] = [];

	// Anatomy: strengths quantized to steps of 5 (stable .tex diffs).
	const anatomy = opts.anatomy;
	const transition = anatomy?.transition;
	const fullR = (anatomy?.fade?.fullR ?? 0.55) * model.cellDiam;
	const minStrength = anatomy?.fade?.minStrength ?? 18;
	const rMax = Math.hypot(side / 2, side / 2);
	const [bu, bv] = model.basis;

	// Parallelogram anchor: SNAPPED to the nearest actual tiling vertex (so the lattice — the Λ-orbit
	// of that vertex — coincides with construction points). The highlight is one parallelogram's
	// worth of tiles, the pedagogically honest "this region's worth repeats".
	const anchorTarget = anatomy?.anchorTarget ??
		(transition
			? { x: cx + 0.05 * side, y: cy - (bu.y + bv.y) / 2 }
			: { x: cx - (bu.x + bv.x) / 2, y: cy - (bu.y + bv.y) / 2 });
	let anchor = anchorTarget;
	if (anatomy) {
		let best = Infinity;
		for (const p of placed) {
			for (const vt of p.verts) {
				const d = (vt.x - anchorTarget.x) ** 2 + (vt.y - anchorTarget.y) ** 2;
				if (d < best) {
					best = d;
					anchor = vt;
				}
			}
		}
	}
	const bdet = bu.x * bv.y - bu.y * bv.x;
	const inParallelogram = (px: number, py: number): boolean => {
		const dx = px - anchor.x;
		const dy = py - anchor.y;
		const alpha = (dx * bv.y - dy * bv.x) / bdet;
		const beta = (bu.x * dy - bu.y * dx) / bdet;
		return alpha >= 0 && alpha < 1 && beta >= 0 && beta < 1;
	};

	const centroidOf = (p: { verts: { x: number; y: number }[] }): { x: number; y: number } => {
		let px = 0;
		let py = 0;
		for (const vt of p.verts) {
			px += vt.x;
			py += vt.y;
		}
		return { x: px / p.verts.length, y: py / p.verts.length };
	};

	/** Radial-fade strength (fade mode) — both fill and stroke fade. */
	const strengthOf = (p: { verts: { x: number; y: number }[]; ij: [number, number] }): number => {
		if (!anatomy || transition) return 100;
		const c = centroidOf(p);
		if ((anatomy.highlightCell ?? true) && inParallelogram(c.x, c.y)) return 100;
		const d = Math.hypot(c.x - cx, c.y - cy);
		const t = Math.min(1, Math.max(0, (d - fullR) / (rMax - fullR)));
		// cap below 100 so the highlighted cell pops with a visible step at its boundary
		// (crystallography convention: unit cell full, neighbours ghosted)
		return Math.min(75, Math.round((100 - t * (100 - minStrength)) / 5) * 5);
	};

	/** Left→right FILL strength (transition mode) — steep logistic, strokes untouched. */
	const fillStrengthOf = (p: { verts: { x: number; y: number }[] }): number => {
		const w = side / (transition?.steepness ?? 22);
		const c = centroidOf(p);
		const s = 100 * (1 - 1 / (1 + Math.exp(-(c.x - cx) / w)));
		return Math.round(s / 5) * 5;
	};

	if (transition) {
		for (const p of placed) {
			const base = tileStyleRef(opts.strategy, p.n);
			const s = fillStrengthOf(p);
			elements.push({ kind: 'poly', verts: p.verts, styleRef: s >= 100 ? base : `${base}@f${s}` });
		}
	} else {
		const ordered = anatomy ? [...placed].sort((a, b) => strengthOf(a) - strengthOf(b)) : placed;
		for (const p of ordered) {
			const base = tileStyleRef(opts.strategy, p.n);
			const s = strengthOf(p);
			elements.push({ kind: 'poly', verts: p.verts, styleRef: s >= 100 ? base : `${base}@${s}` });
		}
	}

	// Basis overlay: parallelogram anchored so it overlays the highlighted cell, u/v arrows from
	// its corner, lattice dots, math labels.
	if (anatomy?.basis || anatomy?.latticePoints) {
		const [u, v] = model.basis;
		const o = anchor;
		if (anatomy.latticePoints) {
			for (let i = -8; i <= 8; i++) {
				for (let j = -8; j <= 8; j++) {
					const q = { x: o.x + i * u.x + j * v.x, y: o.y + i * u.y + j * v.y };
					if (q.x < window.minX || q.x > window.maxX || q.y < window.minY || q.y > window.maxY) continue;
					// transition mode: the lattice annotation lives in the wireframe half
					if (transition && q.x < cx) continue;
					elements.push({ kind: 'marker', at: q, styleRef: 'lattice' });
				}
			}
		}
		if (anatomy.basis) {
			const ou = { x: o.x + u.x, y: o.y + u.y };
			const ov = { x: o.x + v.x, y: o.y + v.y };
			const ouv = { x: o.x + u.x + v.x, y: o.y + u.y + v.y };
			elements.push({ kind: 'polyline', verts: [o, ou, ouv, ov], closed: true, styleRef: 'basis@55' });
			elements.push({ kind: 'arrow', from: o, to: ou, styleRef: 'basis' });
			elements.push({ kind: 'arrow', from: o, to: ov, styleRef: 'basis' });
			// labels at arrow MIDPOINTS, offset along the outward normal — the tips carry lattice
			// dots, so radial-out labels collide there
			const pcx = o.x + (u.x + v.x) / 2;
			const pcy = o.y + (u.y + v.y) / 2;
			for (const [tip, tex] of [
				[ou, '$\\vec u$'],
				[ov, '$\\vec v$'],
			] as const) {
				const dx = tip.x - o.x;
				const dy = tip.y - o.y;
				const len = Math.hypot(dx, dy);
				// outward = the normal pointing AWAY from the parallelogram's own centre
				let nx = -dy / len;
				let ny = dx / len;
				const midX = (o.x + tip.x) / 2;
				const midY = (o.y + tip.y) / 2;
				if ((pcx - midX) * nx + (pcy - midY) * ny > 0) {
					nx = -nx;
					ny = -ny;
				}
				elements.push({
					kind: 'text',
					at: { x: midX + 0.5 * nx, y: midY + 0.5 * ny },
					tex,
					styleRef: 'label:basis',
				});
			}
			for (const q of [o, ou, ov, ouv]) {
				elements.push({ kind: 'marker', at: q, styleRef: 'lattice' });
			}
		}
	}

	const markers = opts.markers ?? opts.strategy === 'byOrbit';
	if (markers) {
		// One marker per distinct vertex position; adjacent polygons sharing a vertex must agree on
		// its orbit (lattice invariance) — disagreement means corrupted orbit data, fail loudly.
		const seen = new Map<string, number>();
		const posKey = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`;
		// anatomy: markers only on the full-strength cell — dots over ghosted tiles read as noise
		const markerSource = anatomy ? placed.filter((p) => strengthOf(p) >= 100) : placed;
		for (const p of markerSource) {
			p.verts.forEach((vt, ci) => {
				const orbit = p.orbitOfCorner[ci];
				if (orbit < 0) return;
				if (vt.x < window.minX || vt.x > window.maxX || vt.y < window.minY || vt.y > window.maxY) return;
				const key = posKey(vt.x, vt.y);
				const prev = seen.get(key);
				if (prev === undefined) {
					seen.set(key, orbit);
					elements.push({ kind: 'marker', at: vt, styleRef: `orbit:${orbit}` });
				} else if (prev !== orbit) {
					throw new Error(`tilingFigure: orbit disagreement at ${key} (${prev} vs ${orbit})`);
				}
			});
		}
	}

	return { ir: { bbox: window, clip: window, elements }, edgeMm };
}
