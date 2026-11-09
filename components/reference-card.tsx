"use client";

import dynamic from "next/dynamic";
import { ThumbnailSkeleton } from "@/design-system/components/thumbnail-skeleton";
import { useCallback, useState } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge, type BadgeTone } from "@/design-system/components/badge";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { ColorsThumbnail } from "@/components/colors/colors-thumbnail";
import { FreedrawThumbnail } from "@/components/freedraw/freedraw-thumbnail";
import { hypSchwarzMeta } from "@/lib/freedraw/schwarz";
import { InfoDot } from "@/design-system/components/info-dot";
import { renderTilingToDataUrl } from "@/lib/utils/renderTiling";
import { paramGlyphs } from "@/lib/utils/paramCell";
import { SCREENSHOT_BUTTONS_ENABLED } from "@/lib/utils/featureFlags";
import { Button } from "@/design-system/components/button";
import { Tooltip } from "@/design-system/components/tooltip";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { freedrawKNoun, gridOf } from "@/lib/freedraw/pattern";
import {
	compactVertexConfig,
	freedrawStatsOf,
	isMaximal,
	partitionKeyOf,
	starFoldsOf,
	geometryOf,
	tileClassOf,
	TILE_CLASS_LABEL,
	type Certification,
	type ReferenceTiling,
	edgeBoardOf,
} from "@/lib/services/referenceAtlas";
import { EDGE_BOARD_LABEL } from "@/lib/services/facets";
import { polyformBoard } from "@/lib/tilings/polyform";
import { GEOMETRIES, TILE_CLASSES } from "@/lib/vocabulary";

// The curved and decorated thumbnails, fetched the first time a card needs one: the spherical ones carry three.js
// and the hyperbolic one its per-pixel renderer, which a grid of flat tilings never draws. The skeleton holds the slot.
const HyperbolicThumbnail = dynamic(
	() => import("@/components/hyperbolic-thumbnail").then((m) => m.HyperbolicThumbnail),
	{ ssr: false, loading: () => <ThumbnailSkeleton /> },
);
const SphericalColorsThumbnail = dynamic(
	() => import("@/components/spherical-colors-thumbnail").then((m) => m.SphericalColorsThumbnail),
	{ ssr: false, loading: () => <ThumbnailSkeleton /> },
);
const SphericalThumbnail = dynamic(() => import("@/components/spherical-thumbnail").then((m) => m.SphericalThumbnail), {
	ssr: false,
	loading: () => <ThumbnailSkeleton />,
});
const HollowThumbnail = dynamic(() => import("@/components/hollow/hollow-thumbnail").then((m) => m.HollowThumbnail), {
	ssr: false,
	loading: () => <ThumbnailSkeleton />,
});
const SphSchwarzThumbnail = dynamic(
	() => import("@/components/freedraw/sph-schwarz-thumbnail").then((m) => m.SphSchwarzThumbnail),
	{ ssr: false, loading: () => <ThumbnailSkeleton /> },
);
const SphPolyThumbnail = dynamic(
	() => import("@/components/freedraw/sph-poly-thumbnail").then((m) => m.SphPolyThumbnail),
	{ ssr: false, loading: () => <ThumbnailSkeleton /> },
);
const SphStarThumbnail = dynamic(
	() => import("@/components/freedraw/sph-star-thumbnail").then((m) => m.SphStarThumbnail),
	{ ssr: false, loading: () => <ThumbnailSkeleton /> },
);
const PentagonEdgesThumbnail = dynamic(
	() => import("@/components/pentagon-edges-thumbnail").then((m) => m.PentagonEdgesThumbnail),
	{ ssr: false, loading: () => <ThumbnailSkeleton /> },
);
const IsohedralEdgesThumbnail = dynamic(
	() => import("@/components/isohedral-edges-thumbnail").then((m) => m.IsohedralEdgesThumbnail),
	{ ssr: false, loading: () => <ThumbnailSkeleton /> },
);

