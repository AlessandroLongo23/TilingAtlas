import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { ThumbnailSkeleton } from "@/design-system/components/thumbnail-skeleton";
import type { LandingSpecimen } from "@/lib/services/landingData";

// The Library card's media: a 3×3 mosaic of random Euclidean specimens, re-dealt on every visit (the
// picks happen in the browser, dealt.tsx). Nine tiny windows into the 4,596. Until the deal lands
// (`tilings` null) each window holds the skeleton its thumbnail would show while it draws.

interface LibraryMosaicProps {
	tilings: LandingSpecimen[] | null;
}

export function LibraryMosaic({ tilings }: LibraryMosaicProps) {
	const cells = tilings?.slice(0, 9) ?? Array.from({ length: 9 }, () => null);
	return (
		<div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-px bg-line-subtle">
			{cells.map((t, i) => (
				<div key={t?.id ?? i} title={t?.label} className="relative overflow-hidden bg-surface-raised">
					<div className="absolute inset-0">
						{t ? <TilingThumbnail translationalCell={t.cell} pxPerEdge={9} /> : <ThumbnailSkeleton />}
					</div>
				</div>
			))}
		</div>
	);
}
