"use client";

import { useState } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { HyperbolicDevelopedThumbnail } from "@/components/hyperbolic-developed-thumbnail";
import { SphericalThumbnail } from "@/components/spherical-thumbnail";
import { FreedrawThumbnail } from "@/components/freedraw/freedraw-thumbnail";
import { renderTilingToDataUrl } from "@/lib/utils/renderTiling";
import { SCREENSHOT_BUTTONS_ENABLED } from "@/lib/utils/featureFlags";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import {
	compactVertexConfig,
	freedrawStatsOf,
	isMaximal,
	partitionKeyOf,
	starFoldsOf,
	tileClassOf,
	TILE_CLASS_LABEL,
	type Certification,
	type ReferenceTiling,
} from "@/lib/services/referenceAtlas";

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
const CERT_STYLE: Record<Certification, { label: string; cls: string }> = {
	proven: { label: "Proven", cls: "border-fg bg-fg text-fg-inverse" },
	reproduced: { label: "Reproduced", cls: "border-line-strong bg-surface-raised text-fg-muted" },
	candidate: { label: "Candidate", cls: "border-dashed border-line-strong bg-transparent text-fg-muted" },
};

export function ReferenceCard({ tiling: baseTiling, group, onClick }: ReferenceCardProps) {
	// The variant pager. rawIdx is clamped, not reset, when a filter shrinks the group under the same
	// card key — the shelf remounts the card (new key) only when the group's identity changes.
	const [rawIdx, setRawIdx] = useState(0);
	const members = group && group.length > 1 ? group : null;
	const idx = members ? Math.min(rawIdx, members.length - 1) : 0;
	const tiling = members ? members[idx] : baseTiling;
	const isFamily = Array.isArray(tiling.alphaRange);
	// Degrees of freedom = independent sliders in Play. 2+ (α, β, …) get their own badge.
	const dof = tiling.paramCell?.params?.length ?? (isFamily ? 1 : 0);
	const GREEK = ["α", "β", "γ", "δ", "ε"];
	const isHyperbolic = tileClassOf(tiling) === "hyperbolic";
	const isConvex = tileClassOf(tiling) === "convex";
	const isIsotoxal = tileClassOf(tiling) === "isotoxal";
	const isMixed = tileClassOf(tiling) === "mixed";
	const isFreedraw = !!tiling.freedraw;
	const freedrawStats = freedrawStatsOf(tiling);
	const folds = tileClassOf(tiling) === "star" || isMixed ? starFoldsOf(tiling) : [];
	const partitionKey = partitionKeyOf(tiling);
	// The vertex-type classification: M distinct configs, and the multiplicity group ("511"). Maximal
	// (m === k, all orbits distinct) is the Krötenheerdt case — shown as "Kröt" since its key is all 1s.
	const classLabel =
		tiling.m != null
			? `M${tiling.m}${isMaximal(tiling) ? " · Kröt" : partitionKey ? ` · ${partitionKey}` : ""}`
			: null;
	// A cell of the library's laned wall: it draws its own hairline (ta-lane-cell), the grid's 8px
	// gap supplies the lane between neighbours, and the cell radius opens the diamonds where four
	// corners meet.
	const wrapperClass = cn(
		// surface-raised, not surface: the lane between cells is the page's own background, so the card
		// has to sit a step above it or the lane reads as part of the card. Hover darkens the hairline
		// rather than the fill — in a layout made of lines, that is the louder signal anyway.
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
		const dataUrl = renderTilingToDataUrl(
			{ translationalCell: tiling.renderCell, pxPerEdge: 48, background: "#1e1e22" },
			1024,
		);
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

	// ‹ n/N › — position within the group's CURRENT members (a narrowing filter can drop variants, so
	// this is the browse position; the sub-line's "v of V" stays the tiling's global variant identity).
	const pager = members ? (
		<span className="flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-fg-muted">
			<button
				type="button"
				aria-label="Previous variant"
				className="cursor-pointer p-0.5 transition-colors hover:text-fg"
				onClick={() => setRawIdx((idx - 1 + members.length) % members.length)}
			>
				<ChevronLeft size={12} />
			</button>
			<span>
				{idx + 1}/{members.length}
			</span>
			<button
				type="button"
				aria-label="Next variant"
				className="cursor-pointer p-0.5 transition-colors hover:text-fg"
				onClick={() => setRawIdx((idx + 1) % members.length)}
			>
				<ChevronRight size={12} />
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
							"aria-label": `Open ${tiling.family} in Play`,
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
				{tiling.spherical ? (
					<SphericalThumbnail solidId={tiling.spherical.solid} />
				) : tiling.freedraw ? (
					<FreedrawThumbnail pattern={tiling.freedraw} />
				) : tiling.developed ? (
					<HyperbolicDevelopedThumbnail patch={tiling.developed.patch} />
				) : (
					<TilingThumbnail translationalCell={tiling.renderCell} pxPerEdge={22} />
				)}
				{/* The screenshot path renders the polygon cell — freedraw's is a throwaway, so it is excluded
				    along with the two non-Euclidean renderers. */}
				{SCREENSHOT_BUTTONS_ENABLED && !tiling.developed && !tiling.spherical && !isFreedraw ? (
					<button
						type="button"
						onClick={handleScreenshot}
						title="Screenshot"
						aria-label="Take screenshot"
						className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-surface-overlay/80 border border-line-strong text-fg-muted hover:text-fg hover:bg-surface-overlay opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
					>
						<Camera size={13} />
					</button>
				) : null}
			</div>
			<div className="flex flex-col px-2.5 py-2 gap-1.5 cursor-default">
				<div className="flex flex-wrap items-center gap-1">
					{tiling.certification ? (
						<span
							className={cn(
								"inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
								CERT_STYLE[tiling.certification].cls,
							)}
							title={`Completeness: ${tiling.certification}`}
						>
							{CERT_STYLE[tiling.certification].label}
						</span>
					) : null}
					{isConvex ? (
						<>
							<span
								className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
								title={tiling.note ?? "Tiling built from convex-irregular unit-edge tiles (exact ℤ[ζ₂₄] distinct-count dedup)"}
							>
								Convex irregular
							</span>
							<span
								className={cn(
									"inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
									tiling.decomposableOnly
										? "border-line bg-transparent text-fg-secondary"
										: "border-dashed border-line-strong bg-transparent text-fg-muted",
								)}
								title={
									tiling.decomposableOnly
										? "every composite tile dissects into regular polygons"
										: "uses a non-decomposable composite tile"
								}
							>
								{tiling.decomposableOnly ? "decomposable" : "non-decomp"}
							</span>
						</>
					) : null}
					{isIsotoxal ? (
						<>
							<span
								className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
								title={tiling.note ?? "Tiling using a convex isotoxal tile (two alternating angles, ζ₂₄ grid)"}
							>
								Isotoxal
							</span>
							{tiling.offGrid ? (
								<span
									className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
									title="Uses an isotoxal tile not expressible on the ζ₁₂ grid — a tiling the 30°-grid enumeration could not reach"
								>
									off-grid
								</span>
							) : null}
						</>
					) : null}
					{isMixed ? (
						<span
							className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
							title={tiling.note ?? "Convex isotoxal tile AND a concave star tile in one tiling (area-certified)"}
						>
							Mixed
						</span>
					) : null}
					{/* Freedraw kind chips: what the faces ARE. A strip or an unbounded sheet is the whole point
					    of the class — these are not tiles in the Grünbaum & Shephard sense — so they get a
					    badge rather than being buried in the sub-line. */}
					{isFreedraw && freedrawStats ? (
						<>
							{freedrawStats.strips > 0 ? (
								<span
									className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
									title="Contains a tile that is an infinite strip"
								>
									strip
								</span>
							) : null}
							{freedrawStats.unbounded > 0 ? (
								<span
									className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
									title="Contains a tile unbounded in both directions"
								>
									∞
								</span>
							) : null}
							{freedrawStats.withHoles > 0 ? (
								<span
									className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
									title="Contains a polyomino with holes"
								>
									holes
								</span>
							) : null}
						</>
					) : null}
					{tiling.preview ? (
						<span className="inline-flex items-center border border-dashed border-line-strong bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted" title="from a still-running solve — partial">
							preview
						</span>
					) : null}
					{dof >= 2 ? (
						<span
							className="inline-flex items-center gap-0.5 border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
							title={`${dof}-parameter family — ${GREEK.slice(0, dof).join(", ")} vary independently (${dof} sliders in Play)`}
						>
							{GREEK.slice(0, dof).join(" ")}
						</span>
					) : isFamily ? (
						<span className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted" title="one-parameter family — α slider in Play">
							α
						</span>
					) : null}
					{folds.map((n) => (
						<span
							key={n}
							className="inline-flex items-center border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
							title={`${n}-pointed star polygon`}
						>
							{n}★
						</span>
					))}
				</div>
				{isHyperbolic ? (
					// User-facing face: the vertex configuration is the headline, geometry the muted sub-line.
					// Everything technical (valence, edge length ℓ, engine provenance, Poincaré-disk model, the
					// dev id) lives in the /play info panel, not here.
					<>
						<p className="text-sm text-fg font-mono leading-tight" title={`vertex configuration ${tiling.family}`}>
							{compactVertexConfig(tiling.family)}
						</p>
						<div className="flex items-end justify-between gap-2">
							<p className="text-[10px] text-fg-muted leading-tight">
								k={tiling.k} ·{" "}
								{/* grouped: the pager already says n/N, so the "v of V" sub-line segment would repeat it */}
								{tiling.variants && tiling.variants > 1 && !members ? `${tiling.variant} of ${tiling.variants} · ` : ""}
								{TILE_CLASS_LABEL[tileClassOf(tiling)].short}
							</p>
							{pager}
						</div>
					</>
				) : isFreedraw ? (
					// Freedraw: the face composition is the headline (there is no vertex configuration to name it
					// by), and k is spelled out as grid-point orbits — the same axis as everywhere else, a
					// different quantity. See ReferenceTiling.freedraw.
					<>
						<p className="text-[10px] text-fg-muted truncate" title={`discovered by ${tiling.discoverer}`}>
							{tiling.discoverer}
						</p>
						<p className="text-xs text-fg-secondary font-mono leading-tight" title={tiling.family}>
							{tiling.family}
						</p>
						<p className="text-[10px] text-fg-muted leading-tight" title="grid-point orbits of the decoration, not vertex orbits of a tiling">
							k={tiling.k} grid-point orbits
						</p>
						<p className="text-[10px] text-fg-disabled font-mono truncate" title={tiling.id}>
							{tiling.id}
						</p>
					</>
				) : (
					<>
						<p className="text-[10px] text-fg-muted truncate" title={`discovered by ${tiling.discoverer}`}>
							{tiling.discoverer}
						</p>
						<p className="text-xs text-fg-secondary font-mono leading-tight" title={`{${tiling.family}}`}>
							k={tiling.k} · {TILE_CLASS_LABEL[tileClassOf(tiling)].long}
						</p>
						{classLabel || tiling.wallpaperGroup ? (
							<p
								className="text-[10px] text-fg-muted font-mono leading-tight"
								title={`${classLabel ? `${tiling.m} distinct vertex configuration(s)${partitionKey ? `, multiplicities ${tiling.partition?.join("·")}` : ""}` : ""}${tiling.wallpaperGroup ? ` · wallpaper group ${tiling.wallpaperGroup} (${tiling.latticeShape})` : ""}`.trim()}
							>
								{classLabel}
								{classLabel && tiling.wallpaperGroup ? " · " : null}
								{tiling.wallpaperGroup ? <span className="text-fg-muted">{tiling.wallpaperGroup}</span> : null}
							</p>
						) : null}
						<p className="text-[10px] text-fg-disabled font-mono truncate" title={tiling.id}>
							{tiling.id}
						</p>
					</>
				)}
			</div>
		</>
	);

	return <div className={wrapperClass}>{content}</div>;
}
