import { describe, it, expect } from "vitest";
import { pickStratified } from "@/lib/utils/pickStratified";

// pickStratified drives /play's "random tiling": every bucket must be equally likely, NOT every item —
// otherwise a fat (class × k) group swamps a thin one. These checks pin that property, the
// exclude-current behavior, and the empty/degenerate cases.

type T = { id: string; bucket: string };
const item = (id: string, bucket: string): T => ({ id, bucket });
const opts = (extra: Partial<Parameters<typeof pickStratified<T>>[1]> = {}) => ({
	bucketOf: (t: T) => t.bucket,
	keyOf: (t: T) => t.id,
	...extra,
});

// A scripted rng returning a fixed sequence, so bucket/item indices are deterministic.
function scriptedRng(values: number[]): () => number {
	let i = 0;
	return () => values[i++ % values.length];
}

describe("pickStratified", () => {
	it("weights buckets equally regardless of size", () => {
		// Bucket A has 1 item, bucket B has 1000. Over many draws A should appear ~half the time,
		// which uniform-over-items would make vanishingly rare (~1/1001).
		const items: T[] = [
			item("a", "A"),
			...Array.from({ length: 1000 }, (_, i) => item(`b${i}`, "B")),
		];
		// Alternate the bucket-choice draw between the two buckets (0 → first, 0.9 → second); the
		// within-bucket draw (0) then picks the first candidate in whichever bucket.
		let aCount = 0;
		for (let t = 0; t < 1000; t++) {
			const bucketDraw = t % 2 === 0 ? 0.1 : 0.9;
			const pick = pickStratified(items, opts({ rng: scriptedRng([bucketDraw, 0]) }));
			if (pick?.bucket === "A") aCount++;
		}
		expect(aCount).toBe(500); // exactly half — the singleton bucket is a peer, not a rarity
	});

	it("excludes the current selection", () => {
		const items = [item("a", "A"), item("b", "A")];
		// Only bucket A is eligible; excluding "a" leaves "b" as the sole candidate.
		const pick = pickStratified(items, opts({ excludeKey: "a", rng: scriptedRng([0, 0]) }));
		expect(pick?.id).toBe("b");
	});

	it("drops a bucket left empty by the exclusion", () => {
		// Bucket A is a singleton {a}; excluding "a" makes A ineligible, so only B can be returned.
		const items = [item("a", "A"), item("b", "B"), item("c", "B")];
		for (const bucketDraw of [0, 0.99]) {
			const pick = pickStratified(items, opts({ excludeKey: "a", rng: scriptedRng([bucketDraw, 0]) }));
			expect(pick?.bucket).toBe("B");
		}
	});

	it("returns null when nothing qualifies", () => {
		expect(pickStratified([], opts())).toBeNull();
		expect(pickStratified([item("a", "A")], opts({ excludeKey: "a" }))).toBeNull();
	});
});
