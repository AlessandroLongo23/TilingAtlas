"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Components } from "react-markdown";
import { PageSidebar } from "@/components/page-sidebar";
import { TheorySidebar, type TheorySection } from "@/components/theory-sidebar";
import { TheoryArticleNav } from "@/components/theory-article-nav";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { InteractiveTilingPreviewCard, CARD_LAYOUT_SPRING } from "@/components/interactive-tiling-preview-card";
import { HyperbolicFigureCard } from "@/components/hyperbolic-figure-card";
import { PreviewOverlayScope } from "@/lib/hooks/usePreviewOverlays";
import { orbitsFor } from "@/lib/defense/orbitCache";
import { symmetryFor } from "@/lib/services/symmetryCache";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import type { CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

interface TheoryClientProps {
	content: string;
	sections: TheorySection[];
	/** Atlas id -> render cell for the tilings the markdown embeds via `<tiling-card tiling="…">`. */
	cells: Record<string, TranslationalCellData>;
	/**
	 * Atlas id -> exact cell, for the same tilings. What the three card overlays are computed from:
	 * vertex orbits (`o`), symmetry elements (`s`), fundamental domain (`d`). Optional — an article
	 * that ships none simply has three dead keys.
	 */
	sources?: Record<string, ExactCellSource>;
	/**
	 * Patch id -> developed record for the tilings the markdown embeds via `<hyperbolic-card patch="…">`.
	 * Only the ones an article actually shows — the full catalogue is 11.6 MB.
	 */
	patches?: Record<string, CataloguePatch>;
	/** The current article's slug, for the sidebar article switcher. */
	currentSlug: string;
}

// Props rehype-raw hands the custom markdown elements (lowercase HTML attributes pass through as-is).
// `subtitle` is accepted (older content carries it) but no longer rendered — the card shows no captions.
interface TilingCardTagProps {
	tiling?: string;
	title?: string;
	subtitle?: string;
}

interface HyperbolicCardTagProps {
	patch?: string;
	label?: string;
	caption?: string;
}

// The grid a run of tiling cards renders into, built so a card expansion moves EVERYTHING smoothly:
// - LayoutGroup: a card's expansion only re-renders that card, so its siblings would never re-measure
//   and would snap to their reflowed spots. The group makes every card FLIP whenever one changes.
// - Animated real height on the wrapper: FLIP is transforms-only — the grid's actual height still
//   jumps instantly, snapping all the prose below. A ResizeObserver feeds the grid's true height into
//   a motion-animated `height` on the wrapper, so the document flow itself eases (same spring as the
//   FLIP, one visual movement). Animating a real layout property is deliberate here — it's the only
//   way to push static content — and it's one property on one element on a rare interaction.
// Module-level (not recreated per render) so the wrapper's height state survives re-renders.
function AnimatedCardGrid({ cols, children }: { cols?: string; children?: React.ReactNode }) {
	const innerRef = useRef<HTMLDivElement | null>(null);
	const [height, setHeight] = useState<number | "auto">("auto");
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		const el = innerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	return (
		<motion.div
			className="not-prose my-8"
			initial={false}
			animate={{ height }}
			transition={reduceMotion ? { duration: 0 } : CARD_LAYOUT_SPRING}
		>
			<div
				ref={innerRef}
				className={
					cols === "2"
						? "grid grid-cols-1 gap-5 sm:grid-cols-2"
						: "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
				}
			>
				<LayoutGroup>{children}</LayoutGroup>
			</div>
		</motion.div>
	);
}

export function TheoryClient({ content, sections, cells, sources, patches, currentSlug }: TheoryClientProps) {
	const [targetSection, setTargetSection] = useState("");
	const [activeSection, setActiveSection] = useState("");
	const progressRef = useRef<HTMLDivElement | null>(null);

	const handleScroll = useCallback((scroller: HTMLDivElement) => {
		const bar = progressRef.current;
		if (!bar) return;
		const max = scroller.scrollHeight - scroller.clientHeight;
		const progress = max > 0 ? scroller.scrollTop / max : 0;
		bar.style.transform = `scaleX(${progress})`;
	}, []);

	// The custom elements the theory markdown may use. `Components` only knows real HTML tag names,
	// hence the cast — the mapping itself is what rehype-raw + react-markdown resolve at render time.
	const components = useMemo(() => {
		const map = {
			// <tiling-card tiling="t1005" title="4.4.4.4 · square">
			"tiling-card": ({ tiling, title }: TilingCardTagProps) => {
				const cell = tiling ? cells[tiling] : undefined;
				if (!cell) {
					return (
						<div className="not-prose flex aspect-square items-center justify-center rounded-2xl border border-line bg-surface-overlay/30 p-4 text-center text-xs text-fg-muted">
							Unknown tiling id: {tiling ?? "(none)"}
						</div>
					);
				}
				// The exact cell, when the article ships one, is what the o / s / d overlays are drawn
				// from. Both derivations cache per tiling, so a keypress costs nothing after the first.
				const source = tiling ? sources?.[tiling] : undefined;
				return (
					<InteractiveTilingPreviewCard
						cell={cell}
						tilingId={tiling}
						title={title}
						orbitData={tiling && source ? orbitsFor(tiling, source) : null}
						symmetryData={tiling && source ? symmetryFor(tiling, source) : null}
					/>
				);
			},
			// <hyperbolic-card patch="hyp-4-4-4-6" label="4.4.4.6" caption="…">
			// A Poincaré-disk figure. Static by design (see HyperbolicFigureCard) — the interactive view
			// of the same tiling is one click away in /play.
			"hyperbolic-card": ({ patch, label, caption }: HyperbolicCardTagProps) => {
				const record = patch ? patches?.[patch] : undefined;
				if (!record) {
					return (
						<div className="not-prose flex aspect-square items-center justify-center border border-line bg-surface-overlay/30 p-4 text-center text-xs text-fg-muted">
							Unknown patch id: {patch ?? "(none)"}
						</div>
					);
				}
				return <HyperbolicFigureCard patchId={patch} patch={record} label={label} caption={caption} />;
			},
			// <card-grid cols="3"> … </card-grid> — a responsive grid for a run of cards. Mapped to a
			// component (not authored classes) so Tailwind never needs to scan the markdown,
			// and so expansion can animate the whole neighbourhood (see AnimatedCardGrid).
			"card-grid": AnimatedCardGrid,
		};
		return map as unknown as Components;
	}, [cells, sources, patches]);

	return (
		// One overlay scope for the whole article: o / s / d with no card focused toggle every preview
		// on the page, and a focused card answers for itself.
		<PreviewOverlayScope>
			<div className="flex h-full min-h-0 w-full overflow-hidden">
			<PageSidebar scrollable={false}>
				<div className="flex h-full min-h-0 flex-col">
					<div className="shrink-0 border-b border-line-subtle pb-2">
						<TheoryArticleNav currentSlug={currentSlug} />
					</div>
					<div className="min-h-0 flex-1">
						<TheorySidebar
							sections={sections}
							activeSection={activeSection}
							onSectionSelect={setTargetSection}
						/>
					</div>
				</div>
			</PageSidebar>

			<div className="w-full min-w-0 flex flex-col overflow-hidden">
				<div className="h-0.5 w-full bg-transparent shrink-0">
					<div
						ref={progressRef}
						className="h-full bg-accent origin-left"
						style={{ transform: "scaleX(0)", width: "100%" }}
					/>
				</div>

				{content ? (
					<MarkdownRenderer
						content={content}
						targetSection={targetSection}
						onSectionActive={setActiveSection}
						onScroll={handleScroll}
						components={components}
					/>
				) : (
					<div className="w-full flex items-center justify-center p-8">
						<p className="text-fg-muted">No content available.</p>
					</div>
				)}
			</div>
			</div>
		</PreviewOverlayScope>
	);
}
