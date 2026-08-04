"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import type { VCWithOccurrences } from "@/classes/Tiling";
import { colorLetter } from "@/lib/colors/pattern";
import type { TilingSpec } from "@/lib/services/tilingSpec";
import { compactVertexConfig } from "@/lib/services/referenceAtlas";
import { TILING_LEVEL_LABEL, TILING_LEVEL_NOTE } from "@/lib/tilings/tiling-level";
import { VertexConfigurationThumbnail } from "./vertex-configuration-thumbnail";
import { Button } from "./ui/button";

interface TilingInfoProps {
	spec: TilingSpec | null;
	/** Euclidean vertex-configuration thumbnails, computed by the flat canvas. Empty for other geometries. */
	vcs?: VCWithOccurrences[];
}

const GEOMETRY_LABEL: Record<TilingSpec["geometry"], string> = {
	euclidean: "Euclidean",
	hyperbolic: "Hyperbolic",
	spherical: "Spherical",
};

function SectionTitle({ children }: { children: ReactNode }) {
	return <h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider">{children}</h4>;
}

/**
 * One "Label   value" row. `muted` renders a de-emphasised placeholder for a not-yet-computed field.
 *
 * `stack` puts the value on its own line beneath the label, for values too long to sit beside one: a
 * five-angle list wraps to three lines in the value column, and the side-by-side layout then centres
 * the label against the middle of that block, which reads as a misalignment rather than as a pair.
 */
function Row({
	label,
	value,
	muted,
	stack,
	title,
}: {
	label: string;
	value: ReactNode;
	muted?: boolean;
	stack?: boolean;
	/** Native tooltip on the whole row, for a term whose one-line gloss will not fit the layout. */
	title?: string;
}) {
	const valueClass = muted ? "text-sm italic text-fg-muted/60" : "text-sm font-medium text-fg";
	if (stack) {
		return (
			<div className="flex flex-col gap-0.5" title={title}>
				<span className="text-sm text-fg-secondary">{label}</span>
				<span className={valueClass}>{value}</span>
			</div>
		);
	}
	return (
		<div className="flex items-center justify-between gap-4" title={title}>
			<span className="text-sm text-fg-secondary">{label}</span>
			<span className={valueClass}>{value}</span>
		</div>
	);
}

/**
 * Whether the orbit section has anything to say.
 *
 * The catalogue always knows k, so this is true there. /pentagons knows none of the four — a monohedral
 * pentagon tiling's tile-orbit count is not something this page derives — and a section of four dashes
 * says less than no section at all.
 */
function hasOrbitFacts(spec: TilingSpec): boolean {
	return spec.k != null || spec.m != null || spec.edgeOrbits != null || spec.faceOrbits != null;
}

// Orbit section — shown for every geometry. m is hidden when absent; edge/tile orbits are flagged.
function OrbitSection({ spec }: { spec: TilingSpec }) {
	// Freedraw's k counts GRID-POINT orbits of the decoration — grid points with no drawn edge included —
	// not vertex orbits of a tiling. Same axis, different quantity, so it never borrows the "Vertices" label.
	// The parametric-pentagon edge shelf is euclidean and freedraw-CLASS, but its k counts VERTEX orbits
	// (Marek's "Number of vertices"), not grid points, so it must not borrow freedraw's label.
	const isFreedraw = spec.geometry === "euclidean" && !!spec.freedraw;
	// Colors' k is a vertex-orbit count, but of the COLORED tiling (orbits under color-preserving
	// symmetry only), so it gets its own label instead of borrowing the bare "Vertices".
	const isColors = spec.geometry === "euclidean" && !!spec.colors;
	return (
		<div className="flex flex-col gap-1.5">
			<SectionTitle>Orbits</SectionTitle>
			<Row
				label={isFreedraw ? "Grid points (k)" : isColors ? "Colored vertices (k)" : "Vertices (k)"}
				value={spec.k ?? "—"}
			/>
			{spec.m != null ? (
				<Row
					label="VC types (m)"
					value={spec.partition ? `${spec.m} [${spec.partition.join("·")}]` : String(spec.m)}
				/>
			) : null}
			{/* Čtrnáct's level sits with k and m because it IS the pair (k, m) plus one further test: do the
			    vertex configurations agree as multisets. Absent off the curved regular-polygon shelves. */}
			{spec.level ? (
				<Row label="Level" value={TILING_LEVEL_LABEL[spec.level]} title={TILING_LEVEL_NOTE[spec.level]} />
			) : null}
			<Row label="Edge orbits" value={spec.edgeOrbits ?? "not computed"} muted={spec.edgeOrbits == null} />
			<Row label="Tile orbits" value={spec.faceOrbits ?? "not computed"} muted={spec.faceOrbits == null} />
		</div>
	);
}

