"use client";

import type { ComponentType } from "react";
import { ColoringsFigure } from "./hcp/colors";
import { CoronaFigure, HeeschCensusFigure } from "./hcp/heesch";
import { ParquetEdgeFigure, ParquetStripFigure, ParquetTurnFigure } from "./hcp/parquet";

/** Article figure tags owned by this file, mapped to their components (see components/about/about-article.tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tags arrive as string attributes from rehype-raw
export const FIGURES_HEESCH_COLORS_PARQUET: Record<string, ComponentType<any>> = {
	// <hcp-corona set="omino11" shapes="0,1" caption="…">: a witness patch, one corona at a time.
	"hcp-corona": CoronaFigure,
	// <hcp-heesch-census caption="…">: the counts per size and Heesch number.
	"hcp-heesch-census": HeeschCensusFigure,
	// <hcp-colorings grids="square,hex" colors="2,3" ks="1,2,3" show="8" caption="…">
	"hcp-colorings": ColoringsFigure,
	"hcp-parquet-strip": ParquetStripFigure,
	"hcp-parquet-edge": ParquetEdgeFigure,
	"hcp-parquet-turn": ParquetTurnFigure,
};
