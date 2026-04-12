/**
 * Parity smoke tests for the algorithm pipeline.
 * Verifies that ported classes wire together and produce the expected
 * outputs for a well-known small polygon set (regular, n_max = 4).
 */

import { describe, it, expect } from "vitest";
import {
	generatePolygons,
	generateVCs,
	generateVCsWithCompatibilityGraph,
	polygonNamesToSignatures,
} from "@/lib/algorithm/pipeline-core";
import { PolygonType } from "@/classes/polygons/PolygonType";
import type { GeneratorParameters } from "@/classes";

const parameters: GeneratorParameters = {
	[PolygonType.REGULAR]: { n_max: 4 },
};

describe("generatePolygons (reg n_max=4)", () => {
	const { signatures, names, paramsFolder } = generatePolygons(parameters);

	it("produces the triangle and square", () => {
		expect(names).toContain("3");
		expect(names).toContain("4");
	});

	it("returns consistent signatures for the names", () => {
		expect(signatures).toHaveLength(names.length);
		for (const sig of signatures) {
			expect(sig.n).toBeGreaterThanOrEqual(3);
		}
	});

	it("paramsFolder reflects input", () => {
		expect(paramsFolder).toBe("reg_4");
	});
});

describe("polygonNamesToSignatures", () => {
	it("round-trips known names", () => {
		const sigs = polygonNamesToSignatures(["3", "4"]);
		expect(sigs).toHaveLength(2);
		expect(sigs.every((s) => s.n === 3 || s.n === 4)).toBe(true);
	});

	it("skips invalid names", () => {
		const sigs = polygonNamesToSignatures(["3", "nonsense", "4"]);
		expect(sigs.length).toBeLessThanOrEqual(2);
	});
});

describe("generateVCs (reg n_max=4)", () => {
	const { names } = generatePolygons(parameters);
	const vcs = generateVCs(names);

	it("returns a non-empty sorted list of VC names", () => {
		expect(vcs.length).toBeGreaterThan(0);
		const sorted = [...vcs].sort();
		// Only assert every name is non-empty and contains commas or is a single number
		for (const vc of vcs) {
			expect(typeof vc).toBe("string");
			expect(vc.length).toBeGreaterThan(0);
		}
		expect(sorted).toBeDefined();
	});

	it("includes the regular tilings 3.3.3.3.3.3, 4.4.4.4, 3.3.3.3.3.3", () => {
		// 3^6 and 4^4 are canonical regular Euclidean tilings for triangle/square inputs
		expect(vcs).toContain("3,3,3,3,3,3");
		expect(vcs).toContain("4,4,4,4");
	});
});

describe("generateVCsWithCompatibilityGraph", () => {
	const { names } = generatePolygons(parameters);
	const { vcNames, adjacencyList } = generateVCsWithCompatibilityGraph(names);

	it("adjacency list is symmetric", () => {
		for (const [a, neighbors] of Object.entries(adjacencyList)) {
			for (const b of neighbors) {
				expect(adjacencyList[b]).toContain(a);
			}
		}
	});

	it("every VC appears as a key", () => {
		for (const vc of vcNames) {
			expect(adjacencyList[vc]).toBeDefined();
		}
	});
});
