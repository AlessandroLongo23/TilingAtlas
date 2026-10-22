import { describe, it, expect } from "vitest";
import { verifyComplex } from "../../scripts/moduli-graph/verifyComplex";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import type { ParametricCellData } from "@/lib/utils/paramCell";
import { readDataText } from "../../scripts/atlas/io.mjs";

const atlas = decodeAtlas<{ id: string; k: number; source: string; paramCell?: ParametricCellData }>(
	JSON.parse(readDataText("public/reference-atlas-isotoxal.json")),
);
const cluster = atlas.filter((r) => r.k === 2 && r.source === "isotoxal" && r.paramCell?.params?.length === 2);

describe("verifyComplex on the 24-family cluster", () => {
	const r = verifyComplex(cluster);
	it("reports betti and a positive separation margin", () => {
		expect(r.betti.length).toBe(3);
		expect(r.nodeMargin).toBeGreaterThan(0); // distinct nodes are geometrically separated
	});
	it("extracts one classified surface per H2 generator", () => {
		expect(r.h2.length).toBe(r.betti[2]); // one entry per b2 generator
		for (const g of r.h2) expect(typeof g.surface).toBe("string");
	});
	it("extracts one node-loop per H1 generator", () => {
		expect(r.h1.length).toBe(r.betti[1]);
	});
});
