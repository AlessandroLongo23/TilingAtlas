"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { PeriodicCell } from "@/lib/render/periodicCell";
import { tilingPeriodicCell } from "@/lib/render/periodic/tilings";
import { colorsPeriodicCell } from "@/lib/render/periodic/colorings";
import { edgesPeriodicCell } from "@/lib/render/periodic/edges";
import { hollowPeriodicCell } from "@/lib/render/periodic/hollow";
import { islamicPeriodicCell, type IslamicStyle } from "@/lib/render/periodic/islamic";
import { analyseFaces } from "@/lib/freedraw/faces";
import { loadHollowPatch, type HollowPatch } from "@/lib/hollow/pattern";
import { DEFAULT_HOLLOW_STYLE } from "@/lib/hollow/render";
import { useConfiguration } from "@/stores/configuration";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

/**
 * The one place that decides what the conformal lens draws for a given selection: it turns whichever
 * Euclidean class is selected into the shared PeriodicCell IR. Adding a class to the inversive view means
 * adding a branch here and an adapter under lib/render/periodic — nothing in the renderer changes.
 *
 * Returns a null cell for anything with no periodic representation (hyperbolic, spherical), which blanks
 * the canvas; callers gate on geometry before mounting it anyway.
 */
export function useInversiveCell(
	selected: CatalogueTiling | null,
	renderCell: TranslationalCellData | null,
): { cell: PeriodicCell | null; cellId: string | null } {
	const dark = useDarkTheme();
	// Style inputs the colour-bearing adapters bake into their primitives. Narrow subscriptions, so a
	// change to any other view option doesn't repack the cell.
	const colorsEdges = useConfiguration((s) => s.colorsEdges);
	const colorsPalette = useConfiguration((s) => s.colorsPalette);
	const freedrawFill = useConfiguration((s) => s.freedrawFill);
	const freedrawScaffold = useConfiguration((s) => s.freedrawScaffold);
	// The Islamic construction is a TOGGLE over a tiling, not a shelf of its own. Each slider gets its own
	// narrow selector: a selector returning a fresh object would hand zustand a new reference every render
	// and spin the component forever.
	const isIslamic = useConfiguration((s) => s.isIslamic);
	const islamicStyle = useConfiguration((s) => s.islamicStyle) as IslamicStyle;
	const islamicAngle = useConfiguration((s) => s.islamicAngle);
	const islamicEdgeOffset = useConfiguration((s) => s.islamicEdgeOffset);
	const islamicIntersectionCount = useConfiguration((s) => s.islamicIntersectionCount);
	const islamicBandWidth = useConfiguration((s) => s.islamicBandWidth);
	const islamicOutlineWidth = useConfiguration((s) => s.islamicOutlineWidth);
	const islamicChirality = useConfiguration((s) => s.islamicChirality);
	const islamicCheckerHueA = useConfiguration((s) => s.islamicCheckerHueA);
	const islamicCheckerHueB = useConfiguration((s) => s.islamicCheckerHueB);
	const islamicFillHueB = useConfiguration((s) => s.islamicFillHueB);
	const islamicFillHueC = useConfiguration((s) => s.islamicFillHueC);
	const islamic = useMemo(
		() => ({
			style: islamicStyle,
			angle: islamicAngle,
			edgeOffset: islamicEdgeOffset,
			intersectionCount: islamicIntersectionCount,
			bandWidth: islamicBandWidth,
			outlineWidth: islamicOutlineWidth,
			chirality: islamicChirality,
			checkerHueA: islamicCheckerHueA,
			checkerHueB: islamicCheckerHueB,
			fillHueB: islamicFillHueB,
			fillHueC: islamicFillHueC,
		}),
		[islamicStyle, islamicAngle, islamicEdgeOffset, islamicIntersectionCount, islamicBandWidth,
			islamicOutlineWidth, islamicChirality, islamicCheckerHueA, islamicCheckerHueB,
			islamicFillHueB, islamicFillHueC],
	);
	const islamicKey = Object.values(islamic).join(",");

	// The face analysis walks the whole period, so it is memoised on the pattern rather than recomputed
	// whenever a style toggle moves.
	const faceAnalysis = useMemo(
		() => (selected?.freedraw ? analyseFaces(selected.freedraw) : null),
		[selected],
	);

	// A hollow patch is lazy-fetched (public/hollow/<id>.json), so the cell arrives one tick after the
	// selection. `loadHollowPatch` caches per id, so switching back to a seen tiling resolves instantly.
	const hollowId = selected?.hollow?.patch ?? null;
	const [hollowPatch, setHollowPatch] = useState<HollowPatch | null>(null);
	useEffect(() => {
		if (!hollowId) {
			setHollowPatch(null);
			return;
		}
		let live = true;
		loadHollowPatch(hollowId)
			.then((p) => { if (live) setHollowPatch(p); })
			.catch(() => { if (live) setHollowPatch(null); });
		return () => { live = false; };
	}, [hollowId]);

	const cell = useMemo<PeriodicCell | null>(() => {
		if (!selected) return null;
		if (selected.colors) {
			return colorsPeriodicCell(selected.colors, { dark, palette: colorsPalette, edges: colorsEdges });
		}
		if (selected.freedraw && faceAnalysis) {
			return edgesPeriodicCell(selected.freedraw, {
				dark, fillMode: freedrawFill, showScaffold: freedrawScaffold, analysis: faceAnalysis,
			});
		}
		if (selected.hollow) {
			// Null until the patch lands; the canvas blanks for that one tick rather than drawing the
			// throwaway cell hollow entries carry.
			return hollowPatch ? hollowPeriodicCell(hollowPatch, { dark, fillMode: DEFAULT_HOLLOW_STYLE.fillMode }) : null;
		}
		// The Hankin construction replaces the plain tiling wherever it applies — the same precedence the
		// flat renderers use, where the Islamic layers own the fill and p5 skips its own.
		if (isIslamic) {
			const built = islamicPeriodicCell(renderCell, islamic);
			if (built) return built;
		}
		return tilingPeriodicCell(renderCell);
		// islamicKey stands in for the `islamic` object, which is rebuilt on every store read.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected, renderCell, dark, colorsPalette, colorsEdges, freedrawFill, freedrawScaffold, faceAnalysis, hollowPatch, isIslamic, islamicKey]);

	// The id changes whenever the geometry or its baked colours do, so the canvas re-uploads exactly then.
	const styleKey = `${dark ? "d" : "l"}:${colorsEdges ? 1 : 0}:${colorsPalette.join(",")}:${freedrawFill}:${freedrawScaffold ? 1 : 0}:${isIslamic ? islamicKey : "-"}`;
	const cellId = useMemo(
		() => (cell && selected ? `${selected.canonicalKey}::${styleKey}` : null),
		[cell, selected, styleKey],
	);

	return { cell, cellId };
}

/** `dark` as reactive state. The theme lives as a class on <html> (no context to subscribe to), so watch
 *  the attribute — a toggle has to rebuild any cell that baked theme colours into its primitives. */
export function useDarkTheme(): boolean {
	const [dark, setDark] = useState(false);
	useEffect(() => {
		const read = () => setDark(document.documentElement.classList.contains("dark"));
		read();
		const mo = new MutationObserver(read);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		return () => mo.disconnect();
	}, []);
	return dark;
}
