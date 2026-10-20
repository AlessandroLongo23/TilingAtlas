"use client";

// An article page beside its explorer (lib/about-pages.ts): the markdown, its live figures, the
// shelf's articles in the left margin, and the corner button back to the explorer. The markdown names
// its figures as custom tags; each tag's records come from the server (lib/about/load.ts).

import { useContext, useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import type { AboutArticle, AboutSection } from "@/lib/about-pages";
import type { AboutData } from "@/lib/about/load";
import { ArticleCorner } from "@/components/about-corner-button";
import { ArticleIndex, ArticleSiblings } from "@/components/about/article-index";
import { CardGrid, InCardGrid } from "@/components/about/card-grid";
import { AboutDataContext } from "@/components/about/data-context";
import { Figure } from "@/components/about/figure";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { HyperbolicFigureCard } from "@/components/hyperbolic-figure-card";
import { SquaringExampleCard } from "@/components/squaring/squaring-example-card";
import { DebtFigure, FrameFigure } from "@/components/frames/frame-figures";
import { FIGURES_APERIODIC } from "@/components/about/figures/aperiodic";
import { FIGURES_EDGES_LIFE } from "@/components/about/figures/edges-life";
import { FIGURES_GEOMETRY } from "@/components/about/figures/geometry";
import { FIGURES_HEESCH_COLORS_PARQUET } from "@/components/about/figures/heesch-colors-parquet";
import { FIGURES_KUNIFORM } from "@/components/about/figures/kuniform";
import { FIGURES_SHAPES } from "@/components/about/figures/shapes";
import { PreviewOverlayScope } from "@/lib/hooks/usePreviewOverlays";
import { orbitsFor } from "@/lib/defense/orbitCache";
import { symmetryFor } from "@/lib/services/symmetryCache";

type Tag = Record<string, string | undefined>;

function Missing({ what }: { what: string }) {
	return (
		<div className="not-prose flex aspect-square items-center justify-center border border-line p-4 text-center text-xs text-fg-muted">
			{what}
		</div>
	);
}

/** A tiling card: a cell of a card grid, or on its own a figure as wide as the text with its caption. */
function TilingFigure({
	tiling,
	title,
	caption,
	cells,
	sources,
}: { tiling?: string; title?: string; caption?: string } & Pick<AboutData, "cells" | "sources">) {
	const inGrid = useContext(InCardGrid);
	const cell = tiling ? cells[tiling] : undefined;
	if (!tiling || !cell) return <Missing what={`Unknown tiling id: ${tiling ?? "(none)"}`} />;
	// The exact cell is what the o / s / d overlays are drawn from; both derivations cache.
	const source = sources[tiling];
	const card = (
		<InteractiveTilingPreviewCard
			cell={cell}
			tilingId={tiling}
			title={title}
			square
			orbitData={source ? orbitsFor(tiling, source) : null}
			symmetryData={source ? symmetryFor(tiling, source) : null}
			{...(inGrid ? {} : { showExpand: false, homePeriods: 4, className: "aspect-[16/9]!" })}
		/>
	);
	return inGrid ? card : <Figure caption={caption}>{card}</Figure>;
}

function useFigures({ cells, sources, patches, squarings }: AboutData) {
	return useMemo(
		() =>
			({
				...FIGURES_GEOMETRY,
				...FIGURES_KUNIFORM,
				...FIGURES_APERIODIC,
				...FIGURES_SHAPES,
				...FIGURES_HEESCH_COLORS_PARQUET,
				...FIGURES_EDGES_LIFE,
				// <tiling-card tiling="t1005" title="4.4.4.4" caption="…"> — the /play canvas in miniature.
				"tiling-card": (tag: Tag) => <TilingFigure {...tag} cells={cells} sources={sources} />,
				// <hyperbolic-card patch="hyp-4-4-4-6" label="4.4.4.6" caption="…"> — a Poincaré-disk figure.
				"hyperbolic-card": ({ patch, label, caption }: Tag) => {
					const record = patch ? patches[patch] : undefined;
					if (!patch || !record) return <Missing what={`Unknown patch id: ${patch ?? "(none)"}`} />;
					return <HyperbolicFigureCard patchId={patch} patch={record} label={label} caption={caption} />;
				},
				// <squaring-card solid="cube" caption="…"> — a solid beside the rectangle it produces.
				"squaring-card": ({ solid, caption }: Tag) => {
					const record = solid ? squarings[solid] : undefined;
					if (!record) return <Missing what={`Unknown squaring: ${solid ?? "(none)"}`} />;
					return <SquaringExampleCard record={record} caption={caption} />;
				},
				// <card-grid cols="3" caption="…"> … </card-grid> — a run of cards in one figure.
				"card-grid": CardGrid,
				"frame-figure": ({ set = "", shape = "0", frame = "0", caption }: Tag) => (
					<FrameFigure set={set} shape={Number(shape)} frame={Number(frame)} caption={caption} />
				),
				"debt-figure": ({ set = "", shape = "0", frame = "0", caption }: Tag) => (
					<DebtFigure set={set} shape={Number(shape)} frame={Number(frame)} caption={caption} />
				),
				// <atlas-figure src="/theory/images/…" caption="…"> — a picture at full column width.
				"atlas-figure": ({ src, caption }: Tag) => (
					<Figure caption={caption} className="p-3">
						{/* eslint-disable-next-line @next/next/no-img-element -- a static file under /public, shown at its own size */}
						<img src={src} alt={caption ?? ""} className="block h-auto w-full" />
					</Figure>
				),
			}) as unknown as Components,
		[cells, sources, patches, squarings],
	);
}

export function AboutArticlePage({
	section,
	article,
	data,
}: {
	section: AboutSection;
	article: AboutArticle;
	data: AboutData;
}) {
	const components = useFigures(data);
	const root = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState("");
	return (
		// One overlay scope for the whole article: o / s / d with no card focused toggle every preview.
		<PreviewOverlayScope>
			<AboutDataContext value={data}>
				<div className="relative min-h-0 w-full flex-1">
					<ArticleCorner />
					<div ref={root} className="@container relative h-full w-full max-md:[&_h1]:pr-14">
						<ArticleIndex root={root} active={active} content={data.content} section={section} article={article} />
						<MarkdownRenderer
							content={data.content}
							components={components}
							onSectionActive={setActive}
							header={<ArticleSiblings section={section} article={article} />}
						/>
					</div>
				</div>
			</AboutDataContext>
		</PreviewOverlayScope>
	);
}
