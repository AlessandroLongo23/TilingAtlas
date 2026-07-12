"use client";

import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { FAMILY_LABELS, type Prototile } from "@/lib/tiles/prototiles";

// One prototile SHAPE as a card — a single polygon through the real thumbnail renderer. Mirrors the
// ReferenceCard shell (same wrapper/thumb/meta classes) so the gallery reads like the Library.
const BADGE_STYLE: Record<string, string> = {
	decomposable: "border-teal-400/30 bg-teal-400/10 text-teal-400",
	"non-decomp": "border-amber-400/30 bg-amber-400/10 text-amber-400",
	"ζ₁₂": "border-indigo-400/30 bg-indigo-400/10 text-indigo-400",
	convex: "border-purple-400/30 bg-purple-400/10 text-purple-400",
	star: "border-rose-400/30 bg-rose-400/10 text-rose-400",
};

export function PrototileCard({ tile }: { tile: Prototile }) {
	return (
		<div className="relative flex flex-col rounded-lg border border-line bg-surface-overlay/30 hover:border-line-strong hover:bg-surface-overlay/50 transition-colors overflow-hidden group">
			<div className="relative aspect-square bg-surface-raised">
				<TilingThumbnail
					polygons={[{ n: tile.sideCount, vertices: tile.vertices, star: tile.star }]}
					pxPerEdge={28}
				/>
			</div>
			<div className="flex flex-col px-2.5 py-2 gap-1.5">
				<div className="flex flex-wrap items-center gap-1">
					<span className="inline-flex items-center rounded-full border border-line-strong bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
						{FAMILY_LABELS[tile.family]}
					</span>
					{tile.badges.map((b) => (
						<span
							key={b}
							className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
								BADGE_STYLE[b] ?? "border-line-strong bg-surface-raised text-fg-muted"
							}`}
						>
							{b}
						</span>
					))}
				</div>
				<p className="text-xs text-fg-secondary font-mono leading-tight" title={tile.name}>
					{tile.name}
				</p>
				<p className="text-[10px] text-fg-disabled font-mono leading-tight">{tile.sideCount} sides</p>
			</div>
		</div>
	);
}
