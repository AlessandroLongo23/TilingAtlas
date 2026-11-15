// Server-only data source for the landing page (app/page.tsx).
//
// It USED to read + parse the ~23 MB eager atlas set from public/ on every request. That did two
// bad things: it parsed 23 MB per homepage hit, and — because it read files by a *variable* path
// (`readFile(path.join(dir, name))`) — @vercel/nft could not constant-fold the path and globbed the
// ENTIRE 255 MB public/ tree into the root serverless function, pushing it to 254 MB (over Vercel's
// 250 MB limit). See docs/DEVELOPMENT_NOTES.md.
//
// Now the counts and the specimen pools are precomputed at build time into landing-data.generated.json
// (scripts/gen-landing-data.ts, run by `pnpm build`). That file is tiny (~150 KB) and imported, so it is
// bundled, never read from disk, and never drags public/ into the trace. The page is prerendered once per
// deploy; the per-visit picks (hero rotation, mosaic, collection previews) are dealt in the browser from
// LANDING_POOLS (components/landing/dealt.tsx). Until 2026-11-15 they were dealt here on every request,
// which made the page a function render at ~210 ms of CPU each.
import type { LandingPayload } from "./landing-core";
import type { LandingPools } from "./landing-deal";
import payload from "./landing-data.generated.json";

export { countsOf } from "./landing-core";
export { pickDistinct } from "./landing-deal";
export type { LandingSpecimen } from "./landing-core";

export const LANDING = payload as LandingPayload;

/** The part of the payload a deal reads, shipped with the page. */
export const LANDING_POOLS: LandingPools = {
	euclideanPool: LANDING.euclideanPool,
	hyperbolicPool: LANDING.hyperbolicPool,
	hyperbolicPatches: LANDING.hyperbolicPatches,
	sphericalPool: LANDING.sphericalPool,
	play: LANDING.play,
	hyperbolicPatch: LANDING.hyperbolicPatch,
	sphericalSolid: LANDING.sphericalSolid,
};
