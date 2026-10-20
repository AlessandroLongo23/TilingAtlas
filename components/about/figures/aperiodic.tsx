"use client";

import type { ComponentType } from "react";
import { MultigridFigure, SubRosaFigure } from "./aperiodic/multigrid";
import { RandomFigure, RuleFigure, SubstitutionFigure } from "./aperiodic/substitution";

/** Article figure tags owned by this file, mapped to their components (see components/about/about-article.tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tags arrive as string attributes from rehype-raw
export const FIGURES_APERIODIC: Record<string, ComponentType<any>> = {
	"ap-substitution": SubstitutionFigure,
	"ap-rule": RuleFigure,
	"ap-random": RandomFigure,
	"mg-dual": MultigridFigure,
	"sr-rule": SubRosaFigure,
};
