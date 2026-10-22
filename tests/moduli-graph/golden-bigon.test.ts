import { describe, it, expect } from "vitest";
import { CyclotomicRing } from "@/classes/Cyclotomic";
import { loadCatalogueKeys } from "../../scripts/moduli-graph/catalogueKeys";
import { assembleGraph } from "../../scripts/moduli-graph/graphAssembler";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import type { ParametricCellData } from "@/lib/utils/paramCell";
import { readDataText } from "../../scripts/atlas/io.mjs";

const atlas = decodeAtlas<{ id: string; paramCell: ParametricCellData }>(
	JSON.parse(readDataText("public/reference-atlas-isotoxal.json")),
);
const fam = atlas.find((r) => r.id === "ctrnact-isotoxal-family-k1-06")!;

describe("golden bigon (3.3.4α)", () => {
	it("assembles two nodes, two edges, H1 = 1", () => {
		const g = assembleGraph([fam], loadCatalogueKeys(CyclotomicRing.create(24)));
		expect(g.nodes).toHaveLength(2);
		expect(g.edges).toHaveLength(2);
		const labels = g.nodes.map((n) => n.label).sort();
		expect(labels).toEqual(["ctrnact-01_34-5c-1", "ctrnact-01_3-6a-1"].sort());
		expect(g.h1).toBe(1); // E - V + C = 2 - 2 + 1
		expect(g.unresolved).toBe(0);
	});
});