// A tiling card in the unified library. Shows the DISCOVERER (historical first-finder) and a
// CERTIFICATION badge (proven / reproduced / candidate — the rigorous completeness status of its
// enumeration level, orthogonal to who discovered it). A "family" one-parameter tiling gets an α chip.
interface ReferenceCardProps {
	tiling: ReferenceTiling;
	// Group-variants mode (the shelf's toggle): every tiling sharing this card's vertex configuration
	// and k, in variant order. When longer than 1 the card shows one member at a time with a
	// ‹ n/N › pager bottom-right; the thumbnail click opens the member currently shown.
	group?: ReferenceTiling[];
	onClick?: (t: ReferenceTiling) => void;
}

// Certification is the thesis's headline axis: "proven" (our method certifies the level complete) is a
// strictly stronger claim than "reproduced" (matches published counts) or "candidate" (unestablished).
// The results table tags its rows with the same map, so a certification looks the same in both views.
export const CERT_STYLE: Record<Certification, { label: string; tone: BadgeTone }> = {
	proven: { label: "Proven", tone: "ink" },
	reproduced: { label: "Reproduced", tone: "neutral" },
	candidate: { label: "Candidate", tone: "dashed" },
};

// The card's metadata chip: a small mono tag laid over the thumbnail's top-left corner, so the text
// area under the image carries only the id and one meta line.
// A phone card is half the screen wide, so a long id loses its end, and the end is what differs:
// every card on the composable shelf would read "composable-k1-0…". There the id keeps its last
// characters and gives up the middle instead ("compo…-k1-000"), cut at a separator where one is near
// the end. Desktop renders the plain id.
const ID_TAIL = 8;
function PhoneId({ id, className, title }: { id: string; className: string; title?: string }) {
	const sep = Math.max(...["-", "_"].map((c) => id.lastIndexOf(c, id.length - 6)));
	const cut = sep > 0 && id.length - sep <= 12 ? sep : Math.max(0, id.length - ID_TAIL);
	return (
		<p className={cn("hidden min-w-0 max-md:flex", className)} title={title}>
			<span className="truncate">{id.slice(0, cut)}</span>
			<span className="shrink-0">{id.slice(cut)}</span>
		</p>
	);
}

