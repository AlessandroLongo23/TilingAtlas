"use client";

import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import { SlideMarkdown, type SlideLayout } from "@/components/slide-markdown";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { PatchCard } from "@/components/patch-card";
import { VertexFigureCard } from "@/components/vertex-figure-card";
import { MethodCard, MethodStrip } from "@/components/method-card";
import { CountTimeline } from "@/components/count-timeline";
import { GrowthStrip } from "@/components/growth-strip";
import { RowStacker } from "@/components/row-stacker";
import { PeriodFigure } from "@/components/period-figure";
import { TorusFigure } from "@/components/torus-figure";
import { K4Wall } from "@/components/k4-wall";
import { AbstractVertex } from "@/components/abstract-vertex";
import { LocalRules } from "@/components/local-rules";
import { PipelineStages } from "@/components/pipeline-stages";
import { SolveLoop } from "@/components/solve-loop";
import { DelaneySymbol } from "@/components/delaney-symbol";
import { OctagonForcing } from "@/components/octagon-forcing";
import { DsymGrowth } from "@/components/dsym-growth";
import { WallpaperGroupWall } from "@/components/wallpaper-group-diagram";
import { PartSlide } from "@/components/part-slide";
import { ObligationsMark } from "@/components/obligations-mark";
import { Alphabet44 } from "@/components/alphabet-44";
import { RulesNecessary } from "@/components/rules-necessary";
import { NoDrop } from "@/components/no-drop";
import { RefinementExact } from "@/components/refinement-exact";
import { FlatTorus } from "@/components/flat-torus";
import { QuotientBridge } from "@/components/quotient-bridge";
import { FailedPath } from "@/components/failed-path";
import { ShowcaseWall } from "@/components/showcase-wall";
import { orbitsFor } from "@/lib/defense/orbitCache";
import { symmetryFor } from "@/lib/services/symmetryCache";
import { PreviewOverlayScope } from "@/lib/hooks/usePreviewOverlays";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { Slide } from "@/lib/defense/slides";
import { cn } from "@/lib/utils/cn";

/** Rehearsal target, in minutes. The clock turns amber at 90% and red past it. */
const TARGET_MINUTES = 35;

interface DefenseClientProps {
	slides: Slide[];
	cells: Record<string, TranslationalCellData>;
	/** Exact cells, keyed by atlas id, for the tilings an `<orbit-card>` shows. */
	sources: Record<string, ExactCellSource>;
}

interface TilingCardTagProps {
	tiling?: string;
	title?: string;
	/** `accent="yes"` rings the card and brightens its caption, for the few a slide singles out of
	 *  a run of otherwise equal cards. */
	accent?: string;
	/** Lattice periods across the card at reset zoom. Small cards in a dense grid want fewer, or the
	 *  patch reads as texture. Default 3, the card's own. */
	periods?: string | number;
}

/**
 * What every interactive card on a slide gets, over its /theory defaults.
 *
 * Expand LIFTS the card to 90% of the viewport over a backdrop instead of growing it in flow: a
 * slide has no prose column to break out of, and nothing behind the card may move while the room is
 * looking at it. The /play link stays, wearing a play triangle: from the back of a room that reads as
 * "he is about to open this" faster than a link glyph does. And every card is live on arrival: the
 * click-to-activate step exists to stop a card stealing the wheel from a scrolling page, and a slide
 * does not scroll, so here it would only cost a gesture in front of an audience.
 */
const SLIDE_CARD_PROPS = {
	expandMode: "overlay",
	openInPlayIcon: "play",
	alwaysActive: true,
} as const;

/** An `<orbit-card>`'s one difference from a plain card: it arrives with the dots showing. */
const ORBITS_ON = { orbits: true } as const;

/** A `<seed-card>`'s: it arrives with the construction points showing. `p` still turns them off. */
const POINTS_ON = { polygonPoints: true } as const;

/** …and with `domain="yes"`, the fundamental domain over them as well. */
const POINTS_AND_DOMAIN_ON = { polygonPoints: true, fundamentalDomain: true } as const;

/** Width over height of the DTU mark's own bounding box in `dtured_rgb.pdf`: 468.25 x 683 pt. */
const DTU_LOGO_RATIO = 468.25 / 683;

