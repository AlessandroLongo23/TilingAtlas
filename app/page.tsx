import { loadLandingData } from "@/lib/services/landingData";
import { AtlasWall } from "@/components/atlas-wall";
import { AtlasWallScaler } from "@/components/atlas-wall-scaler";

// The Atlas Wall landing (spec: docs/superpowers/specs/2026-07-21-landing-atlas-wall-design.md).
// force-dynamic: the daily specimen is date-seeded and the muted specimens re-deal per request.
export const dynamic = "force-dynamic";

export default async function HomePage() {
	const data = await loadLandingData();
	return (
		<AtlasWallScaler>
			<AtlasWall data={data} />
		</AtlasWallScaler>
	);
}
