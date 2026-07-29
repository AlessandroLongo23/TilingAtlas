"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Maximize, Minimize, ExternalLink, Play, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCardActivation } from "@/lib/hooks/useCardActivation";
import { useFlatCellPreview } from "@/lib/hooks/useFlatCellPreview";
import { useCardOverlays, type OverlayState } from "@/lib/hooks/usePreviewOverlays";
import { seedFromCell } from "@/lib/render/seedPatch";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// A rounded-square interactive tiling preview — the /play canvas in miniature, one per tiling, for
// embedding in prose (the /theory page). The live surface itself is useFlatCellPreview (the same GL
// pipeline and interaction math /play's flat view runs on, shared with the landing wall's Play cell);
// this component is the frame around it: the expansion, the overlay buttons, the keyboard.
//
// A card is inert until clicked (useCardActivation) so wheel events keep scrolling the article and a
// stray drag doesn't yank the view while reading. Esc or clicking outside deactivates. `alwaysActive`
// opts out of all of that, for a host that never scrolls (the /defense deck).
//
// The three /play overlays ride along on /play's own keys — o = vertex orbits, s = symmetry elements,
// d = fundamental domain — scoped by focus: a focused card answers for itself, an unfocused page
// answers for every card in its scope (lib/hooks/usePreviewOverlays.tsx).

interface InteractiveTilingPreviewCardProps {
	cell: TranslationalCellData;
	/** Atlas id (e.g. "t1005"); when present, an overlay button deep-links to /play on this tiling. */
	tilingId?: string;
	/** Accessible name for the card, e.g. "3.3.4.3.4 · snub square". Not rendered visually. */
	title?: string;
	/** Lattice periods across the card at reset zoom. Wider cards want more, or the patch reads as
	 *  a crop of one tile instead of a tiling. Default 3 (the /theory prose cards). */
	homePeriods?: number;
	/** Vertex orbits for this tiling. Supplied ⇒ the `o` overlay has something to show: tiles dimmed,
	 *  a dot on every vertex coloured by orbit, and hovering one orbit grows all of its dots. */
	orbitData?: OrbitData | null;
	/** Exact wallpaper analysis. Supplied ⇒ the `s` and `d` overlays have something to show. */
	symmetryData?: SymmetryData | null;
	/** Overlays this card starts with, before anything touches a key. An `<orbit-card>` passes
	 *  `{ orbits: true }` — that is the whole difference between it and a plain tiling card. */
	initialOverlays?: Partial<OverlayState>;
	/** Show the expand button. Off where the card cannot usefully grow. */
	showExpand?: boolean;
	/** Show the deep-link to /play. Only ever rendered when `tilingId` is set. */
	showOpenInPlay?: boolean;
	/** Which icon that deep-link wears. "play" on a slide, where an audience reads a triangle as
	 *  "he is about to open this" faster than a link glyph. */
	openInPlayIcon?: "link" | "play";
	/**
	 * How the expand button grows the card.
	 *
	 * "inline" breaks it out to the full text-column width in flow, pushing the prose below it down —
	 * right for an article, where the expanded card is still part of the reading.
	 *
	 * "overlay" lifts it out of the layout to 90% of the viewport over a dimmed backdrop, still fully
	 * interactive, closed by the X, by Esc, or by clicking outside. Right for a slide: nothing behind
	 * it moves, so the room sees one thing get bigger instead of the whole slide rearranging.
	 */
	expandMode?: "inline" | "overlay";
	/**
	 * Skip click-to-activate: the surface owns the wheel and the drag from the moment the pointer is
	 * over it. Click-to-activate exists so a card cannot steal the wheel from a page the reader is
	 * SCROLLING (see useCardActivation); a slide does not scroll, so on the deck the click is pure
	 * friction — a demo mid-sentence should answer the first gesture, not the second. The focus ring
	 * goes with it: when every card is live, a ring on the one that happens to hold focus says
	 * nothing, and on a slide that rings three cards for a reason it says something false.
	 */
	alwaysActive?: boolean;
	/**
	 * Draw the tiling's SEED instead of the tiling: one vertex figure per orbit, cut out of the tiling
	 * where it lies and drawn once (lib/render/seedPatch.ts). This is the patch the symmetry-first
	 * method starts from, and the slide that describes that method is what it is for.
	 *
	 * Needs `orbitData` — without an orbit partition there is nothing to take one vertex of, so the
	 * card falls back to the whole tiling instead of blanking.
	 */
	seed?: boolean;
	/**
	 * Take no input: no drag, no wheel, no rotate, no right-click reset, and no expand button. The
	 * overlay keys still answer, since they belong to the page's scope, not to the surface.
	 *
	 * For a card that is making a point, not inviting exploration — a slide where the framing
	 * IS the argument and a stray gesture mid-sentence would cost more than the gesture is worth.
	 */
	interactive?: boolean;
	className?: string;
}

