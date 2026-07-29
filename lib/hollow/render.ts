/**
 * Canvas-2D renderer for hollow tilings.
 *
 * A hollow tile is a closed path that crosses itself, and neighbouring tiles overlap, so this
 * cannot go through the flat cell renderer: there is no polygon decomposition of the plane to
 * hand it. Each face is stroked as its own closed path and filled translucently, so overlaps
 * accumulate and the density structure — the thing that distinguishes a hollow tiling from an
 * ordinary one — is visible as darker regions, not hidden.
 *
 * Fill uses the NONZERO winding rule deliberately. Even-odd would punch a hole in the middle of
 * every pentagram-like tile, which is the `|n/d|` concave reading — the wrong tile.
 */
import type { HollowFace, HollowPatch } from "@/lib/hollow/pattern";

export interface HollowView {
	/** Pixels per unit edge. */
	zoom: number;
	/** Pan, in world units. */
	cx: number;
	cy: number;
	/** Degrees, counter-clockwise. */
	rotation: number;
}

export type HollowFillMode = "none" | "tile" | "density";

export interface HollowStyle {
	fillMode: HollowFillMode;
	showVertices: boolean;
	lineWidth: number;
	dark: boolean;
}

export const DEFAULT_HOLLOW_STYLE: Omit<HollowStyle, "dark"> = {
	fillMode: "tile",
	showVertices: false,
	lineWidth: 1.25,
};

/** Stable hue per tile type. Convex and retrograde partners share a hue — they are one shape. */
export function tileHue(n: number, d: number): number {
	const dd = Math.min(d, n - d);
	return (n * 47 + dd * 113) % 360;
}

/**
 * Faces of one fundamental domain, so a periodic patch can be replicated without redrawing the
 * hundreds of overlapping copies the grown patch already contains.
 */
