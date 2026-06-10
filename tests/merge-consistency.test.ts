/**
 * The always-on merge equivalence-relation guard in `dedupeByCongruence` (C4-review §4 / incidence
 * contract §3). It must fire on the §19.6 bug class — an argument-order-asymmetric congruence predicate
 * that makes the partition non-symmetric / non-transitive — and stay silent on a valid equivalence.
 * Tested with injected mock predicates so we can exhibit the broken cases a correct `tilingsCongruent`
 * never produces.
 */
import { describe, it, expect } from "vitest";
import { assertEquivalencePartition } from "@/classes/algorithm/TilingCongruence";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";

// identity-only stand-ins (the predicate decides congruence; the partition checker only uses identity)
const cell = (id: string) => ({ id } as unknown as PeriodCell);
const a = cell("a"), b = cell("b"), c = cell("c");
const inSet = (x: PeriodCell, ...s: PeriodCell[]) => s.includes(x);

describe("assertEquivalencePartition", () => {
	it("passes silently for a valid equivalence partition", () => {
		const identity = (x: PeriodCell, y: PeriodCell) => x === y;
		expect(() => assertEquivalencePartition([[a], [b], [c]], identity)).not.toThrow();
		// a~b merged, c alone — a genuine equivalence respected by the partition
		const ab = (x: PeriodCell, y: PeriodCell) => x === y || (inSet(x, a, b) && inSet(y, a, b));
		expect(() => assertEquivalencePartition([[a, b], [c]], ab)).not.toThrow();
	});

	it("throws on a non-reflexive predicate", () => {
		expect(() => assertEquivalencePartition([[a]], () => false)).toThrow(/reflexivity/);
	});

	it("throws on an ASYMMETRIC predicate (the §19.6 argument-order class)", () => {
		const asym = (x: PeriodCell, y: PeriodCell) => (x === a && y === b ? true : x === b && y === a ? false : x === y);
		expect(() => assertEquivalencePartition([[a, b]], asym)).toThrow(/symmetry/);
	});

	it("throws on intransitivity — a congruent pair split across classes (inflation)", () => {
		const ab = (x: PeriodCell, y: PeriodCell) => x === y || (inSet(x, a, b) && inSet(y, a, b));
		expect(() => assertEquivalencePartition([[a], [b]], ab)).toThrow(/intransitivity|congruent pair/);
	});

	it("throws on over-merge — a non-congruent pair in one class", () => {
		const identity = (x: PeriodCell, y: PeriodCell) => x === y;
		expect(() => assertEquivalencePartition([[a, b]], identity)).toThrow(/non-congruent pair/);
	});
});
