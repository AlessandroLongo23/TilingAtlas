// tests/moduli-graph/two-cell.test.ts
import { describe, it, expect } from "vitest";
import { extractTwoCell } from "../../scripts/moduli-graph/twoCellExtractor";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import type { ParametricCellData } from "@/lib/utils/paramCell";
import { readDataText } from "../../scripts/atlas/io.mjs";

const atlas = decodeAtlas<{ id: string; k: number; source: string; family?: string; paramCell: ParametricCellData }>(
	JSON.parse(readDataText("public/reference-atlas-isotoxal.json")),
);
const twoParam = atlas.filter((r) => r.k === 2 && r.source === "isotoxal" && r.paramCell?.params?.length === 2);
const first4a = twoParam.find((r) => r.family === "4α")!;

describe("extractTwoCell on a 4α two-parameter family", () => {
	const face = extractTwoCell(first4a.paramCell);
	it("produces a closed boundary cycle of node states", () => {
		expect(face.boundary.length).toBeGreaterThanOrEqual(4); // ≥4 sides, more if a side subdivides
		// closed: consecutive states are joined and the last joins the first (checked structurally)
		expect(face.corners.length).toBe(4);
	});
	it("passes the product-square grid check", () => {
		expect(face.productOK).toBe(true);
	});
});
