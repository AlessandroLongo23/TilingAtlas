"use client";

import type { ComponentType } from "react";
import { FdCatalogueFigure, FdDrawFigure, FdSolidFigure } from "./edges-life/freedraw";
import { CaLifeFigure, CaSemanticsFigure, CaSurfacesFigure } from "./edges-life/life";

/** Article figure tags owned by this file, mapped to their components (see components/about/about-article.tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tags arrive as string attributes from rehype-raw
export const FIGURES_EDGES_LIFE: Record<string, ComponentType<any>> = {
	// <fd-draw caption="…">: a period of the square grid to draw on; the tiles fall out.
	"fd-draw": FdDrawFigure,
	// <fd-catalogue grids="square,triangle,hex" caption="…"> or <fd-catalogue ids="fd-2-003,…" labels="…">
	"fd-catalogue": FdCatalogueFigure,
	// <fd-solid solid="octahedron" caption="…">: a Platonic-solid pattern, by solid and k.
	"fd-solid": FdSolidFigure,
	// <ca-life rules="B3/S23,…" caption="…"> <tiling-card tiling="…" title="…"> … </ca-life>
	"ca-life": CaLifeFigure,
	// <ca-semantics rule="B3/S23" caption="…"> <tiling-card …> … </ca-semantics>
	"ca-semantics": CaSemanticsFigure,
	// <ca-surfaces caption="…"> <tiling-card …> … </ca-surfaces>
	"ca-surfaces": CaSurfacesFigure,
};
