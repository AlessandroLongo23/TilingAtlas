import { describe, expect, it } from "vitest";
import { compactVC, matchesVcs, parseVC, vcsOf } from "./vertexConfig";
import { SOURCES } from "@/lib/vocabulary";

describe("parseVC", () => {
	it("reads every notation to one canonical spelling", () => {
		for (const s of ["3.6.4.6", "4.6.3.6", "6,4,6,3", "(3,6,4,6)A", " 6.3.6.4 "]) expect(parseVC(s)).toBe("3.6.4.6");
		expect(parseVC("3^4.6")).toBe("3.3.3.3.6");
		expect(parseVC("3⁴.6")).toBe("3.3.3.3.6");
		expect(parseVC("12*.3.12")).toBe("3.12.12*");
		expect(parseVC("(4*p1,5,4*p1,5,5)A")).toBe("4*p1.5.4*p1.5.5");
		expect(parseVC("5,5,4*p1,5,4*p1")).toBe("4*p1.5.4*p1.5.5");
	});
	it("puts a regular polygon before a star of the same size", () => {
		expect(parseVC("12*.12.3")).toBe("3.12.12*");
	});
	it("rejects what is not a vertex figure", () => {
		expect(parseVC("3.4")).toBeNull();
		expect(parseVC("p6m")).toBeNull();
		expect(parseVC("")).toBeNull();
	});
});

describe("compactVC", () => {
	it("folds runs into exponents", () => {
		expect(compactVC("3.3.3.4.4")).toBe("3³.4²");
		expect(compactVC("3.4.6.4")).toBe("3.4.6.4");
	});
});

describe("vcsOf / matchesVcs", () => {
	const hyp = { source: SOURCES.HYPERBOLIC, family: "3.4.4.8 + 3.4.8.4" };
	it("reads hyperbolic figures off the family string", () => {
		expect(vcsOf(hyp)).toEqual(["3.4.4.8", "3.4.8.4"]);
	});
	it("combines a query three ways", () => {
		const have = ["3.4.4.8", "3.4.8.4"];
		expect(matchesVcs(have, ["3.4.8.4"], "all")).toBe(true);
		expect(matchesVcs(have, ["3.4.8.4"], "exact")).toBe(false);
		expect(matchesVcs(have, ["3.4.8.4", "3.4.4.8"], "exact")).toBe(true);
		expect(matchesVcs(have, ["4.8.8", "3.4.8.4"], "any")).toBe(true);
		expect(matchesVcs(null, ["4.8.8"], "any")).toBe(false);
	});
});
