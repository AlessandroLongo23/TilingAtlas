// Each vertex of a period cell by its type: the canonical figure of the corners round it, in the tokens of
// lib/services/vertexConfig.ts (a regular n-gon's corner "n"; a star's point "n*p<angle>" and dent "n*d<point
// angle>", n its points), with one point per vertex of the cell. Read off the cell as drawn, so it agrees with the
// canvas however the record's cell was moved or mirrored. The amalgamas' "Vertex types" rows light a type with it.
import { canonicalVC } from "@/lib/services/vertexConfig";
import { TorusSnap } from "@/lib/tilings/dsymFromMap";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

type Pt = number[];
const xy = (q: unknown): Pt => (Array.isArray(q) ? (q as Pt) : [(q as { x: number }).x, (q as { y: number }).y]);
const DEG = 180 / Math.PI;

export function vertexTypePoints(cell: TranslationalCellData): Map<string, Pt[]> {
	const [[a, b], [c, d]] = (cell.basis ?? cell.b) as Pt[];
	const det = a * d - b * c;
	const snap = new TorusSnap(1e-4);
	// per vertex of the cell, its corners: where, which way into the tile, and the token
	const at: { p: Pt; dir: number; token: string }[][] = [];
	for (const poly of (cell.cellPolygons ?? cell.p ?? []) as {
		v?: unknown[];
		vertices?: unknown[];
		n?: number;
		star?: boolean;
	}[]) {
		const v = (poly.v ?? poly.vertices ?? []).map(xy);
		const m = v.length;
		if (m < 3) continue;
		const ccw = v.reduce((s, p, i) => s + p[0] * v[(i + 1) % m][1] - v[(i + 1) % m][0] * p[1], 0) > 0;
		// the angle to the previous and the next corner, and the interior angle between them
		const sides = v.map((p, i) => {
			const [q, r] = [v[(i + m - 1) % m], v[(i + 1) % m]];
			const toPrev = Math.atan2(q[1] - p[1], q[0] - p[0]);
			const toNext = Math.atan2(r[1] - p[1], r[0] - p[0]);
			const from = ccw ? toNext : toPrev;
			const inner = ((((ccw ? toPrev - toNext : toNext - toPrev) * DEG) % 360) + 360) % 360;
			return { dir: from + inner / DEG / 2, inner };
		});
		const point = Math.round(Math.min(...sides.map((s) => s.inner)));
		v.forEach((p, i) => {
			const token = poly.star ? `${poly.n}*${sides[i].inner < 180 ? "p" : "d"}${point}` : String(poly.n ?? m);
			const id = snap.id((p[0] * d - p[1] * c) / det, (a * p[1] - b * p[0]) / det);
			(at[id] ??= []).push({ p, dir: ((sides[i].dir % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), token });
		});
	}
	const out = new Map<string, Pt[]>();
	for (const corners of at) {
		if (!corners) continue;
		corners.sort((x, y) => x.dir - y.dir);
		const vc = canonicalVC(corners.map((x) => x.token));
		out.set(vc, [...(out.get(vc) ?? []), corners[0].p]);
	}
	return out;
}
