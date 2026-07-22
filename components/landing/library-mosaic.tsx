import { TilingThumbnail } from "@/components/tiling-thumbnail";
import type { LandingSpecimen } from "@/lib/services/landingData";

// The Library card's media: a 3×3 mosaic of random Euclidean specimens, re-dealt on every page
// load (the picks happen server-side in landingData). Nine tiny windows into the 4,596.

interface LibraryMosaicProps {
	tilings: LandingSpecimen[];
}

export function LibraryMosaic({ tilings }: LibraryMosaicProps) {
	return (
		<div className="grid grid-cols-3 grid-rows-3 gap-px w-full h-full bg-line-subtle">
			{tilings.slice(0, 9).map((t) => (
				<div key={t.id} title={t.label} className="relative overflow-hidden bg-surface-raised">
					<div className="absolute inset-0">
						<TilingThumbnail translationalCell={t.cell} pxPerEdge={9} />
					</div>
				</div>
			))}
		</div>
	);
}
