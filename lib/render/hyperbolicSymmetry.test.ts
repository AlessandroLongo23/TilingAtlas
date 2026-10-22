import { describe, expect, it } from "vitest";
import { su11Apply, su11Inverse } from "@/lib/render/hyperbolic";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import { bestCentre, dartSymmetry } from "@/lib/render/hyperbolicSymmetry";
import { buildWalk, walkPoint } from "@/lib/render/hyperbolicWalk";
import { readDataText } from "../../scripts/atlas/io.mjs";

const recs: { id: string; edge: number; darts: Darts }[] = JSON.parse(readDataText("public/hyperbolic-developed.json"));
const rec = (id: string) => recs.find((r) => r.id === id)!;
const centre = (id: string) => {
	const c = bestCentre(dartSymmetry(rec(id).darts, rec(id).edge).features);
	return `${c.kind}${c.size} ${c.mirror ? "D" : "C"}${c.mirror ? c.order / 2 : c.order}`;
};

describe("the opening point of a hyperbolic tiling", () => {
	it("is the feature with the largest stabiliser", () => {
		expect(centre("hyp-6-6-7")).toBe("F7 D7");
		expect(centre("hyp-3-3-3-3-7")).toBe("F7 C7"); // the snub: no mirrors
		expect(centre("hyp-5-8-8")).toBe("F5 D5"); // order 10 beats the octagon's 8
		expect(centre("hyp-3-3-3-3-3-3-3")).toBe("V7 D7"); // {3,7}: the vertex beats the triangle
	});

	it("is where buildWalk puts the origin", () => {
		for (const id of ["hyp-6-6-7", "hyp-3-3-3-3-3-3-3", "hyp-3-3-3-4-4-4-4-c"]) {
			const { darts, edge } = rec(id);
			const c = bestCentre(dartSymmetry(darts, edge).features);
			const w = buildWalk(darts, edge, { allDrawn: true });
			const p = su11Apply(w.home, { x: 0, y: 0 });
			// the opening point lies in (or on the boundary of) the opening face
			expect(walkPoint(w, w.seedFace, { x: p.x * 0.999, y: p.y * 0.999 }).f, id).toBe(w.seedFace);
			const v = w.verts[w.seedFace];
			const d = Math.min(...v.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
			if (c.kind === "F") expect(Math.hypot(p.x, p.y), id).toBe(0);
			if (c.kind === "V") expect(d, id).toBeLessThan(1e-9);
			if (c.kind === "E") {
				// equidistant from the two ends of one side
				const ds = v.map((q) => Math.hypot(...Object.values(su11Apply(su11Inverse(w.home), q)))).sort((a, b) => a - b);
				expect(ds[1] - ds[0], id).toBeLessThan(1e-9);
				expect(ds[0], id).toBeCloseTo(Math.tanh(edge / 4), 9);
			}
		}
	});
});
