import { beforeEach, describe, expect, it } from "vitest";
import { canRedo, canReset, canUndo, useStudio } from "@/stores/studio";

/**
 * The session's boundaries, which are the part of this store that can be wrong silently.
 *
 * A doc names edges, rings and vertices by content key, so it only means something against the cell it
 * was built on. The dangerous failure is not a crash: it is a key from tiling A resolving onto some
 * unrelated edge of tiling B, which draws a plausible edit nobody asked for. `openOn` is the guard, and
 * it has to draw the line in both directions, dropping the work on a new cell and keeping it on the
 * same one, because leaving the editor and coming back is a normal thing to do.
 */

const session = () => useStudio.getState();

describe("useStudio session boundaries", () => {
	beforeEach(() => {
		session().clear();
		useStudio.setState({ cellId: null, periodMode: "lattice", tool: "select" });
	});

	it("openOn stamps the cell it opened on", () => {
		session().openOn("tiling-a");
		expect(session().cellId).toBe("tiling-a");
		expect(canReset(session())).toBe(false);
	});

	it("a different cell drops the edit and the history", () => {
		session().openOn("tiling-a");
		session().edit((d) => ({ ...d, dropped: ["3,4,0,0"] }));
		session().edit((d) => ({ ...d, paint: { ...d.paint, "ring#1": 3 } }));
		expect(canUndo(session())).toBe(true);
		expect(canReset(session())).toBe(true);

		session().openOn("tiling-b");
		expect(session().cellId).toBe("tiling-b");
		expect(session().doc.dropped).toEqual([]);
		expect(session().doc.paint).toEqual({});
		// The history goes with it: an undo into the previous tiling's doc would be the same bug wearing
		// a different hat.
		expect(canUndo(session())).toBe(false);
		expect(canRedo(session())).toBe(false);
		expect(canReset(session())).toBe(false);
	});

	it("the same cell keeps the edit, so leaving and re-entering the editor costs nothing", () => {
		session().openOn("tiling-a");
		session().edit((d) => ({ ...d, dropped: ["3,4,0,0"] }));
		session().openOn("tiling-a");
		expect(session().doc.dropped).toEqual(["3,4,0,0"]);
		expect(canUndo(session())).toBe(true);
	});

	it("openOn drops an uncommitted cut path and a standing refusal", () => {
		session().openOn("tiling-a");
		useStudio.setState({
			cutPath: [{ kind: "vertex", vi: 0, off: [0, 0] }],
			rejection: { code: "degenerate", message: "there is already an edge along that line" },
		});
		session().openOn("tiling-b");
		expect(session().cutPath).toEqual([]);
		expect(session().rejection).toBeNull();
	});

	it("keeps the tool and the period mode, which are preferences and not edits", () => {
		useStudio.setState({ tool: "cut", periodMode: "wallpaper" });
		session().openOn("tiling-a");
		session().openOn("tiling-b");
		expect(session().tool).toBe("cut");
		expect(session().periodMode).toBe("wallpaper");
	});
});
