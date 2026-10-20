"use client";

import type { ComponentType } from "react";
import { KuSwitch } from "@/components/about/figures/kuniform/switch";
import { KuVertexTypes } from "@/components/about/figures/kuniform/vertex-types";
import { KuOctagon } from "@/components/about/figures/kuniform/octagon";
import { KuCounts } from "@/components/about/figures/kuniform/counts";
import { KuStarShape } from "@/components/about/figures/kuniform/star-shape";
import { KuBubble, KuHollow, KuTegula } from "@/components/about/figures/kuniform/live";

/** Article figure tags owned by this file, mapped to their components (see components/about/about-article.tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tags arrive as string attributes from rehype-raw
export const FIGURES_KUNIFORM: Record<string, ComponentType<any>> = {
	// The /play shelf's articles: k-uniform, star and isotoxal, other tiles.
	"ku-switch": KuSwitch,
	"ku-vertex-types": KuVertexTypes,
	"ku-octagon": KuOctagon,
	"ku-counts": KuCounts,
	"ku-star-shape": KuStarShape,
	"ku-tegula": KuTegula,
	"ku-bubble": KuBubble,
	"ku-hollow": KuHollow,
};