export function TilingInfo({ spec, vcs = [] }: TilingInfoProps) {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<div
			className="relative"
			role="group"
			aria-label="Tiling information"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Sits over the tiling canvas — needs an opaque fill, not the variant's transparent one. */}
			<Button
				variant="secondary"
				size="icon"
				icon={Info}
				aria-label="Tiling information"
				classes="bg-surface-raised hover:bg-surface-raised shadow-sm"
			/>

			{isHovered && spec ? (
				<div className="absolute left-0 top-10 z-50 min-w-56 max-w-[340px] rounded-lg border border-line bg-surface-overlay/95 p-3 shadow-xl backdrop-blur-sm">
					<div className="flex flex-col gap-3">
						{/* Header: Schläfli / vertex-config label + geometry (+ solid name for spherical) */}
						<div className="flex flex-col gap-0.5">
							<div className="flex min-w-0 items-baseline justify-between gap-3">
								<span className="min-w-0 truncate font-mono text-sm font-semibold text-fg" title={spec.label}>
									{compactVertexConfig(spec.label)}
								</span>
								<span className="shrink-0 text-xs text-fg-muted">{GEOMETRY_LABEL[spec.geometry]}</span>
							</div>
							{spec.geometry === "spherical" ? (
								<span className="text-xs text-fg-secondary">{spec.solidName}</span>
							) : spec.geometry === "hyperbolic" ? (
								<span className="text-xs text-fg-secondary">Poincaré disk</span>
							) : spec.geometry === "euclidean" && spec.freedraw ? (
								<span className="text-xs text-fg-secondary">Freedraw edge pattern</span>
							) : null}
						</div>

						{/* Symmetry — Euclidean */}
						{spec.geometry === "euclidean" && (spec.wallpaperGroup || spec.latticeShape) ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Symmetry</SectionTitle>
								{spec.wallpaperGroup ? (
									<Row
										label="Group"
										value={
											<span className="font-mono">
												<span>{spec.wallpaperGroup}</span>
												{spec.orbifold ? <span className="ml-1.5 text-fg-muted">{spec.orbifold}</span> : null}
											</span>
										}
									/>
								) : null}
								{spec.latticeShape ? (
									<Row label="Lattice" value={<span className="capitalize">{spec.latticeShape}</span>} />
								) : null}
							</div>
						) : null}

						{/* Tiles — Freedraw. The faces of the drawn edge set, which are NOT tiles in the Grünbaum
						    & Shephard sense: a face may be an infinite strip or a sheet unbounded in both
						    directions, so the breakdown by kind is the whole story here. */}
						{spec.geometry === "euclidean" && spec.freedraw ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Tiles</SectionTitle>
								{spec.freedraw.finite > 0 ? <Row label="Finite polyominoes" value={spec.freedraw.finite} /> : null}
								{spec.freedraw.strips > 0 ? <Row label="Infinite strips" value={spec.freedraw.strips} /> : null}
								{spec.freedraw.unbounded > 0 ? <Row label="Unbounded sheets" value={spec.freedraw.unbounded} /> : null}
								{spec.freedraw.withHoles > 0 ? <Row label="With holes" value={spec.freedraw.withHoles} /> : null}
								{/* Hermite normal form: generated by (a,0) and (b,d). Kept on one nowrap line — the pair
								    split across two lines mid-tuple, which read as four separate numbers. */}
								<Row
									label="Period lattice"
									value={
										<span className="font-mono whitespace-nowrap">
											({spec.freedraw.lattice.a},0) ({spec.freedraw.lattice.b},{spec.freedraw.lattice.d})
										</span>
									}
								/>
								<Row label="Lattice index" value={spec.freedraw.lattice.a * spec.freedraw.lattice.d} />
							</div>
						) : null}

						{/* Tiles — Colored squares: the color census of one period plus the folded colored
						    vertex figures, the certificate's own vocabulary for this class. */}
						{spec.geometry === "euclidean" && spec.colors ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Coloring</SectionTitle>
								<Row
									label="Grid"
									value={
										spec.colors.grid === "square"
											? "squares"
											: spec.colors.grid === "triangle"
												? "triangles"
												: "triangles + squares"
									}
								/>
								{spec.colors.census.map((n, i) => (
									<Row key={i} label={`${colorLetter(i)} cells / period`} value={n} />
								))}
								<Row
									label="Period lattice"
									value={
										<span className="font-mono whitespace-nowrap">
											{spec.colors.patch
												? `T1 (${spec.colors.patch.T1[0]}, ${spec.colors.patch.T1[1]}), T2 (${spec.colors.patch.T2[0]}, ${spec.colors.patch.T2[1]})`
												: `(${spec.colors.lattice.a},0) (${spec.colors.lattice.b},${spec.colors.lattice.d})`}
										</span>
									}
								/>
								<Row label="Cells / period" value={spec.colors.cells} />
								{spec.colors.vcs.map((vc, i) => (
									<Row
										key={i}
										label={i === 0 ? "Vertex figures" : ""}
										value={<span className="font-mono whitespace-nowrap">{vc}</span>}
									/>
								))}
							</div>
						) : null}

						{/* Tiles — Hyperbolic (always; the honest tile/edge facts moved off the card) */}
						{spec.geometry === "hyperbolic" ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Tiles</SectionTitle>
								{spec.schlafli ? (
									<Row
										label="Schläfli"
										value={<span className="font-mono">{`{${spec.schlafli[0]},${spec.schlafli[1]}}`}</span>}
									/>
								) : null}
								{spec.faces.length > 0 ? (
									<Row label="Face sizes" value={<span className="font-mono">{`{${spec.faces.join(",")}}`}</span>} />
								) : null}
								{spec.valence > 0 ? <Row label="Valence (d)" value={spec.valence} /> : null}
								{spec.edge != null ? (
									<Row label="Edge length ℓ" value={<span className="font-mono">{spec.edge.toFixed(3)}</span>} />
								) : null}
							</div>
						) : null}

						{/* Symmetry — Hyperbolic: ONLY for regular {p,q}. Non-regular configs get no Coxeter row (we
						    do not invert the vertex config into a Wythoff symbol). */}
						{spec.geometry === "hyperbolic" && spec.coxeter ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Symmetry</SectionTitle>
								<Row
									label="Coxeter"
									value={
										<span className="font-mono">
											<span>{spec.coxeter}</span>
											{spec.orbifold ? <span className="ml-1.5 text-fg-muted">{spec.orbifold}</span> : null}
										</span>
									}
								/>
							</div>
						) : null}

						{/* Symmetry — Spherical (Platonic only) */}
						{spec.geometry === "spherical" && spec.pointGroup ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Symmetry</SectionTitle>
								<Row
									label="Point group"
									value={
										<span className="font-mono">
											<span>{spec.pointGroup}</span>
											{spec.orbifold ? <span className="ml-1.5 text-fg-muted">{spec.orbifold}</span> : null}
										</span>
									}
								/>
							</div>
						) : null}

						{/* Counts — Spherical (Platonic only) */}
						{spec.geometry === "spherical" && spec.counts ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Counts (V − E + F = 2)</SectionTitle>
								<Row label="Vertices" value={spec.counts.V} />
								<Row label="Edges" value={spec.counts.E} />
								<Row label="Faces" value={spec.counts.F} />
							</div>
						) : null}

						{/* Parameterization — /isohedral. The tiling vertices, aspects and edge symmetries ARE
						    the type here; a vertex configuration would say nothing, since the tile is a free
						    shape. See lib/isohedral/catalogue.ts for where each number comes from. */}
						{spec.geometry === "euclidean" && spec.isohedral ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Parameterization</SectionTitle>
								{spec.isohedral.marked ? (
									<Row label="Status" value="needs interior markings" muted />
								) : (
									<>
										<Row label="Parameters" value={spec.isohedral.numParams} />
										<Row label="Tiling vertices" value={spec.isohedral.numVertices} />
										<Row label="Aspects" value={spec.isohedral.numAspects} />
										<Row
											label="Edge shapes"
											value={<span className="font-mono">{spec.isohedral.edgeShapes.join(" ")}</span>}
										/>
										<Row
											label="Edge word"
											value={<span className="font-mono">{spec.isohedral.edgeWord}</span>}
										/>
										<Row label="Colours" value={spec.isohedral.numColours} />
										<Row label="Unit cell" value={`${spec.isohedral.tilesPerCell} tiles, instanced`} />
										{spec.isohedral.degenerate ? (
											<Row label="Prototile" value="self-overlapping" muted />
										) : null}
									</>
								)}
							</div>
						) : null}

						{/* Family — /pentagons. Kershner's fifteen types: who found each and when is half the
						    subject, so it leads. Angles and sides are the solved pentagon, not the sliders. */}
						{spec.geometry === "euclidean" && spec.pentagon ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Family</SectionTitle>
								<Row label="Discovered" value={spec.pentagon.discovered} />
								<Row label="Freedom" value={spec.pentagon.dof === 0 ? "rigid" : spec.pentagon.dof} />
								<Row label="Tiles per unit" value={spec.pentagon.tilesPerUnit} />
								<Row stack label="Wallpaper groups" value={<span className="font-mono">{spec.pentagon.groups}</span>} />
								{spec.pentagon.angles ? (
									<Row
										stack
										label="Angles"
										value={
											<span className="font-mono">{spec.pentagon.angles.map((a) => a.toFixed(2)).join(", ")}</span>
										}
									/>
								) : null}
								{spec.pentagon.sides ? (
									<Row
										stack
										label="Sides"
										value={
											<span className="font-mono">{spec.pentagon.sides.map((s) => s.toFixed(4)).join(", ")}</span>
										}
									/>
								) : null}
								{spec.pentagon.status ? <Row label="Status" value={spec.pentagon.status} muted /> : null}
							</div>
						) : null}

						{/* Orbits — every geometry that knows any of them */}
						{hasOrbitFacts(spec) ? (
							<div className="border-t border-line pt-3">
								<OrbitSection spec={spec} />
							</div>
						) : null}

						{/* Vertex-configuration thumbnails — Euclidean only */}
						{spec.geometry === "euclidean" && vcs.length > 0 ? (
							<div className="border-t border-line pt-3">
								<SectionTitle>Vertex configurations</SectionTitle>
								<div className="mt-2 flex flex-wrap gap-3">
									{vcs.map(({ vc, occurrences }, i) => (
										<div key={vc.name + i} className="w-24 shrink-0">
											<VertexConfigurationThumbnail
												vc={vc}
												size={96}
												showName
												showOccurrences
												occurrences={occurrences}
											/>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
