import { describe, it, expect } from "vitest";
import {
	extractDataFromPolygonName,
	comparePolygonNames,
	compareVertexConfigurationNames,
} from "@/utils/geometry";
import { PolygonType } from "@/classes/polygons/PolygonType";

describe("extractDataFromPolygonName", () => {
	it("regular polygon", () => {
		expect(extractDataFromPolygonName("4")).toEqual({
			type: PolygonType.REGULAR,
			n: 4,
		});
	});

	it("regular star", () => {
		const data = extractDataFromPolygonName("{5.2}");
		expect(data.type).toBe(PolygonType.STAR_REGULAR);
		expect(data.n).toBe(5);
		expect(data.d).toBe(2);
	});
});

describe("comparePolygonNames", () => {
	it("sorts regular by n", () => {
		const names = ["4", "3", "6"];
		names.sort(comparePolygonNames);
		expect(names).toEqual(["3", "4", "6"]);
	});

	it("regular before star", () => {
		expect(comparePolygonNames("4", "{5.2}")).toBeLessThan(0);
	});
});

describe("compareVertexConfigurationNames", () => {
	it("splits on comma and sorts part-by-part", () => {
		const a = "3,3,3,3,3,3"; // 3^6
		const b = "3,3,3,3,6";    // 3^4.6
		expect(compareVertexConfigurationNames(a, b)).toBeLessThan(0);
	});
});
