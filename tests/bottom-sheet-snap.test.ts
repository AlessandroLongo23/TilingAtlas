import { describe, expect, it } from "vitest";
import { pickSnap } from "@/components/ui/bottom-sheet";

// Resting heights of peek / half / full on a 664px-tall phone.
const SNAPS = [68, 332, 616];

describe("pickSnap (dock sheet release)", () => {
	it("settles on the nearest snap when released slowly", () => {
		expect(pickSnap(100, 0, SNAPS)).toBe(0);
		expect(pickSnap(300, 0, SNAPS)).toBe(1);
		expect(pickSnap(560, 0, SNAPS)).toBe(2);
	});
	it("projects a slow throw a little ahead of the release point", () => {
		// 190px is nearer peek, but moving up at 0.4px/ms projects to 250, nearer half.
		expect(pickSnap(190, 0.4, SNAPS)).toBe(1);
	});
	it("a fling goes to the next snap in its direction, however short the drag", () => {
		expect(pickSnap(80, 1, SNAPS)).toBe(1);
		expect(pickSnap(340, 1, SNAPS)).toBe(2);
		expect(pickSnap(600, -1, SNAPS)).toBe(1);
		expect(pickSnap(320, -1, SNAPS)).toBe(0);
	});
	it("a fling past the last snap stays on it", () => {
		expect(pickSnap(616, 2, SNAPS)).toBe(2);
		expect(pickSnap(68, -2, SNAPS)).toBe(0);
	});
});
