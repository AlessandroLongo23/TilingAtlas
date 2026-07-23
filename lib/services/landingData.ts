// Server-only data source for the landing page (app/page.tsx).
//
// It USED to read + parse the ~23 MB eager atlas set from public/ on every request. That did two
// bad things: it parsed 23 MB per homepage hit, and — because it read files by a *variable* path
// (`readFile(path.join(dir, name))`) — @vercel/nft could not constant-fold the path and globbed the
// ENTIRE 255 MB public/ tree into the root serverless function, pushing it to 254 MB (over Vercel's
// 250 MB limit). See docs/DEVELOPMENT_NOTES.md.
//
// Now the counts and the specimen pool are precomputed at build time into landing-data.generated.json
// (scripts/gen-landing-data.ts, run by `pnpm build`). That file is tiny (~150 KB) and imported —
// so it is bundled with the function, never read from disk, and never drags public/ into the trace.
// The only per-request work is shuffling the pool into the hero rotation and mosaic, preserving the
// original "fresh specimen each request" behaviour (app/page.tsx stays force-dynamic).
import { type LandingData, type LandingPayload, pickDistinct } from "./landing-core";
import payload from "./landing-data.generated.json";

export {
	countsOf,
	pickDistinct,
	pickUniformEleven,
	toSpecimen,
} from "./landing-core";
export type {
	LandingCounts,
	LandingData,
	LandingPayload,
	LandingSpecimen,
} from "./landing-core";

const LANDING = payload as LandingPayload;

export async function loadLandingData(rng: () => number = Math.random): Promise<LandingData> {
	// Hero pool + mosaic re-pick independently from the same capped pool — a duplicate between the
	// two is harmless and rare.
	const heroPool = pickDistinct(LANDING.euclideanPool, 14, rng);
	const mosaic = pickDistinct(LANDING.euclideanPool, 9, rng);

	return {
		counts: LANDING.counts,
		heroPool,
		mosaic,
		uniformEleven: LANDING.uniformEleven,
		play: LANDING.play,
		hyperbolicPatch: LANDING.hyperbolicPatch,
		sphericalSolid: LANDING.sphericalSolid,
	};
}
