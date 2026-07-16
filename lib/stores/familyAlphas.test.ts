import { describe, it, expect, beforeEach } from "vitest";
import { useFamilyAlphas } from "@/stores/familyAlphas";

describe("useFamilyAlphas", () => {
	beforeEach(() => useFamilyAlphas.setState({ values: null, live: null }));

	it("set writes the target values and leaves live untouched (a slider/scrub tick keeps the ease going)", () => {
		useFamilyAlphas.setState({ live: [40] });
		useFamilyAlphas.getState().set([50]);
		expect(useFamilyAlphas.getState().values).toEqual([50]);
		expect(useFamilyAlphas.getState().live).toEqual([40]);
	});

	it("resetLive nulls live and leaves values (a selection change forces the render tuple to reseed)", () => {
		useFamilyAlphas.setState({ values: [50], live: [40] });
		useFamilyAlphas.getState().resetLive();
		expect(useFamilyAlphas.getState().live).toBeNull();
		expect(useFamilyAlphas.getState().values).toEqual([50]);
	});
});