// How many lattice periods should span the card at reset zoom.
const HOME_PERIODS = 3;

// The one spring every expansion-related animation shares: the card's FLIP, its siblings' FLIP (via
// the grid's LayoutGroup), and the grid wrapper's real height (which pushes the prose below). One
// curve everywhere is what makes the reflow read as a single movement instead of three.
export const CARD_LAYOUT_SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

export function InteractiveTilingPreviewCard({
	cell,
	tilingId,
	title,
	homePeriods = HOME_PERIODS,
	orbitData = null,
	symmetryData = null,
	initialOverlays,
	showExpand = true,
	showOpenInPlay = true,
	openInPlayIcon = "link",
	expandMode = "inline",
	alwaysActive = false,
	seed = false,
	interactive = true,
	className,
}: InteractiveTilingPreviewCardProps) {
	const [expanded, setExpanded] = useState(false);
	const { active: focused, hostProps } = useCardActivation();
	// Identity for the overlay scope's per-card exceptions. Per INSTANCE, not per tiling: a slide can
	// show the same tiling twice, and toggling one of them must not toggle its twin.
	const cardId = useId();
	const { overlays, onOverlayKeyDown } = useCardOverlays(cardId, initialOverlays);
	// Focus still decides the ring; `live` decides who owns the input.
	const live = interactive && (alwaysActive || focused);
	// The seed is derived from the cell and the orbit partition, so it is recomputed only when either
	// changes — never on a toggle, and never per frame. Falls back to the whole tiling when there is no
	// partition to take one vertex of each orbit from.
	const drawnCell = useMemo(
		() => (seed && orbitData ? (seedFromCell(cell, orbitData) ?? cell) : cell),
		[seed, cell, orbitData],
	);
	const { hostRef, failed, pointerProps } = useFlatCellPreview({
		cell: drawnCell,
		// The `o` overlay decides whether the dots are DRAWN; the data only decides whether they can
		// be. A card with no orbit data ignores the key instead of blanking.
		orbitData: overlays.orbits ? orbitData : null,
		symmetryData,
		showFundamentalDomain: overlays.fundamentalDomain,
		showSymmetryElements: overlays.symmetry,
		showPolygonPoints: overlays.polygonPoints,
		homePeriods,
		single: seed,
		interactive,
		active: live,
	});

	// Overlay buttons live inside the focusable host, so their clicks must not start a drag; focus
	// moving to a button still counts as "inside" for the blur check in useCardActivation.
	const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

	const reduceMotion = useReducedMotion();
	// Lifted out of the layout, over a backdrop. The inline mode keeps its in-flow break-out instead.
	const lifted = expanded && expandMode === "overlay";

	return (
		<>
			{lifted ? (
				// Click-outside, and the only thing separating a 90% card from the slide behind it: without
				// a backdrop the two read as one picture.
				<motion.div
					initial={reduceMotion ? false : { opacity: 0 }}
					animate={{ opacity: 1 }}
					onClick={() => setExpanded(false)}
					className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
					aria-hidden
				/>
			) : null}
			{/* The slot. It holds the card's place so that lifting the card out of the layout moves
			    nothing behind it, and it carries the in-flow sizing for the inline expansion. */}
			<motion.div
				// Layout animation ONLY in inline mode, where the slot really does change size and push the
				// prose. In overlay mode the slot never moves, and an animating slot would be worse than
				// useless: motion animates by setting a transform, and a transformed ancestor becomes the
				// containing block for `position: fixed`, which would pin the lifted card to this box
				// instead of the viewport.
				layout={!reduceMotion && expandMode === "inline"}
				transition={reduceMotion ? { duration: 0 } : { layout: CARD_LAYOUT_SPRING }}
				className={cn(
					"relative",
					expanded && expandMode === "inline" ? "col-span-full aspect-[4/3]" : "aspect-square",
					className,
				)}
			>
				<motion.div
					ref={hostRef}
					layout={!reduceMotion}
					transition={reduceMotion ? { duration: 0 } : { layout: CARD_LAYOUT_SPRING }}
					role="application"
					aria-label={title ? `Interactive tiling preview: ${title}` : "Interactive tiling preview"}
					{...hostProps}
					{...pointerProps}
					// After the spread: an always-active card claims the touch gesture for panning, which is
					// what `hostProps.style` would only have granted it once focused. An inert one never
					// claims it — a touch there should scroll the page it sits on.
					style={{ touchAction: live ? "none" : "auto" }}
					onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
						// Esc closes the expansion and stops there — it must neither blur the card nor reach
						// the page, where (on the deck) it opens the slide overview.
						if (e.key === "Escape" && expanded) {
							e.preventDefault();
							e.stopPropagation();
							setExpanded(false);
							return;
						}
						// o / s / d belong to this card while it holds focus; the handler stops them before
						// they reach the page-level listener that would toggle every card.
						onOverlayKeyDown(e);
						if (e.defaultPrevented) return;
						hostProps.onKeyDown(e);
					}}
					className={cn(
						"group select-none overflow-hidden rounded-2xl border bg-surface-base outline-none",
						lifted ? "fixed inset-[5vh_5vw] z-50 shadow-2xl" : "absolute inset-0",
						// An inert card takes the default cursor: neither grab (nothing to drag) nor pointer
						// (nothing happens on click).
						!interactive ? "cursor-default" : live ? "cursor-grab" : "cursor-pointer",
						focused && interactive && !alwaysActive
							? "border-accent ring-2 ring-accent/60"
							: "border-line hover:border-line-strong",
					)}
				>
					{/* The WebGL canvas, and the 2-D symmetry layer over it, are created imperatively by
					    useFlatCellPreview. */}
					{failed ? (
						<div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-fg-muted">
							WebGL2 unavailable — interactive preview disabled.
						</div>
					) : null}
					{/* Top-right button stack, /play overlay style: expand + open-in-play. Either can be
					    switched off by the caller; with both off the stack renders nothing at all. While
					    lifted it stays visible instead of waiting for a hover — the way out of a 90%
					    overlay must not be something you have to go hunting for. */}
					<div
						className={cn(
							"absolute right-2 top-2 z-10 flex gap-1.5 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
							lifted ? "opacity-100" : "opacity-0",
						)}
					>
						{showExpand && interactive ? (
							<button
								type="button"
								onPointerDown={stopDrag}
								onClick={() => setExpanded((v) => !v)}
								title={expanded ? "Close" : "Expand"}
								aria-label={expanded ? "Close the expanded preview" : "Expand preview"}
								aria-pressed={expanded}
								className="flex items-center justify-center rounded-lg border border-line bg-surface-overlay/80 p-2 text-fg-muted backdrop-blur-sm transition-colors hover:border-line-strong hover:text-fg"
							>
								{lifted ? <X size={14} /> : expanded ? <Minimize size={14} /> : <Maximize size={14} />}
							</button>
						) : null}
						{showOpenInPlay && tilingId ? (
							<Link
								href={`/play?source=reference&tiling=${encodeURIComponent(tilingId)}`}
								onPointerDown={stopDrag}
								title="Open in Play"
								aria-label="Open this tiling in Play"
								className="flex items-center justify-center rounded-lg border border-line bg-surface-overlay/80 p-2 text-fg-muted backdrop-blur-sm transition-colors hover:border-line-strong hover:text-fg"
							>
								{openInPlayIcon === "play" ? (
									<Play size={14} className="fill-current" />
								) : (
									<ExternalLink size={14} />
								)}
							</Link>
						) : null}
					</div>
				</motion.div>
			</motion.div>
		</>
	);
}
