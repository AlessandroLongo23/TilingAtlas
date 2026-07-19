"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import type { VCWithOccurrences } from "@/classes/Tiling";
import type { TilingSpec } from "@/lib/services/tilingSpec";
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

// One "Label   value" row. `muted` renders a de-emphasised placeholder for a not-yet-computed field.
function Row({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="text-sm text-fg-secondary">{label}</span>
			<span className={muted ? "text-sm italic text-fg-muted/60" : "text-sm font-medium text-fg"}>
				{value}
			</span>
		</div>
	);
}

// Three Coxeter–Dynkin nodes; filled when the corresponding mirror is ringed (active).
function RingDiagram({ rings }: { rings: [boolean, boolean, boolean] }) {
	return (
		<span className="inline-flex items-center gap-0.5 font-mono">
			{rings.map((on, i) => (
				<span key={i}>{on ? "●" : "○"}</span>
			))}
		</span>
	);
}

// Orbit section — shown for every geometry. m is hidden when absent; edge/tile orbits are flagged.
function OrbitSection({ spec }: { spec: TilingSpec }) {
	return (
		<div className="flex flex-col gap-1.5">
			<SectionTitle>Orbits</SectionTitle>
			<Row label="Vertices (k)" value={spec.k ?? "—"} />
			{spec.m != null ? (
				<Row
					label="VC types (m)"
					value={spec.partition ? `${spec.m} [${spec.partition.join("·")}]` : String(spec.m)}
				/>
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
			<Button variant="secondary" size="icon" icon={Info} aria-label="Tiling information" />

			{isHovered && spec ? (
				<div className="absolute left-0 top-10 z-50 min-w-56 max-w-[340px] rounded-lg border border-line bg-surface-overlay/95 p-3 shadow-xl backdrop-blur-sm">
					<div className="flex flex-col gap-3">
						{/* Header: Schläfli / vertex-config label + geometry (+ solid name for spherical) */}
						<div className="flex flex-col gap-0.5">
							<div className="flex items-baseline justify-between gap-3">
								<span className="font-mono text-sm font-semibold text-fg">{spec.label}</span>
								<span className="text-xs text-fg-muted">{GEOMETRY_LABEL[spec.geometry]}</span>
							</div>
							{spec.geometry === "spherical" ? (
								<span className="text-xs text-fg-secondary">{spec.solidName}</span>
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

						{/* Symmetry — Hyperbolic */}
						{spec.geometry === "hyperbolic" ? (
							<div className="flex flex-col gap-1.5 border-t border-line pt-3">
								<SectionTitle>Symmetry</SectionTitle>
								<Row
									label="Group"
									value={
										<span className="font-mono">
											<span>{spec.coxeter}</span>
											<span className="ml-1.5 text-fg-muted">{spec.orbifold}</span>
										</span>
									}
								/>
								<Row label="Coxeter–Dynkin" value={<RingDiagram rings={spec.rings} />} />
								{spec.snub ? <Row label="Form" value="snub" /> : null}
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

						{/* Orbits — every geometry */}
						<div className="border-t border-line pt-3">
							<OrbitSection spec={spec} />
						</div>

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