/**
 * `<title-slide>` — the DTU mark on the left, the title block on the right, the logo exactly as
 * tall as the text beside it.
 *
 * The height has to be measured, not declared. It is whatever the title, the name and the
 * date happen to occupy, and every size on a slide is a `clamp()`, so it moves with the projector.
 * CSS alone will not do it: a flex item resolves its width before `align-self: stretch` hands it a
 * height, so `aspect-ratio` has nothing to work from and the cell collapses to zero width (measured).
 *
 * The mark is a background, not an `<img>`, on purpose — the deck's figure styling
 * (`[&_img]`: white plate, padding, rounded corners, a 46vh cap) is a descendant selector and
 * outranks anything a class on the image itself could say.
 */
function TitleSlide({ children }: { children?: React.ReactNode }) {
	const textRef = useRef<HTMLDivElement | null>(null);
	const [height, setHeight] = useState(0);

	useEffect(() => {
		const el = textRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div className="flex items-start gap-[3.5vw]">
			<div
				role="img"
				aria-label="Technical University of Denmark"
				className="shrink-0 bg-contain bg-no-repeat"
				style={{
					backgroundImage: "url(/defense/dtu-logo.svg)",
					height,
					width: height * DTU_LOGO_RATIO,
				}}
			/>
			{/* The last line's bottom margin is not part of the text anyone can see; leaving it in
			    would run the logo a line past the date. */}
			<div ref={textRef} className="min-w-0 [&>*:last-child]:mb-0">
				{children}
			</div>
		</div>
	);
}

/** Caption plus row gap under each card, in px. Subtracted from the height a row may occupy. */
const CARD_CAPTION_PX = 44;

/**
 * A run of cards, capped by HEIGHT, not only by width.
 *
 * Card width is (grid − gaps) / cols, and for a square card width IS height, so a grid sized off the
 * viewport's width silently sets its own height: at 1280x720, six cards across make two rows 400px
 * tall and the bottom captions fall off the slide. A deck must never scroll, so the grid measures the
 * space left below the prose and caps each card to fit it. The cap is a maximum, so on a tall screen
 * the cards go back to filling the width.
 *
 * The measurement cannot feed back on itself: the grid's top edge is fixed by the heading and prose
 * above it, neither of which depends on how big the cards turn out to be.
 */
function SlideGrid({ cols, children }: { cols?: string | number; children?: React.ReactNode }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [cap, setCap] = useState<number | null>(null);

	const n = ["2", "4", "5", "6", "7"].includes(String(cols)) ? Number(cols) : 3;
	// Whitespace between tags arrives as text children; counting those would invent rows.
	const count = Children.toArray(children).filter((c) => typeof c !== "string" || c.trim().length > 0).length;
	const rows = Math.max(1, Math.ceil(count / n));

	useLayoutEffect(() => {
		const el = ref.current;
		const frame = el?.closest(".slide-frame") as HTMLElement | null;
		const box = frame?.parentElement;
		if (!el || !frame || !box) return;
		const measure = () => {
			// Measure the box the frame is ALLOWED to fill, not the frame itself. The frame is
			// `max-h-full`, so its own height shrinks to its content: reading that would shrink the cards,
			// which would shrink the frame, which would shrink the cards again, all the way to the floor.
			const boxStyle = getComputedStyle(box);
			const frameStyle = getComputedStyle(frame);
			const framePad = (parseFloat(frameStyle.paddingTop) || 0) + (parseFloat(frameStyle.paddingBottom) || 0);
			const usable =
				box.clientHeight - (parseFloat(boxStyle.paddingTop) || 0) - (parseFloat(boxStyle.paddingBottom) || 0);
			// What the blocks ABOVE this grid occupy, summed directly instead of read off the grid's
			// own position. On a spread slide (`justify-between`) the gap above the grid is free space,
			// and free space is a function of the grid's height: measuring from the grid's top would
			// feed the answer back into the question. Summing the siblings does not — none of their
			// heights depends on how big the cards turn out to be.
			let above = 0;
			for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
				const s = getComputedStyle(sib);
				above +=
					sib.getBoundingClientRect().height +
					(parseFloat(s.marginTop) || 0) +
					(parseFloat(s.marginBottom) || 0);
			}
			const available = usable - above - framePad;
			setCap(Math.max(48, Math.floor(available / rows) - CARD_CAPTION_PX));
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(box);
		return () => ro.disconnect();
	}, [rows]);

	// Before the first measurement, fall back to a fraction of the viewport, so the cards are never
	// briefly drawn at full width and then snapped down.
	const perCard = cap !== null ? `${cap}px` : `${rows >= 4 ? 11 : rows === 3 ? 15 : rows === 2 ? 24 : 38}vh`;

	return (
		<div
			ref={ref}
			style={{ maxWidth: `calc(${n} * ${perCard} + ${n - 1}rem)` }}
			className={cn(
				// `w-full` is load-bearing next to `mx-auto`. A slide is a flex column, and auto margins
				// on a flex item's cross axis cancel `align-items: stretch`, so without it the grid
				// shrinks to fit-content and the cards collapse to their intrinsic size (measured: 44px).
				"mx-auto grid w-full grid-cols-1 gap-4",
				String(cols) === "2" && "sm:grid-cols-2",
				String(cols) === "4" && "sm:grid-cols-2 lg:grid-cols-4",
				String(cols) === "5" && "grid-cols-3 lg:grid-cols-5",
				String(cols) === "6" && "grid-cols-3 lg:grid-cols-6",
				String(cols) === "7" && "grid-cols-4 lg:grid-cols-7",
				!["2", "4", "5", "6", "7"].includes(String(cols)) && "sm:grid-cols-2 lg:grid-cols-3",
			)}
		>
			{children}
		</div>
	);
}

function formatClock(ms: number): string {
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function DefenseClient({ slides, cells, sources }: DefenseClientProps) {
	const [index, setIndex] = useState(0);
	const [overview, setOverview] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [running, setRunning] = useState(false);
	const startedRef = useRef(false);

	const lastIndex = slides.length - 1;

	const current = slides[index];

	// The slide number lives in the URL hash, so opening /play in the same tab and coming back with
	// the browser's Back button lands on the slide you left, not at the title. replaceState
	// and not pushState: stepping through 40 slides must not put 40 entries in the history.
	useEffect(() => {
		const fromHash = () => {
			const n = Number(window.location.hash.slice(1));
			if (Number.isInteger(n) && n >= 1 && n <= slides.length) setIndex(n - 1);
		};
		fromHash();
		// `hashchange` alone is not enough. Coming back from /play can restore this page either as a
		// fresh document or out of the back/forward cache, and in the bfcache case no mount effect
		// runs at all, so the hash and the rendered slide drift apart. `popstate` and `pageshow`
		// cover both restore paths.
		window.addEventListener("hashchange", fromHash);
		window.addEventListener("popstate", fromHash);
		window.addEventListener("pageshow", fromHash);
		return () => {
			window.removeEventListener("hashchange", fromHash);
			window.removeEventListener("popstate", fromHash);
			window.removeEventListener("pageshow", fromHash);
		};
	}, [slides.length]);

	useEffect(() => {
		const want = `#${index + 1}`;
		if (typeof window !== "undefined" && window.location.hash !== want) {
			window.history.replaceState(null, "", want);
		}
	}, [index]);

	// The clock. Starts itself the first time you advance, and there is deliberately no pause key:
	// there is no moment in a defense where you reach for one.
	useEffect(() => {
		if (!running) return;
		const id = window.setInterval(() => setElapsed((e) => e + 1000), 1000);
		return () => window.clearInterval(id);
	}, [running]);

	const go = useCallback(
		(next: number) => {
			if (next < 0 || next >= slides.length) return;
			setIndex(next);
		},
		[slides.length],
	);

	const advance = useCallback(() => {
		if (!startedRef.current) {
			startedRef.current = true;
			setRunning(true);
		}
		go(index + 1);
	}, [index, go]);

	const retreat = useCallback(() => go(index - 1), [go, index]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			switch (e.key) {
				case "ArrowRight":
				case "PageDown":
				case " ":
					e.preventDefault();
					if (overview) return;
					advance();
					break;
				case "ArrowLeft":
				case "PageUp":
					e.preventDefault();
					if (overview) return;
					retreat();
					break;
				case "Home":
					e.preventDefault();
					go(0);
					break;
				case "End":
					e.preventDefault();
					go(lastIndex);
					break;
				case "Escape":
					e.preventDefault();
					setOverview((o) => !o);
					break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [advance, retreat, go, overview, lastIndex]);

	// The exact-cell inputs the three overlays need, for whichever card is asking. Orbits are cheap
	// enough to have already been computed; the wallpaper analysis is exact cyclotomic arithmetic, so
	// symmetryFor runs once per tiling and caches — including the failures, which is what keeps a
	// tiling with no usable exact source from re-analysing on every keypress.
	const overlayData = useCallback(
		(id?: string) => {
			const source = id ? sources[id] : undefined;
			if (!id || !source) return {};
			return { orbitData: orbitsFor(id, source), symmetryData: symmetryFor(id, source) };
		},
		[sources],
	);

	// Custom markdown tags. `tiling-card` matches the /theory contract exactly so content can move
	// between an article and the deck unchanged.
	const components = useMemo(() => {
		const map = {
			"tiling-card": ({ tiling, title, accent, periods }: TilingCardTagProps) => {
				const cell = tiling ? cells[tiling] : undefined;
				if (!cell) {
					return (
						<div className="not-prose flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-overlay/30 p-4 text-center text-xs text-fg-muted">
							Unknown tiling id: {tiling ?? "(none)"}
						</div>
					);
				}
				const marked = String(accent) === "yes";
				// Authored as an attribute, so it arrives as a string when it arrives at all.
				const home = Number(periods);
				// The card itself renders no caption by design (see the /theory client), but on a slide
				// an unlabelled tiling is a quiz. Caption it here from the same `title` attribute.
				return (
					<figure className="not-prose m-0">
						<InteractiveTilingPreviewCard
							cell={cell}
							tilingId={tiling}
							title={title}
							homePeriods={Number.isFinite(home) && home > 0 ? home : undefined}
							className={marked ? "border-accent ring-2 ring-accent" : undefined}
							{...overlayData(tiling)}
							{...SLIDE_CARD_PROPS}
						/>
						{title && (
							<figcaption
								className={cn(
									"mt-2 text-center text-[clamp(0.7rem,1vh+0.3vw,1rem)]",
									marked ? "font-semibold text-accent" : "text-fg-muted",
								)}
							>
								{title}
							</figcaption>
						)}
					</figure>
				);
			},
			// <orbit-card tiling="t3001" label="…"> — the same card again, in /play's vertex-orbit mode:
			// tiles dimmed, a dot on every vertex coloured by its orbit, and hovering one orbit grows
			// all of its dots. Several may share a slide, each hovering independently.
			"orbit-card": ({ tiling, label }: { tiling?: string; label?: string }) => {
				const cell = tiling ? cells[tiling] : undefined;
				const source = tiling ? sources[tiling] : undefined;
				const orbits = tiling && source ? orbitsFor(tiling, source) : null;
				if (!cell || !orbits || !tiling) {
					return (
						<div className="not-prose flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-overlay/30 p-4 text-center text-xs text-fg-muted">
							No exact cell for {tiling ?? "(none)"}, so its orbits cannot be drawn.
						</div>
					);
				}
				return (
					<figure className="not-prose m-0">
						<InteractiveTilingPreviewCard
							cell={cell}
							tilingId={tiling}
							title={label}
							homePeriods={2}
							{...overlayData(tiling)}
							// What makes this an orbit card, not a plain one: the dots are already on
							// when the slide arrives. `o` still turns them off again, here or slide-wide.
							initialOverlays={ORBITS_ON}
							{...SLIDE_CARD_PROPS}
						/>
						{label && (
							<figcaption className="mt-2 text-center text-[clamp(0.7rem,1vh+0.3vw,1rem)] text-fg-muted">
								{label}
							</figcaption>
						)}
					</figure>
				);
			},
			// <seed-card tiling="t4001" label="…"> — the patch the symmetry-first method starts from: one
			// vertex figure per orbit, cut out of the tiling and drawn once, with a dot on every centroid,
			// edge halfway and vertex (/play's `p`). Those dots are the construction points the seventeen
			// fundamental domains were fitted against, which is the whole content of that slide.
			//
			// Inert on purpose. The framing is the argument here — a seed knocked half out of the card
			// mid-sentence says nothing about fitting anything — so it takes no drag, no wheel and no
			// expand. The overlay keys still work: `s` puts the symmetry elements over it, which is the
			// next thing the slide wants to say.
			"seed-card": ({
				tiling,
				label,
				domain,
			}: {
				tiling?: string;
				label?: string;
				/** `domain="yes"` also arrives with the fundamental domain drawn (/play's `d`), for the
				 *  slide whose argument is about where a domain's corners land relative to the patch. */
				domain?: string;
			}) => {
				const cell = tiling ? cells[tiling] : undefined;
				const source = tiling ? sources[tiling] : undefined;
				const orbits = tiling && source ? orbitsFor(tiling, source) : null;
				if (!cell || !orbits || !tiling) {
					return (
						<div className="not-prose flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-overlay/30 p-4 text-center text-xs text-fg-muted">
							No exact cell for {tiling ?? "(none)"}, so its seed cannot be cut.
						</div>
					);
				}
				return (
					<figure className="not-prose m-0">
						<InteractiveTilingPreviewCard
							cell={cell}
							tilingId={tiling}
							title={label}
							seed
							interactive={false}
							initialOverlays={String(domain) === "yes" ? POINTS_AND_DOMAIN_ON : POINTS_ON}
							{...overlayData(tiling)}
							{...SLIDE_CARD_PROPS}
						/>
						{label && (
							<figcaption className="mt-2 text-center text-[clamp(0.7rem,1vh+0.3vw,1rem)] text-fg-muted">
								{label}
							</figcaption>
						)}
					</figure>
				);
			},
			// <vc-card word="3.4.6.4"> — one vertex configuration drawn on its own, named underneath.
			// `tiles="no"` marks one that closes 360 degrees and still appears in no tiling.
			"vc-card": ({ word, tiles }: { word?: string; tiles?: string }) =>
				word ? (
					<VertexFigureCard word={word} tiles={String(tiles) !== "no"} />
				) : (
					<div className="not-prose flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-overlay/30 p-4 text-center text-xs text-fg-muted">
						vc-card with no word
					</div>
				),
			// <patch-card patch="penrose"> — a finite patch, for tilings with no fundamental cell. It pans
			// and zooms, clamped to the gap-free window so the patch's ragged boundary can never come
			// into view; `static="yes"` pins it back to a picture.
			"patch-card": ({ patch, label, static: fixed }: { patch?: string; label?: string; static?: string }) =>
				patch ? (
					<PatchCard patch={patch} label={label} interactive={String(fixed) !== "yes"} />
				) : (
					<div className="not-prose flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-overlay/30 p-4 text-center text-xs text-fg-muted">
						No patch named.
					</div>
				),
			// <method-strip> … <method-card fig="torus" name="…" note="…"> — the enumeration methods as
			// one row of schematics, in the order they were tried, with an arrow into each. `accent="yes"`
			// marks the one the path arrived at. An unknown `fig` draws a labelled placeholder, so a method
			// can go on the slide before its drawing exists.
			// Both are mapped to the components themselves, not wrapped in an arrow: the strip
			// numbers its children by cloning them, and a wrapper would swallow the prop it injects.
			"method-strip": MethodStrip,
			"method-card": MethodCard,
			// <wallpaper-wall signatures="yes"> — the 17 wallpaper groups as one wall of cell diagrams,
			// the same Wikipedia images the library sidebar shows on hover. `signatures="yes"` adds the
			// orbifold notation beside each name.
			"wallpaper-wall": WallpaperGroupWall,
			// <growth-strip> — the expansion driven by hand: a k=3 seed, then the two stamps that grow it,
			// cycling through the placements the expander actually offers at the vertex it takes next.
			// Precomputed SeedExpander output (scripts/build-growth-figure.ts), not a drawing.
			"growth-strip": GrowthStrip,
			// <row-stacker> — why emit-on-closure is unsound, walked, not asserted. A certified row
			// of squares, and above it a free binary choice per row: 2^n legal tilings all containing that
			// same patch, of which the prune keeps one.
			"row-stacker": RowStacker,
			// <period-figure panel="wheel|example" dirs="12" size="sm"> — the unit ζ directions, and a
			// tiling's two period vectors written as chains of them over the cell they generate. The
			// bounded-weight theorem in one case, searched rather than drawn (scripts/build-period-figure.ts).
			// Omit `panel` for both. `dirs` re-reads the same chains in a coarser alphabet once the octagon
			// is out of the pool; `size="sm"` is for a slide that already carries another figure.
			"period-figure": PeriodFigure,
			// <torus-figure> — why fixing the lattice first bounds the search: the plane beside the same
			// cell with its opposite edges identified, one tile picked out crossing the seam. Same tiling
			// and same JSON as <period-figure>.
			"torus-figure": TorusFigure,
			// <k4-wall> — the three measurements that closed architecture three: seed count, timeout rate,
			// and where the time goes at k=3 against k=4. Numbers sourced in NOTES §15.3 and §22.2-22.3.
			"k4-wall": K4Wall,
			// <abstract-vertex word="3.4.6.4"> — the object the engine stores: half-edges that stop at
			// mid-edge, corner wedges at their true angles, and no position or orientation anywhere.
			// Encoding per alphabets/gen_alphabet.py.
			"abstract-vertex": ({ word }: { word?: string }) => <AbstractVertex word={word} />,
			// <local-rules> — one rejected assembly per local rule, each drawn from the test that
			// rejects it in tools/ctrnact-oracle/eu_solver.cpp (checkpart, and the mirror guard in extend).
			"local-rules": LocalRules,
			// <dsym-growth> — how many Delaney–Dress symbols exist at each size, on a log axis, with the
			// 12k budget marked at k = 1, 2, 3. Data is Table 1 of arXiv:2007.10625; the k rules are ours.
			"dsym-growth": DsymGrowth,
			// <octagon-forcing> — one octagon, its forced corona, the plane. Each frame adds only what
			// the frame before it forced, which is what "propagates deterministically" looks like.
			"octagon-forcing": OctagonForcing,
			// <delaney-symbol> — the chamber system beside the quotient it collapses to. The right
			// panel is generateCandidateSymbols(1, [3,4,6,12], 12)'s own answer for 3.6.3.6.
			"delaney-symbol": DelaneySymbol,
			// <solve-loop> — the search loop as a filmstrip: a piece, a move, a move undone, closed.
			// Every frame is a state of `configuration` in eu_solver.cpp.
			"solve-loop": SolveLoop,
			// <pipeline-stages> — solve, prune, develop, one panel each, drawn from what the three
			// sources do. Only the third has coordinates in it, which is the slide's whole claim.
			"pipeline-stages": PipelineStages,
			// <count-timeline> — who published which k-uniform count, when, drawn, not tabulated.
			// Fixed content, like the DTU mark: it is one slide's graphic, not a reusable card.
			"count-timeline": CountTimeline,
			// <title-slide> … </title-slide> — the DTU mark beside the title block, in one row.
			"title-slide": TitleSlide,
			// <part-slide part="3"> — the act divider: the five parts in order, titles only, the one
			// being entered set large and in the accent. `part="1"` right after the title is what
			// introduces the split; `part="backup"` appends the backup deck as a sixth row. One figure
			// may be authored between the tags, and it sits beside the list, uncaptioned.
			"part-slide": PartSlide,
			// The six obligation figures of part four, one per slide, in order.
			//
			// <alphabet-44> — the whole alphabet: 44 letters grouped by the 14 configurations they refine,
			// each drawn with the mirrors and rotation it carries. Symmetry data recovered from the shipped
			// table by scripts/build-alphabet-figure.mjs, not drawn by eye.
			"alphabet-44": Alphabet44,
			// <rules-necessary> — why the four local rules reject nothing real: the divisor is forced by the
			// quotient (l = n/r), and a broken rule stays broken in every descendant.
			"rules-necessary": RulesNecessary,
			// <no-drop> — the descent always has a move, and the one step that could still lose a tiling:
			// the Aut-orbit transversal, with (4,4,4,4)A2 where the Python solver's was one dart short.
			"no-drop": NoDrop,
			// <refinement-exact> — the 3-cycle/6-cycle that refinement cannot separate, beside the flag
			// rigidity that makes the test exact here anyway.
			"refinement-exact": RefinementExact,
			// <flat-torus> — holonomy, the 12-unit vertex link that rules it out, the torus, and the cover.
			"flat-torus": FlatTorus,
			// <quotient-bridge> — cocompactness, the 12k flag bound, and fold/develop as mutual inverses.
			"quotient-bridge": QuotientBridge,
			// <obligations-mark> — six boxes, five filled: the Part IV door, where the act behind it has
			// a table and no figure to borrow. Numbering follows the obligations table.
			"obligations-mark": ObligationsMark,
			// <failed-path> — the Part II door: the four abandoned architectures, in build order, threaded
			// onto one dashed curve that enters and leaves the frame.
			"failed-path": FailedPath,
			// <showcase-wall> — the Part V door: sixteen captures of the real library shelf, three
			// geometries by three decorations plus the tile families that are not regular polygons.
			"showcase-wall": ShowcaseWall,
			// <slide-cols> … </slide-cols> — text beside a figure, the commonest slide shape.
			"slide-cols": ({ children }: { children?: React.ReactNode }) => (
				// Same height cap as slide-grid, applied to the figures, not the columns: a column
				// holding prose should still use its full width.
				<div className="grid grid-cols-1 items-center gap-8 [&_figure]:mx-auto [&_figure]:max-w-[38vh] md:grid-cols-2">
					{children}
				</div>
			),
			// <slide-grid cols="3"> … </slide-grid> — a run of cards, height-capped. `cols` is a real HTML
			// attribute name, so React may hand it through as a number, not the authored string.
			"slide-grid": ({ cols, children }: { cols?: string | number; children?: React.ReactNode }) => (
				<SlideGrid cols={cols}>{children}</SlideGrid>
			),
		};
		return map as unknown as Components;
	}, [cells, sources, overlayData]);

	// Which slide each act divider landed on. Derived from the parsed deck, so inserting a slide
	// anywhere above a divider cannot leave a stale jump target behind.
	const partSlideIndex = useMemo(() => {
		const found: Record<string, number> = {};
		for (const s of slides) {
			const m = s.content.match(/<part-slide[^>]*\bpart=["']([^"']+)["']/i);
			if (m && found[m[1]] === undefined) found[m[1]] = s.index;
		}
		return found;
	}, [slides]);

	// The presenting map: the same tags, plus the jump a divider's titles need. The overview keeps the
	// plain map — its thumbnails are already one button each, and a target inside one would be nested.
	const liveComponents = useMemo(() => {
		const live = {
			...(components as unknown as Record<string, unknown>),
			"part-slide": ({ part, children }: { part?: string; children?: React.ReactNode }) => (
				<PartSlide
					part={part}
					onSelect={(key) => {
						const target = partSlideIndex[key];
						if (target !== undefined) go(target);
					}}
				>
					{children}
				</PartSlide>
			),
		};
		return live as unknown as Components;
	}, [components, partSlideIndex, go]);

	if (slides.length === 0) {
		return (
			<main className="flex h-screen w-full items-center justify-center bg-surface-raised p-8">
				<p className="max-w-md text-center text-sm text-fg-muted">
					No talk content found. Author the deck at{" "}
					<code className="rounded bg-surface-overlay px-1.5 py-0.5 text-accent">
						public/defense/talk.md
					</code>
					, separating slides with a <code className="text-accent">---</code> fence.
				</p>
			</main>
		);
	}

	const overTime = elapsed > TARGET_MINUTES * 60_000;
	const nearTime = !overTime && elapsed > TARGET_MINUTES * 0.9 * 60_000;
	const progress = slides.length > 0 ? current.number / slides.length : 0;
	// The two slides with no heading to pin: the title, and an act divider. Both are sized to their
	// own content and centred in the box, since there is nothing on them for the eye to hunt for.
	const isCoverSlide = current.content.includes("<title-slide") || current.content.includes("<part-slide");
	// A slide "carries a figure" if it has a markdown image or any of the deck's own tags — every one
	// of those is a custom element, and a custom element name is required to contain a hyphen, which
	// is what tells `<slide-grid>` apart from the `<span>` and `<sup>` that appear in ordinary prose.
	// Digits after the first character are part of the name: `<k4-wall>` is a tag, and a letters-only
	// class silently misses it.
	const hasFigure = /!\[|<[a-z][a-z0-9]*-[a-z0-9-]+/.test(current.content);
	const layout: SlideLayout = isCoverSlide ? "flow" : hasFigure ? "spread" : "pinned";

	return (
		// One overlay scope per SLIDE: o / s / d with nothing focused toggle every card on the slide,
		// and the reset key clears them on the way to the next one — an overlay is something you turn on
		// to make a point, and finding it still on three slides later is a surprise mid-talk.
		<PreviewOverlayScope resetKey={index}>
			<main className="relative h-screen w-full overflow-hidden bg-surface-raised">
				{overview ? (
					<div className="h-full w-full overflow-y-auto p-6">
						<h2 className="mb-4 text-sm font-semibold tracking-wide text-fg-muted uppercase">
							Overview
						</h2>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
							{slides.map((s) => (
								<button
									key={s.index}
									type="button"
									onClick={() => {
										setIndex(s.index);
										setOverview(false);
									}}
									className={cn(
										"group relative flex h-40 flex-col overflow-hidden rounded-lg border p-3 text-left transition-colors",
										s.index === index
											? "border-accent bg-surface-overlay/50"
											: "border-line bg-surface hover:border-accent/60",
									)}
								>
									<div className="pointer-events-none flex-1 overflow-hidden">
										<SlideMarkdown content={s.content} components={components} compact />
									</div>
									<div className="mt-1 flex shrink-0 items-center justify-between text-[0.6rem] text-fg-muted">
										<span className="truncate">{s.title}</span>
										<span>{s.number}</span>
									</div>
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="flex h-full w-full flex-col">
						<div className="h-0.5 w-full shrink-0 bg-transparent">
							<div
								className="h-full origin-left bg-accent transition-transform duration-300"
								style={{ transform: `scaleX(${progress})`, width: "100%" }}
							/>
						</div>

						{/* The heading is PINNED, not centred: with the old `items-center` it sat at a
						    different height on every slide, so the eye had to hunt for the title on each
						    advance. Now the frame is stretched to the full height of the box and the slide's
						    own blocks divide it up (see SlideLayout), which keeps the heading at a fixed y
						    and decides where the slack below it goes. The title slide is the one exception:
						    it has no heading to anchor, so it stays centred and sized to its content. */}
						<div
							className={cn(
								"flex min-h-0 flex-1 justify-center px-[6vw] py-[5vh]",
								isCoverSlide ? "items-center" : "items-stretch",
							)}
						>
							{/* The scroll frame is a safety net for a slide that outgrows the viewport, but
							    `overflow-y: auto` makes the browser clip the OTHER axis too, and anything a card
							    draws outside its border box then gets cut at the frame edge: the accent ring on
							    the leftmost card of a full-width grid loses its left half. The p-2 widens the
							    clip box by 8px on every side, and the extra 1rem of max-width gives that padding
							    somewhere to go, so the content still measures 68rem and still starts in exactly
							    the same place. */}
							<div
								className={cn(
									"slide-frame w-full max-w-[69rem] overflow-y-auto p-2",
									// A pinned or spread slide divides a height, so it needs one: `max-h-full`
									// leaves the frame sized to its content and there is nothing to divide.
									// Overflow still scrolls, since content taller than the frame overflows it
									// either way.
									isCoverSlide ? "max-h-full" : "h-full",
								)}
							>
								<SlideMarkdown content={current.content} components={liveComponents} layout={layout} />
							</div>
						</div>

						<div className="flex shrink-0 items-center justify-between px-[6vw] py-3 text-xs text-fg-muted">
							<span className="tabular-nums">
								{current.number} / {slides.length}
							</span>
							<span className="hidden sm:inline">
								&larr; &rarr; move &middot; Esc overview &middot; o/s/d/p overlays
							</span>
							<span
								className={cn(
									"tabular-nums",
									overTime && "font-semibold text-red-500",
									nearTime && "text-amber-500",
									!running && "opacity-50",
								)}
							>
								{formatClock(elapsed)} / {TARGET_MINUTES}:00
							</span>
						</div>
					</div>
				)}
			</main>
		</PreviewOverlayScope>
	);
}
