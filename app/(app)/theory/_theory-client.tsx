"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Components } from "react-markdown";
import { PageSidebar } from "@/components/page-sidebar";
import { TheorySidebar, type TheorySection } from "@/components/theory-sidebar";
import { TheoryArticleNav } from "@/components/theory-article-nav";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { InteractiveTilingPreviewCard, CARD_LAYOUT_SPRING } from "@/components/interactive-tiling-preview-card";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

interface TheoryClientProps {
	content: string;
	sections: TheorySection[];
	/** Atlas id -> render cell for the tilings the markdown embeds via `<tiling-card tiling="…">`. */
	cells: Record<string, TranslationalCellData>;
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

export function TheoryClient({ content, sections, cells, currentSlug }: TheoryClientProps) {
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
				return <InteractiveTilingPreviewCard cell={cell} tilingId={tiling} title={title} />;
			},
			// <card-grid cols="3"> … </card-grid> — a responsive grid for a run of cards. Mapped to a
			// component (rather than authored classes) so Tailwind never needs to scan the markdown,
			// and so expansion can animate the whole neighbourhood (see AnimatedCardGrid).
			"card-grid": AnimatedCardGrid,
		};
		return map as unknown as Components;
	}, [cells]);

	return (
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
	);
}
