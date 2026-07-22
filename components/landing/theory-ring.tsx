import { TilingThumbnail } from "@/components/tiling-thumbnail";
import type { LandingSpecimen } from "@/lib/services/landingData";

// The Theory card's media: the 11 uniform tilings as a ring of micro-previews — the whole finite
// extent of the classical result visible at a glance (the one deliberate homage to Seeing Theory's
// chapter ring). Positions are static math; the thumbnails are the usual lazy canvases.

interface TheoryRingProps {
	tilings: LandingSpecimen[];
}

export function TheoryRing({ tilings }: TheoryRingProps) {
	const n = tilings.length || 1;
	return (
		<div className="relative w-full h-full">
			<div className="absolute inset-0 flex items-center justify-center">
				<div className="relative aspect-square h-[92%]">
					{tilings.map((t, i) => {
						// Start at 12 o'clock, clockwise. Ring radius in % of the square container.
						const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
						const cx = 50 + 36 * Math.cos(a);
						const cy = 50 + 36 * Math.sin(a);
						return (
							<div
								key={t.id}
								title={t.label}
								className="absolute w-[24%] aspect-square overflow-hidden border border-line"
								style={{ left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%, -50%)" }}
							>
								<TilingThumbnail translationalCell={t.cell} pxPerEdge={7} />
							</div>
						);
					})}
					<div className="absolute inset-0 flex items-center justify-center">
						<span className="text-[10px] font-mono text-fg-muted">the 11</span>
					</div>
				</div>
			</div>
		</div>
	);
}
