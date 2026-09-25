import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLayerEntry } from "@/lib/hooks/useModalLayer";

// The layer stack's history work (lib/hooks/useModalLayer.ts), on a phone-width jsdom: a query the page
// rewrites while a sheet is open survives the sheet closing, and a navigation from inside a sheet takes
// the sheet's entry, so the history holds one entry per page.

beforeAll(() => {
	// Phone width: useIsPhone reads this query.
	window.matchMedia = ((q: string) => ({
		matches: q.includes("max-width"),
		media: q,
		addEventListener: () => {},
		removeEventListener: () => {},
	})) as unknown as typeof window.matchMedia;
	// Next's router, added after the layer module's own listener: a pop it sees renders the entry it
	// landed on, which still holds the URL from before the sheet opened. The layer pops must not reach it.
	window.addEventListener("popstate", () => history.replaceState(null, "", "/router-saw-the-pop"));
});

/** Lets the batched history work run, then the popstate it causes land. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 60)));

afterEach(async () => {
	await settle();
});

describe("useLayerEntry history", () => {
	it("keeps a query the page wrote while the layer was open", async () => {
		history.replaceState(null, "", "/library");
		const start = history.length;
		const { rerender } = renderHook(({ open }) => useLayerEntry(open, () => {}), { initialProps: { open: true } });
		await settle();
		expect(history.length).toBe(start + 1);
		history.replaceState(null, "", "/library?geo=spherical");
		rerender({ open: false });
		await settle();
		expect(location.pathname + location.search).toBe("/library?geo=spherical");
		expect(history.state?.__taLayer).toBeUndefined();
	});

	it("Back closes the layer and stays on the page with its query", async () => {
		history.replaceState(null, "", "/colors");
		const onClose = vi.fn();
		renderHook(() => useLayerEntry(true, onClose));
		await settle();
		history.replaceState(null, "", "/colors?g=hex");
		history.back();
		await settle();
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(location.pathname + location.search).toBe("/colors?g=hex");
	});

	it("a navigation from inside the layer replaces its entry and closes it", async () => {
		history.replaceState(null, "", "/freedraw");
		const onClose = vi.fn();
		renderHook(() => useLayerEntry(true, onClose));
		await settle();
		const withLayer = history.length;
		history.pushState(null, "", "/play?tiling=t1001");
		await settle();
		expect(history.length).toBe(withLayer);
		expect(location.pathname).toBe("/play");
		expect(history.state?.__taLayer).toBeUndefined();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
