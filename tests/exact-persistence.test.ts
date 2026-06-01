import { describe, it, expect } from "vitest";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";

const ring = CyclotomicRing.create(24);

describe("exact persistence round-trips (no float drift)", () => {
	it("Cyclotomic encode/decode is exact", () => {
		const z = Cyclotomic.zeta(ring, 5).add(Cyclotomic.zeta(ring, 1)).scaleRational(3n, 7n);
		const round = Cyclotomic.decode(ring, z.encode());
		expect(round.equals(z)).toBe(true);
		expect(round.key()).toBe(z.key());
	});

	it("SeedConfiguration compact round-trip preserves exact polygon keys", () => {
		// build a seed, shift it off-origin via exact transform, encode → decode, compare keys
		const vc = VertexConfiguration.fromName("3,4,6,4"); // a real 1-uniform vertex type
		const seed = new SeedConfiguration([vc]);

		const before = seed.polygons
			.map((p) => p.exactKey())
			.sort();

		const compact = seed.encodeCompact(undefined, true);
		const decoded = SeedConfiguration.decodeCompact(compact as any, undefined);

		const after = decoded.polygons.map((p) => p.exactKey()).sort();
		expect(after).toEqual(before);
		// decoded polygons must still be exact
		expect(decoded.polygons.every((p) => p.hasExact())).toBe(true);
	});

	it("RegularPolygon.encode carries exact anchor+dir and reconstructs exactly", () => {
		const p = RegularPolygon.fromAnchorAndDirExact(6, Cyclotomic.zeta(ring, 3), 2);
		const enc = p.encode() as { anchor: { n: string[]; d: string }; dir: number; n: number };
		expect(enc.dir).toBe(2);
		const anchor = Cyclotomic.decode(ring, enc.anchor);
		const rebuilt = RegularPolygon.fromAnchorAndDirExact(enc.n, anchor, enc.dir);
		expect(rebuilt.exactVertices!.map((v) => v.key())).toEqual(
			p.exactVertices!.map((v) => v.key())
		);
	});
});
