import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hypBarycenter, su11Apply, su11Identity, su11Inverse, su11Mul, su11Normalize, su11Translation } from "@/lib/render/hyperbolic";
import { type Darts, HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { WALK_APEIROGON, buildWalk, reanchor, snapPoint, walkPoint } from "@/lib/render/hyperbolicWalk";

type Rec = { id: string; config: string; edge: number; darts: Darts };
const shard = (dir: string, name: string) =>
	decodeAtlas(JSON.parse(gunzipSync(readFileSync(`public/${dir}/${name}.json.gz`)).toString())) as Rec[];
const meta = (r: Rec) => ({ id: r.id, name: r.id, config: r.config, edge: r.edge });
const kindOf = (t: ReturnType<typeof buildWalk>, f: number) => t.data[f * t.width * 4];
const sidesOf = (t: ReturnType<typeof buildWalk>, f: number) => t.data[f * t.width * 4 + 3];

describe("walk table", () => {
	// The developer is the reference: every face it closes has a barycentre, and the walk from the seed
	// face must arrive at a face of that size with the barycentre at its centre.
	const cases: [string, Rec][] = [
		["3.4.17.4 at k = 17, where no Dirichlet certificate exists", shard("hyperbolic-poly", "hp17-k17")[192]],
		["a 4-valent board", shard("hyperbolic-poly", "hpq3555-k15")[9]],
		["a hybrid board with apeirogons", shard("hyperbolic-poly", "hpy17627-k3")[499]],
	];
	for (const [name, rec] of cases) {
		it(`finds every developed face: ${name}`, () => {
			const t = buildWalk(rec.darts, rec.edge, { allDrawn: true });
			const patch = new HyperbolicDeveloper(rec.darts, rec.edge).develop(meta(rec), su11Identity(), 0.99, 40000);
			expect(patch.faces.length).toBeGreaterThan(10);
			let steps = 0;
			for (const face of patch.faces) {
				if (face.length < 3) continue;
				const b = hypBarycenter(face.map((i) => patch.vertices[i]));
				const r = walkPoint(t, t.seedFace, su11Apply(t.home, b));
				expect(r.ok).toBe(true);
				expect(sidesOf(t, r.f)).toBe(face.length);
				expect(Math.hypot(r.w.x, r.w.y)).toBeLessThan(1e-6);
				// W carries the start frame onto the arrival frame, so it sends the barycentre to 0 too.
				const viaW = su11Apply(su11Mul(r.W, t.home), b);
				expect(Math.hypot(viaW.x, viaW.y)).toBeLessThan(1e-6);
				steps++;
			}
			expect(steps).toBeGreaterThan(10);
		});
	}

	it("puts an apeirogon's vertices on the horocycle Im z = 1, one step apart", () => {
		const rec = shard("hyperbolic-poly", "hpy17627-k1")[3];
		const t = buildWalk(rec.darts, rec.edge, { allDrawn: true });
		let seen = 0;
		for (let f = 0; f < t.height; f++) {
			if (kindOf(t, f) !== WALK_APEIROGON) continue;
			seen++;
			const st = t.data[f * t.width * 4 + 2];
			expect(Math.abs(st)).toBeCloseTo(2 * Math.sinh(rec.edge / 2), 6);
			t.verts[f].forEach((w, k) => {
				const d = (1 - w.x) ** 2 + w.y ** 2;
				expect((1 - w.x * w.x - w.y * w.y) / d).toBeCloseTo(1, 6);
				expect((-2 * w.y) / d).toBeCloseTo(k * st, 6);
			});
			// A point deep in the cusp, far along the horocycle, is inside and comes back within one period.
			const z = { x: 37.3 * st, y: 5 };
			const w = { x: (z.x * z.x + z.y * z.y - 1) / (z.x * z.x + (z.y + 1) ** 2), y: (-2 * z.x) / (z.x * z.x + (z.y + 1) ** 2) };
			const r = walkPoint(t, f, w);
			expect(r.f).toBe(f);
			expect(Math.hypot(r.w.x, r.w.y)).toBeLessThan(0.99);
		}
		expect(seen).toBeGreaterThan(0);
	});

	it("crossing a side and crossing back is the identity", () => {
		const rec = shard("hyperbolic-poly", "hp17-k9")[0];
		const t = buildWalk(rec.darts, rec.edge, { allDrawn: true });
		for (let f = 0; f < t.height; f++) {
			const v = t.verts[f];
			for (let s = 0; s + 1 < v.length; s++) {
				// a point just past the midpoint of side s, seen from the face's centre
				const m = { x: (v[s].x + v[s + 1].x) / 2, y: (v[s].y + v[s + 1].y) / 2 };
				const out = { x: m.x * 1.2, y: m.y * 1.2 };
				const r = walkPoint(t, f, out);
				expect(r.ok).toBe(true);
				expect(r.f === f && r.W.b.x === 0).toBe(false);
				const back = walkPoint(t, r.f, su11Apply(r.W, { x: 0, y: 0 }));
				expect(back.f).toBe(f);
				const round = su11Mul(back.W, r.W);
				expect(Math.hypot(round.b.x, round.b.y)).toBeLessThan(1e-9);
			}
		}
	});

	it("anchors a camera 300 units from the seed without the view growing", () => {
		const rec = shard("hyperbolic-poly", "hp17-k17")[192];
		const t = buildWalk(rec.darts, rec.edge, { allDrawn: true });
		let f = t.seedFace;
		let view = su11Inverse(t.home);
		const stepM = su11Translation({ x: Math.tanh(0.15), y: Math.tanh(0.04) });
		for (let i = 0; i < 1000; i++) {
			view = su11Normalize(su11Mul(stepM, view));
			const r = reanchor(t, f, view);
			f = r.f;
			view = r.view;
			expect(Math.hypot(view.b.x, view.b.y) / Math.hypot(view.a.x, view.a.y)).toBeLessThan(0.95);
		}
		// the feature a click snaps to is a point of the anchor's frame, near the click
		const c = su11Apply(su11Inverse(view), { x: 0.3, y: 0.2 });
		const s = snapPoint(t, f, c);
		expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeLessThan(0.5);
	});
});
