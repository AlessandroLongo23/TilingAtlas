import { buildCell } from "@/lib/pentagon/build";
import { hsbToHsla } from "@/lib/utils/renderTiling";

// The Pentagons card's media: a real patch of Type 15, built by the same code the /pentagons page
// draws — `buildCell` solves the pentagon, replays its assembly recipe and hands back the twelve
// tiles of the translational unit with the page's per-tile hues. Rendered here as static SVG on the
// server: the type has zero degrees of freedom, so there is nothing to animate and no canvas to spin
// up for a 230px cell.
//
// Type 15 and not Type 1 because it is the card's whole story: the last convex pentagon found (Mann,
// McLoud-Mann and Von Derau, 2015), and the one whose twelve-tile unit is visible at this size.

const TYPE = 15;

/** How much of the tiling the window shows, in periods across. Type 15's pattern is the diagonal
 *  chain its twelve-tile unit builds, and that takes a couple of periods to appear — at 1.6 the card
 *  showed ten tiles and read as a heap of pentagons. The page itself opens at 4. */
const PERIODS_ACROSS = 2.6;

/** Window aspect. The card crops it (`slice`), so this only fixes which way the surplus falls. */
const WINDOW_ASPECT = 4 / 3;

const fmt = (n: number) => n.toFixed(4);

/**
 * The lattice range that covers a window, in lattice coordinates.
 *
 * Not a fixed radius. Type 15's basis is nearly collinear (v1 and v2 are ~160° apart, so a cell of
 * side 5.5 is spanned by two vectors of length 11), and a radius picked off the vectors' LENGTHS
 * covers barely half the window across the short direction — which is how the card first rendered
 * with white corners. Mapping the window's own corners through the inverse basis asks the question
 * that matters: which (a, b) can reach this box at all.
 *
 * `pad` is the unit's own reach: a copy anchored outside the window can still put a tile inside it.
 */
function latticeRange(
	v1: readonly [number, number],
	v2: readonly [number, number],
	box: { x0: number; y0: number; w: number; h: number },
	pad: number,
) {
	const det = v1[0] * v2[1] - v1[1] * v2[0];
	const corners: [number, number][] = [
		[box.x0 - pad, box.y0 - pad],
		[box.x0 + box.w + pad, box.y0 - pad],
		[box.x0 - pad, box.y0 + box.h + pad],
		[box.x0 + box.w + pad, box.y0 + box.h + pad],
	];
	let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
	for (const [x, y] of corners) {
		const a = (x * v2[1] - y * v2[0]) / det;
		const b = (v1[0] * y - v1[1] * x) / det;
		aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
		bMin = Math.min(bMin, b); bMax = Math.max(bMax, b);
	}
	return {
		aMin: Math.floor(aMin), aMax: Math.ceil(aMax),
		bMin: Math.floor(bMin), bMax: Math.ceil(bMax),
	};
}

export function PentagonMini() {
	const result = buildCell({ id: TYPE });
	if (!result.ok) return null;
	const { polygons, v1, v2, period } = result.cell;

	const w = PERIODS_ACROSS * period;
	const h = w / WINDOW_ASPECT;

	// Centre the window on the unit, not on the origin: the assembly grows from a seed tile at the
	// origin, so the origin sits on the unit's edge and half the frame would be neighbours.
	const cx =
		polygons.flatMap((p) => p.vertices.map((v) => v.x)).reduce((a, b) => a + b, 0) /
		polygons.reduce((n, p) => n + p.vertices.length, 0);
	const cy =
		polygons.flatMap((p) => p.vertices.map((v) => v.y)).reduce((a, b) => a + b, 0) /
		polygons.reduce((n, p) => n + p.vertices.length, 0);

	const x0 = cx - w / 2;
	const y0 = cy - h / 2;

	// How far a tile can sit from its copy's anchor, so `latticeRange` knows how wide to cast.
	const reach = Math.max(
		...polygons.flatMap((p) => p.vertices.map((v) => Math.hypot(v.x, v.y))),
	);
	const { aMin, aMax, bMin, bMax } = latticeRange(v1, v2, { x0, y0, w, h }, reach);

	const tiles: { points: string; hue: number }[] = [];
	for (let a = aMin; a <= aMax; a++) {
		for (let b = bMin; b <= bMax; b++) {
			const dx = a * v1[0] + b * v2[0];
			const dy = a * v1[1] + b * v2[1];
			for (const poly of polygons) {
				const xs = poly.vertices.map((p) => p.x + dx);
				const ys = poly.vertices.map((p) => p.y + dy);
				// Cull by bounding box against the window. A whole lattice of copies is ~300 polygons of
				// server-rendered SVG for the ~40 that land in frame.
				if (Math.max(...xs) < x0 || Math.min(...xs) > x0 + w) continue;
				if (Math.max(...ys) < y0 || Math.min(...ys) > y0 + h) continue;
				tiles.push({
					points: xs.map((x, i) => `${fmt(x)},${fmt(ys[i])}`).join(" "),
					hue: poly.hue ?? 0,
				});
			}
		}
	}

	return (
		<div className="w-full h-full">
			<svg
				viewBox={`${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}`}
				preserveAspectRatio="xMidYMid slice"
				className="w-full h-full"
				aria-label="A patch of the Type 15 convex-pentagon tiling"
			>
				{tiles.map((t, i) => (
					<polygon
						key={i}
						points={t.points}
						fill={hsbToHsla(t.hue, 40, 100, 1)}
						stroke="rgba(0, 0, 0, 0.45)"
						strokeWidth={period * 0.008}
						strokeLinejoin="round"
					/>
				))}
			</svg>
		</div>
	);
}
