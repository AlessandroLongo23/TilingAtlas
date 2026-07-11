"use client";

import { cn } from "@/lib/utils/cn";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { polygonClassLabel } from "@/lib/utils/tilingLabel";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// A tiling card in the unified library. Shows the DISCOVERER (historical first-finder) and a
// CERTIFICATION badge (proven / reproduced / candidate — the rigorous completeness status of its
// enumeration level, orthogonal to who discovered it). A "family" one-parameter tiling gets an α chip.
interface ReferenceCardProps {
	tiling: ReferenceTiling;
	onClick?: (t: ReferenceTiling) => void;
}

// Certification is the thesis's headline axis: "proven" (our method certifies the level complete) is a
// strictly stronger claim than "reproduced" (matches published counts) or "candidate" (unestablished).
const CERT_STYLE: Record<ReferenceTiling["certification"], { label: string; cls: string }> = {
	proven: { label: "Proven", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400" },
	reproduced: { label: "Reproduced", cls: "border-line-strong bg-surface-raised text-fg-muted" },
	candidate: { label: "Candidate", cls: "border-amber-400/30 bg-amber-400/10 text-amber-400" },
};

export function ReferenceCard({ tiling, onClick }: ReferenceCardProps) {
	const isFamily = Array.isArray(tiling.alphaRange);
	const wrapperClass = cn(
		"relative flex flex-col rounded-lg border border-line bg-surface-overlay/30 hover:border-line-strong hover:bg-surface-overlay/50 transition-colors overflow-hidden group",
		onClick && "cursor-pointer text-left",
	);

	const content = (
		<>
			<div className="relative aspect-square bg-surface-raised">
				<TilingThumbnail translationalCell={tiling.renderCell} pxPerEdge={22} />
			</div>
			<div className="flex flex-col px-2.5 py-2 gap-1.5">
				<div className="flex flex-wrap items-center gap-1">
					<span
						className={cn(
							"inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
							CERT_STYLE[tiling.certification].cls,
						)}
						title={`Completeness: ${tiling.certification}`}
					>
						{CERT_STYLE[tiling.certification].label}
					</span>
					{tiling.preview ? (
						<span className="inline-flex items-center rounded-full border border-orange-400/30 bg-orange-400/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-400" title="from a still-running solve — partial">
							preview
						</span>
					) : null}
					{isFamily ? (
						<span className="inline-flex items-center rounded-full border border-violet-400/25 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400" title="one-parameter family — α slider in Play">
							α
						</span>
					) : null}
				</div>
				<p className="text-[10px] text-fg-muted truncate" title={`discovered by ${tiling.discoverer}`}>
					{tiling.discoverer}
				</p>
				<p className="text-xs text-fg-secondary font-mono leading-tight" title={`{${tiling.family}}`}>
					k={tiling.k} · {polygonClassLabel(tiling.family)}
				</p>
				<p className="text-[10px] text-fg-disabled font-mono truncate" title={tiling.id}>
					{tiling.id}
				</p>
			</div>
		</>
	);

	if (onClick) {
		return (
			<div
				className={wrapperClass}
				role="button"
				tabIndex={0}
				onClick={() => onClick(tiling)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick(tiling);
					}
				}}
			>
				{content}
			</div>
		);
	}
	return <div className={wrapperClass}>{content}</div>;
}
