import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell } from "@/lib/services/cellCodecService";
import square44 from "./fixtures/cell-44.json";

describe("seedFromCell", () => {
	it("returns two independent non-zero basis vectors and a deduped, non-empty exact seed", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const { T1, T2, seed } = seedFromCell(ring, square44 as unknown as Parameters<typeof seedFromCell>[1]);

		expect(T1.isZero()).toBe(false);
		expect(T2.isZero()).toBe(false);

		// linearly independent (non-degenerate cell)
		const a = T1.toVector();
		const b = T2.toVector();
		const cross = a.x * b.y - a.y * b.x;
		expect(Math.abs(cross)).toBeGreaterThan(1e-9);

		// seed dedup: every exact vertex has a distinct ring key
		const keys = new Set(seed.map((s) => s.key()));
		expect(keys.size).toBe(seed.length);
		expect(seed.length).toBeGreaterThan(0);
	});
});
