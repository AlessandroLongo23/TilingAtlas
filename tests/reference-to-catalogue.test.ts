import { describe, it, expect } from "vitest";
import { referenceToCatalogue, type ReferenceTiling } from "@/lib/services/referenceAtlas";

const stub = (over: Partial<ReferenceTiling>): ReferenceTiling => ({
	id: "t-test",
	source: "galebach",
	k: 7,
	family: "3.4.6.12",
	renderCell: {} as ReferenceTiling["renderCell"],
	discoverer: "Galebach",
	...over,
});

describe("referenceToCatalogue vertex-type + wallpaper pass-through", () => {
	it("carries m, partition, wallpaperGroup, latticeShape", () => {
		const c = referenceToCatalogue(
			stub({ m: 3, partition: [5, 1, 1], wallpaperGroup: "p6m", latticeShape: "hexagonal" }),
		);
		expect(c.m).toBe(3);
		expect(c.partition).toEqual([5, 1, 1]);
		expect(c.wallpaperGroup).toBe("p6m");
		expect(c.latticeShape).toBe("hexagonal");
	});

	it("leaves them undefined when the source omits them", () => {
		const c = referenceToCatalogue(stub({}));
		expect(c.m).toBeUndefined();
		expect(c.wallpaperGroup).toBeUndefined();
	});
});