export function ReferenceCard({ tiling: baseTiling, group, onClick }: ReferenceCardProps) {
	// The variant pager. rawIdx is clamped, not reset, when a filter shrinks the group under the same
	// card key — the shelf remounts the card (new key) only when the group's identity changes.
	const [rawIdx, setRawIdx] = useState(0);
	const isPhone = useIsPhone();
	const members = group && group.length > 1 ? group : null;
	const idx = members ? Math.min(rawIdx, members.length - 1) : 0;
	const tiling = members ? members[idx] : baseTiling;
	const isFamily = Array.isArray(tiling.alphaRange);
	// Read by the thumbnail's queued draw, not here: the record's renderCell is derived on first read.
	const cellOf = useCallback(() => tiling.renderCell, [tiling]);
	// Degrees of freedom = independent sliders in Play. 2+ (α, β, …) get their own badge.
	const glyphs = tiling.paramCell ? paramGlyphs(tiling.paramCell) : isFamily ? ["α"] : [];
	const dof = glyphs.length;
	const isHyperbolic = geometryOf(tiling) === GEOMETRIES.HYPERBOLIC;
	const isConvex = tileClassOf(tiling) === TILE_CLASSES.CONVEX;
	const isIsotoxal = tileClassOf(tiling) === TILE_CLASSES.ISOTOXAL;
	const isMixed = tileClassOf(tiling) === TILE_CLASSES.MIXED;
	// "Polyforms" names nine boards, so a polyform card says which one — "Tetrominoes", "Trihexes" —
	// where every other class says the class. The board is the only thing that tells a 4-hex tiling
	// from a 4-omino one at thumbnail size.
	const polyLabel = tiling.polyformOrder ? polyformBoard(tiling.polyformOrder)?.label : undefined;
	const isFreedraw = !!tiling.freedraw;
	const freedrawStats = freedrawStatsOf(tiling);
	const folds = (tileClassOf(tiling) === TILE_CLASSES.STAR && !isHyperbolic) || isMixed ? starFoldsOf(tiling) : [];
	// The chips over the thumbnail: only what the class line below does not say (Convex irregular, Isotoxal,
	// Mixed each used to appear twice on one card). Short words, as on the prototile cards: a card is narrow,
	// and the title says each in full. The same words end the thumbnail button's name, so a voice user can say
	// what they see (WCAG 2.5.3).
	const chips: { text: string; title: string; tone?: BadgeTone; className?: string }[] = [
		tiling.certification
			? {
					...CERT_STYLE[tiling.certification],
					text: CERT_STYLE[tiling.certification].label,
					title: `Completeness: ${tiling.certification}`,
				}
			: null,
		isConvex
			? tiling.decomposableOnly
				? { text: "decomp", title: "every composite tile dissects into regular polygons" }
				: { text: "non-decomp", title: "uses a non-decomposable composite tile" }
			: null,
		isIsotoxal && tiling.offGrid
			? {
					text: "off-grid",
					title:
						"Uses an isotoxal tile not expressible on the ζ₁₂ grid — a tiling the 30°-grid enumeration could not reach",
				}
			: null,
		// Freedraw kind chips: what the faces ARE. A strip or an unbounded sheet is the whole point of the class
		// (these are not tiles in the Grünbaum & Shephard sense), so they get a chip instead of the sub-line.
		freedrawStats?.strips ? { text: "strip", title: "Contains a tile that is an infinite strip" } : null,
		freedrawStats?.unbounded ? { text: "∞", title: "Contains a tile unbounded in both directions" } : null,
		freedrawStats?.withHoles ? { text: "holes", title: "Contains a polyomino with holes" } : null,
		tiling.preview ? { text: "preview", title: "from a still-running solve — partial", tone: "dashed" as const } : null,
		dof >= 2
			? {
					text: glyphs.join(" "),
					title: `${dof}-parameter family — ${glyphs.join(", ")} vary independently (${dof} sliders in Play)`,
					className: "gap-0.5",
				}
			: dof === 1
				? { text: glyphs[0], title: `one-parameter family — ${glyphs[0]} slider in Play` }
				: null,
		...folds.map((n) => ({ text: `${n}★`, title: `${n}-pointed star polygon` })),
	].filter((c) => c !== null);
	const partitionKey = partitionKeyOf(tiling);
	// The vertex-type classification: M distinct configs, and the multiplicity group ("511"). Maximal
	// (m === k, all orbits distinct) is the Krötenheerdt case — shown as "Kröt" since its key is all 1s.
	const classLabel =
		tiling.m != null ? `M${tiling.m}${isMaximal(tiling) ? " · Kröt" : partitionKey ? ` · ${partitionKey}` : ""}` : null;
	// Edge and tile orbits beside k's vertex orbits, where the build computed them.
	const orbitLabel = tiling.edgeOrbits != null ? `e${tiling.edgeOrbits} t${tiling.faceOrbits}` : null;
	// A cell of the library's laned wall: it draws its own hairline (ta-lane-cell), the grid's 8px
	// gap supplies the lane between neighbours, and the cell radius opens the diamonds where four
	// corners meet.
	const wrapperClass = cn(
		// surface-raised, not surface: the lane between cells is the page's own background, so the card
		// has to sit a step above it or the lane reads as part of the card. Hover darkens the hairline
		// and not the fill — in a layout made of lines, that is the louder signal anyway.
		// Only the THUMBNAIL is clickable (AL, 2026-07-23), so on interactive cards the hover signal
		// tracks the thumbnail alone — hovering the inert bottom section changes nothing.
		"ta-lane-cell relative flex flex-col bg-surface-raised transition-all overflow-hidden group text-left",
		onClick
			? "has-[.card-thumb:hover]:[--ta-lane-color:var(--color-line-strong)]"
			: "hover:[--ta-lane-color:var(--color-line-strong)]",
	);

	const openScreenshot = useScreenshotPreview((s) => s.open);
	const handleScreenshot = (e: React.MouseEvent) => {
		e.stopPropagation();
		const dataUrl = renderTilingToDataUrl({ translationalCell: tiling.renderCell, pxPerEdge: 48 }, 1024);
		if (!dataUrl) return;
		const safe = (tiling.id || tiling.family).replace(/[/\\?%*:|"<>]+/g, "-").replace(/^-+|-+$/g, "") || "tiling";
		openScreenshot({
			imageDataUrl: dataUrl,
			filename: `${safe}.png`,
			rulestring: tiling.family,
			groupId: null,
			allowSupabaseUpload: false,
		});
	};

	// What the card says only in hover titles (the discoverer above all), gathered for the phone's info
	// button: a finger has no hover. Desktop keeps the titles and never renders the button.
	const phoneNotes = [
		tiling.discoverer ? `Discovered by ${tiling.discoverer}` : null,
		tiling.certification ? `Completeness: ${tiling.certification}` : null,
		isConvex
			? tiling.decomposableOnly
				? "Decomposable: every composite tile dissects into regular polygons"
				: "Not decomposable: uses a non-decomposable composite tile"
			: null,
		isIsotoxal && tiling.offGrid ? "Off-grid: uses an isotoxal tile not expressible on the ζ₁₂ grid" : null,
		tiling.preview ? "Preview: from a still-running solve, partial" : null,
		dof > 0 ? `${dof}-parameter family: ${glyphs.join(", ")} (${dof === 1 ? "a slider" : "sliders"} in Play)` : null,
		folds.length ? `Star polygons: ${folds.map((n) => `${n}-pointed`).join(", ")}` : null,
		classLabel
			? `${tiling.m} distinct vertex configuration(s)${partitionKey ? `, multiplicities ${tiling.partition?.join("·")}` : ""}`
			: null,
		tiling.wallpaperGroup ? `Wallpaper group ${tiling.wallpaperGroup} (${tiling.latticeShape})` : null,
		tiling.note ?? null,
	].filter((n): n is string => !!n);

	// ‹ n/N › — position within the group's CURRENT members (a narrowing filter can drop variants, so
	// this is the browse position; the sub-line's "v of V" stays the tiling's global variant identity).
	const pager = members ? (
		<span className="flex shrink-0 items-center gap-0.5 text-micro text-fg-muted tabular-nums max-md:-my-3 max-md:-mr-3 max-md:gap-0">
			<button
				type="button"
				aria-label="Previous variant"
				className="cursor-pointer p-0.5 transition-colors hover:text-fg max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"
				onClick={(e) => {
					e.stopPropagation();
					setRawIdx((idx - 1 + members.length) % members.length);
				}}
			>
				<ChevronLeft className="size-icon-xs max-md:size-4" />
			</button>
			<span>
				{idx + 1}/{members.length}
			</span>
			<button
				type="button"
				aria-label="Next variant"
				className="cursor-pointer p-0.5 transition-colors hover:text-fg max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"
				onClick={(e) => {
					e.stopPropagation();
					setRawIdx((idx + 1) % members.length);
				}}
			>
				<ChevronRight className="size-icon-xs max-md:size-4" />
			</button>
		</span>
	) : null;

	const content = (
		<>
			{/* The one clickable region: pointer cursor + role=button here, default cursor below. */}
			<div
				className={cn("card-thumb relative aspect-square bg-surface-raised", onClick && "cursor-pointer")}
				{...(onClick
					? {
							role: "button",
							tabIndex: 0,
							"aria-label": `Open ${tiling.family} in Play${chips.length ? `: ${chips.map((c) => c.text).join(", ")}` : ""}`,
							onClick: () => onClick(tiling),
							onKeyDown: (e: React.KeyboardEvent) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onClick(tiling);
								}
							},
						}
					: {})}
			>
				{tiling.hollow ? (
					<HollowThumbnail patch={tiling.hollow.patch} />
				) : tiling.schwarz ? (
					tiling.schwarz.geometry === GEOMETRIES.SPHERICAL ? (
						<SphSchwarzThumbnail pattern={tiling.schwarz} />
					) : (
						<HyperbolicThumbnail tiling={hypSchwarzMeta(tiling.schwarz)} mode="edges" />
					)
				) : tiling.sphPoly ? (
					<SphPolyThumbnail pattern={tiling.sphPoly} />
				) : tiling.sphStar ? (
					<SphStarThumbnail pattern={tiling.sphStar} />
				) : tiling.pentEdges ? (
					<PentagonEdgesThumbnail pattern={tiling.pentEdges} />
				) : tiling.ihEdges ? (
					<IsohedralEdgesThumbnail pattern={tiling.ihEdges} />
				) : tiling.sphEdges ? (
					<SphSchwarzThumbnail pattern={tiling.sphEdges} />
				) : tiling.hypPoly ? (
					<HyperbolicThumbnail tiling={tiling.hypPoly} mode="tiling" />
				) : tiling.sphBubble ? (
					<SphericalThumbnail solidId={tiling.sphBubble.solid} bubbleBites={tiling.sphBubble.bites} />
				) : tiling.spherical ? (
					<SphericalThumbnail solidId={tiling.spherical.solid} />
				) : tiling.sphColors ? (
					<SphericalColorsThumbnail pattern={tiling.sphColors.pattern} mode="polyhedron" />
				) : tiling.hypColors ? (
					<HyperbolicThumbnail tiling={tiling.hypColors} mode="colors" />
				) : tiling.hypEdges ? (
					<HyperbolicThumbnail tiling={tiling.hypEdges} mode="edges" />
				) : tiling.freedraw ? (
					<FreedrawThumbnail pattern={tiling.freedraw} />
				) : tiling.colors ? (
					<ColorsThumbnail pattern={tiling.colors} />
				) : tiling.developed ? (
					<HyperbolicThumbnail tiling={tiling.developed.patch} mode="tiling" />
				) : (
					<TilingThumbnail translationalCell={cellOf} pxPerEdge={22} />
				)}
				<div className="absolute top-1.5 left-1.5 flex max-w-[calc(100%-2.75rem)] flex-wrap items-center gap-1 empty:hidden">
					{chips.map((c) => (
						<Badge key={c.text} tone={c.tone ?? "raised"} mono caps title={c.title} className={c.className}>
							{c.text}
						</Badge>
					))}
				</div>
				{/* The screenshot path renders the polygon cell — freedraw's is a throwaway, so it is excluded
				    along with the two non-Euclidean renderers. */}
				{SCREENSHOT_BUTTONS_ENABLED &&
				!tiling.developed &&
				!tiling.spherical &&
				!isFreedraw &&
				!tiling.colors &&
				!tiling.hypEdges &&
				!tiling.hollow ? (
					<Tooltip label="Screenshot">
						<Button
							variant="secondary"
							size="icon"
							icon={Camera}
							onClick={handleScreenshot}
							aria-label="Take screenshot"
							className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
						/>
					</Tooltip>
				) : null}
			</div>
			{/* On a phone the whole card is one target: a finger that lands on the name expects the tiling,
			    and a dead half-card reads as broken. The info dot and the variant pager keep their own taps. */}
			<div
				className="relative flex cursor-default flex-col gap-1 px-3 py-2.5 max-md:pr-8"
				onClick={isPhone && onClick ? () => onClick(tiling) : undefined}
			>
				{phoneNotes.length ? (
					<span className="absolute top-3 right-2.5 md:hidden" onClick={(e) => e.stopPropagation()}>
						<InfoDot side="top" label="About this tiling">
							{phoneNotes.map((n) => (
								<p key={n}>{n}</p>
							))}
						</InfoDot>
					</span>
				) : null}
				{isHyperbolic ? (
					// User-facing face: the vertex configuration is the headline, geometry the muted sub-line.
					// Everything technical (valence, edge length ℓ, engine provenance, Poincaré-disk model, the
					// dev id) lives in the /play info panel, not here.
					<>
						<p className="font-mono text-body leading-tight text-fg" title={`vertex configuration ${tiling.family}`}>
							{compactVertexConfig(tiling.family)}
						</p>
						<div className="flex items-end justify-between gap-2">
							<p className="text-micro leading-tight text-fg-muted">
								k={tiling.k} ·{" "}
								{/* grouped: the pager already says n/N, so the "v of V" sub-line segment would repeat it */}
								{tiling.variants && tiling.variants > 1 && !members ? `${tiling.variant} of ${tiling.variants} · ` : ""}
								{TILE_CLASS_LABEL[tileClassOf(tiling)].short}
							</p>
							{pager}
						</div>
					</>
				) : isFreedraw ||
				  tiling.colors ||
				  tiling.schwarz ||
				  tiling.hypEdges ||
				  tiling.sphericalFreedraw ||
				  tiling.sphEdges ||
				  tiling.hypPoly ||
				  tiling.sphPoly ||
				  tiling.sphStar ? (
					// Decorated shelves: no vertex configuration names these, so the family (face composition,
					// board, colour census) is the headline and the k line says what k counts here. Planar
					// freedraw counts grid-point orbits (freedrawKNoun), a colouring counts coloured vertex
					// classes, and off the plane Marek's solvers count vertex orbits of the decorated tiling.
					// The discoverer is on hover, like every other card.
					<>
						<p
							className="font-mono text-small leading-tight font-medium break-words text-fg"
							title={`${tiling.family} · discovered by ${tiling.discoverer}`}
						>
							{tiling.family}
						</p>
						<p className="truncate text-small leading-tight text-fg-muted">
							k={tiling.k}{" "}
							{isFreedraw
								? freedrawKNoun(gridOf(tiling.freedraw!))
								: tiling.colors
									? "colored vertices"
									: "vertex orbits"}
						</p>
						<p className="truncate font-mono text-micro text-fg-muted max-md:hidden" title={tiling.id}>
							{tiling.id}
						</p>
						<PhoneId id={tiling.id} title={tiling.id} className="font-mono text-small text-fg-muted" />
					</>
				) : (
					<>
						{/* The id is what tells two cards on one shelf apart, so it gets the full width; the
						    discoverer is on hover. */}
						<p
							className="truncate font-mono text-ui leading-tight font-medium text-fg max-md:hidden"
							title={`${tiling.id} · discovered by ${tiling.discoverer}`}
						>
							{tiling.id}
						</p>
						<PhoneId id={tiling.id} className="font-mono text-ui leading-tight font-medium text-fg" />
						<p className="truncate text-small leading-tight text-fg-muted" title={tiling.note ?? `{${tiling.family}}`}>
							{/* The class long label names the shelf; where a class holds more than one PALETTE, the
							    palette is what the card should say — "Multiple edge lengths" is true of both tile
							    sets in that class and tells the reader nothing about the tiling in front of them. */}
							k={tiling.k} ·{" "}
							{polyLabel ??
								(edgeBoardOf(tiling)
									? EDGE_BOARD_LABEL[edgeBoardOf(tiling)!]
									: TILE_CLASS_LABEL[tileClassOf(tiling)].long)}
							{/* A bubble tiling has no vertex configuration to name it by — the substrate is always
							    the same triangular tiling — so the PROTOTILE SET is the identity, the way the colour
							    census is for a colouring. "T0×1 T3×1" is the paper's T{0,3}(1:1). */}
							{tileClassOf(tiling) === TILE_CLASSES.BUBBLE ? ` · ${tiling.family}` : ""}
						</p>
						{classLabel || orbitLabel || tiling.wallpaperGroup ? (
							<p
								className="font-mono text-micro leading-tight text-fg-muted"
								title={[
									classLabel
										? `${tiling.m} distinct vertex configuration(s)${partitionKey ? `, multiplicities ${tiling.partition?.join("·")}` : ""}`
										: null,
									orbitLabel ? `${tiling.edgeOrbits} edge orbit(s), ${tiling.faceOrbits} tile orbit(s)` : null,
									tiling.wallpaperGroup ? `wallpaper group ${tiling.wallpaperGroup} (${tiling.latticeShape})` : null,
								]
									.filter(Boolean)
									.join(" · ")}
							>
								{[classLabel, orbitLabel, tiling.wallpaperGroup].filter(Boolean).join(" · ")}
							</p>
						) : null}
					</>
				)}
			</div>
		</>
	);

	return <div className={wrapperClass}>{content}</div>;
}