export function fundamentalFaces(patch: HollowPatch): HollowFace[] {
	const L = patch.lattice;
	if (!L) return patch.faces;
	const [[ax, ay], [bx, by]] = L;
	const det = ax * by - ay * bx;
	if (Math.abs(det) < 1e-9) return patch.faces;
	const seen = new Set<string>();
	const out: HollowFace[] = [];
	for (const f of patch.faces) {
		let sx = 0;
		let sy = 0;
		for (const [x, y] of f.v) {
			sx += x;
			sy += y;
		}
		sx /= f.v.length;
		sy /= f.v.length;
		const u = (sx * by - sy * bx) / det;
		const v = (-sx * ay + sy * ax) / det;
		const iu = Math.floor(u);
		const iv = Math.floor(v);
		const key = `${f.n}/${f.d}:${Math.round((u - iu) * 4096)}:${Math.round((v - iv) * 4096)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		// Translate into the ORIGIN cell. Keeping the face where the patch happened to put it
		// leaves the fundamental set scattered across the whole disk, and replicating a scattered
		// set tiles a wedge instead of the plane.
		const ox = iu * ax + iv * bx;
		const oy = iu * ay + iv * by;
		out.push({ n: f.n, d: f.d, v: f.v.map(([x, y]) => [x - ox, y - oy] as [number, number]) });
	}
	return out;
}

/** Integer lattice offsets covering the viewport, capped so a huge zoom-out cannot hang the frame. */
function offsets(patch: HollowPatch, halfW: number, halfH: number, cx: number, cy: number): [number, number][] {
	const L = patch.lattice;
	if (!L) return [[0, 0]];
	const [[ax, ay], [bx, by]] = L;
	const det = ax * by - ay * bx;
	if (Math.abs(det) < 1e-9) return [[0, 0]];
	const reach = Math.hypot(halfW, halfH) + 3;
	const la = Math.hypot(ax, ay);
	const lb = Math.hypot(bx, by);
	const ia = Math.min(24, Math.ceil(reach / Math.max(la, 0.2)));
	const ib = Math.min(24, Math.ceil(reach / Math.max(lb, 0.2)));
	const out: [number, number][] = [];
	for (let i = -ia; i <= ia; i++) {
		for (let j = -ib; j <= ib; j++) {
			const ox = i * ax + j * bx;
			const oy = i * ay + j * by;
			if (Math.abs(ox - cx) > reach + 2 || Math.abs(oy - cy) > reach + 2) continue;
			out.push([ox, oy]);
			if (out.length > 900) return out;
		}
	}
	return out;
}

/** Fit the zoom so the patch (or one period) fills the canvas. */
export function fitHollowView(patch: HollowPatch, w: number, h: number): HollowView {
	let span: number;
	if (patch.lattice) {
		// Periodic: frame a few periods, so the repeat is legible instead of one cell filling the frame.
		const [[ax, ay], [bx, by]] = patch.lattice;
		span = 1.6 * Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
	} else {
		let r = 0;
		for (const f of patch.faces) for (const [x, y] of f.v) r = Math.max(r, Math.hypot(x, y));
		span = Math.max(r, 1);
	}
	return { zoom: Math.min(w, h) / (2.1 * Math.max(span, 0.6)), cx: 0, cy: 0, rotation: 0 };
}

export function drawHollow(
	ctx: CanvasRenderingContext2D,
	patch: HollowPatch,
	view: HollowView,
	style: HollowStyle,
	w: number,
	h: number,
): void {
	ctx.clearRect(0, 0, w, h);
	const { zoom, cx, cy } = view;
	const halfW = w / (2 * zoom);
	const halfH = h / (2 * zoom);

	ctx.save();
	ctx.translate(w / 2, h / 2);
	ctx.rotate((view.rotation * Math.PI) / 180);
	ctx.scale(zoom, -zoom); // y up, like the rest of the Atlas
	ctx.translate(-cx, -cy);

	const faces = patch.lattice ? fundamentalFaces(patch) : patch.faces;
	const offs = offsets(patch, halfW, halfH, cx, cy);
	const stroke = style.dark ? "rgba(235,238,245,0.85)" : "rgba(24,28,38,0.85)";
	const lw = style.lineWidth / zoom;

	// Fill first, every copy, so overlaps accumulate into the density picture; then stroke on top.
	if (style.fillMode !== "none") {
		for (const [ox, oy] of offs) {
			for (const f of faces) {
				ctx.beginPath();
				ctx.moveTo(f.v[0][0] + ox, f.v[0][1] + oy);
				for (let i = 1; i < f.v.length; i++) ctx.lineTo(f.v[i][0] + ox, f.v[i][1] + oy);
				ctx.closePath();
				if (style.fillMode === "density") {
					ctx.fillStyle = style.dark ? "rgba(140,180,255,0.13)" : "rgba(40,80,180,0.11)";
				} else {
					const hue = tileHue(f.n, f.d);
					ctx.fillStyle = `hsla(${hue}, 72%, ${style.dark ? 60 : 54}%, 0.30)`;
				}
				ctx.fill("nonzero");
			}
		}
	}

	ctx.lineWidth = lw;
	ctx.strokeStyle = stroke;
	ctx.lineJoin = "round";
	for (const [ox, oy] of offs) {
		for (const f of faces) {
			ctx.beginPath();
			ctx.moveTo(f.v[0][0] + ox, f.v[0][1] + oy);
			for (let i = 1; i < f.v.length; i++) ctx.lineTo(f.v[i][0] + ox, f.v[i][1] + oy);
			ctx.closePath();
			ctx.stroke();
		}
	}

	if (style.showVertices) {
		const r = 2.2 / zoom;
		ctx.fillStyle = style.dark ? "rgba(255,210,120,0.95)" : "rgba(180,90,0,0.95)";
		for (const [ox, oy] of offs) {
			for (const f of faces) {
				for (const [x, y] of f.v) {
					ctx.beginPath();
					ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}
	}
	ctx.restore();
}
