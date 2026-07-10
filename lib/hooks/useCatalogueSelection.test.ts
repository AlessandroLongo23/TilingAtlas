import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useCatalogueSelection } from "./useCatalogueSelection";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

const T = (k: number, key: string): CatalogueTiling => ({
	canonicalKey: key,
	k,
	family: "3.3.3.3.3.3",
	renderCell: null,
	certified: true,
	runIds: [],
});

const sorted = [T(1, "a"), T(2, "b"), T(3, "c")];

describe("useCatalogueSelection", () => {
	it("seeds from the requested URL key on mount", () => {
		const { result } = renderHook(({ rk }) => useCatalogueSelection(sorted, rk), {
			initialProps: { rk: "b" as string | null },
		});
		expect(result.current.selected?.canonicalKey).toBe("b");
	});

	it("falls back to the first tiling when no key is requested", () => {
		const { result } = renderHook(({ rk }) => useCatalogueSelection(sorted, rk), {
			initialProps: { rk: null as string | null },
		});
		expect(result.current.selected?.canonicalKey).toBe("a");
	});

	// The reported bug: with ?tiling=a in the URL, picking another tiling in the /play sidebar snapped
	// back to "a" because the sync effect re-asserted the URL key on every selection change.
	it("keeps a manual in-page pick while the URL key is unchanged", () => {
		const { result } = renderHook(({ rk }) => useCatalogueSelection(sorted, rk), {
			initialProps: { rk: "a" as string | null },
		});
		act(() => result.current.setSelected(sorted[2])); // pick "c" in the sidebar
		expect(result.current.selected?.canonicalKey).toBe("c");
	});

	// "Open in Play" on a second tiling changes the URL param; the viewer must follow it.
	it("follows a new URL key (open-in-play with a different tiling)", () => {
		const { result, rerender } = renderHook(({ rk }) => useCatalogueSelection(sorted, rk), {
			initialProps: { rk: "a" as string | null },
		});
		rerender({ rk: "b" });
		expect(result.current.selected?.canonicalKey).toBe("b");
	});

	// A manual pick followed by re-opening the same URL key should still re-assert that key.
	it("re-applies the URL key even after a manual pick when re-navigated to it", () => {
		const { result, rerender } = renderHook(({ rk }) => useCatalogueSelection(sorted, rk), {
			initialProps: { rk: "a" as string | null },
		});
		act(() => result.current.setSelected(sorted[1])); // pick "b"
		rerender({ rk: "c" }); // open-in-play "c"
		expect(result.current.selected?.canonicalKey).toBe("c");
	});
});
