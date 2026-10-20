"use client";

import type { ComponentType } from "react";
import { IsoEdgeFigure, IsoMarkedFigure, IsoTypeFigure } from "./shapes/isohedral";
import { PentHistoryFigure, PentTypeFigure } from "./shapes/pentagons";

/** Article figure tags owned by this file, mapped to their components (see components/about/about-article.tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tags arrive as string attributes from rehype-raw
export const FIGURES_SHAPES: Record<string, ComponentType<any>> = {
	"iso-type-figure": IsoTypeFigure,
	"iso-edge-figure": IsoEdgeFigure,
	"iso-marked-figure": IsoMarkedFigure,
	"pent-type-figure": PentTypeFigure,
	"pent-history-figure": PentHistoryFigure,
};
