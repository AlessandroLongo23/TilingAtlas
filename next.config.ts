import type { NextConfig } from "next";

// Every directory under public/ that holds shipped atlas data. Listed rather than pattern-matched on
// ".json" so that a genuinely mutable file (a manifest, the generated landing data) cannot be
// accidentally frozen in a viewer's cache by adding it later.
const ATLAS_DIRS = [
  "colors", "euhalf", "freedraw", "freedraw-ico", "hollow", "hyperbolic-colors", "hyperbolic-edges",
  "hyperbolic-half", "hyperbolic-poly", "isohedral-edges", "penrose", "pentagon-edges", "planigon",
  "schwarz-hyp", "schwarz-sph", "spherical-colors", "spherical-edges", "spherical-half",
  "spherical-poly", "spherical-star", "tri45", "vertex-configs",
];

const ATLAS_CACHE = [
  {
    // An hour of freshness, then revalidate. Next's default for public/ is
    // `public, max-age=0, must-revalidate`, which costs a conditional request PER FILE: /library
    // opens 118 of them, each a measured ~107 ms round trip, on every single load and reload.
    // These files are a reference catalogue — they change when a corpus is rebuilt, not between
    // page views — so an hour is cheap and bounded. It is NOT `immutable`: that needs a content
    // hash in the URL, and until the shard URLs carry one, `immutable` would pin a viewer to a
    // withdrawn shelf with no way to correct it. Threading a build hash through the *ShardUrl
    // builders is the real fix and belongs with the browse-index work.
    key: "Cache-Control",
    value: "public, max-age=3600, must-revalidate",
  },
];

const nextConfig: NextConfig = {
  // `next dev` and `next build` both write .next, so a production build run while the dev server is
  // up clobbers its chunks and the dev server starts serving 404s for hashed assets. Setting
  // NEXT_DIST_DIR lets a production build live somewhere else, e.g.
  //   NEXT_DIST_DIR=.next-prod pnpm build && NEXT_DIST_DIR=.next-prod PORT=3001 pnpm start
  // Unset, this is exactly the default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Expose SvelteKit-style PUBLIC_* env vars to the browser. Next.js only
  // auto-inlines NEXT_PUBLIC_*; listing them here makes them available to
  // client-side code via `process.env.PUBLIC_*`.
  env: {
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY,
  },
  // public/ holds hundreds of MB of atlas JSON, served statically from the CDN — it is NOT needed
  // inside any serverless function at runtime. Keep it out of every function's file trace. Without
  // this guard a single variable-path readFile (e.g. `readFile(path.join(dir, name))`) makes
  // @vercel/nft glob the whole tree into the function; that pushed the root function to 254 MB and
  // over Vercel's 250 MB limit. Keys are route globs (matched with `contains: true`), so "*" is all
  // routes. See lib/services/landingData.ts and scripts/gen-landing-data.ts.
  outputFileTracingExcludes: {
    "*": ["public/**"],
  },
  async headers() {
    return [
      // Root-level shelf files: reference-atlas.json and every -<shelf>[-k<n>] shard beside it.
      { source: "/:file(reference-atlas.*\\.json)", headers: ATLAS_CACHE },
      { source: "/hyperbolic-developed.json", headers: ATLAS_CACHE },
      // Per-shelf directories.
      ...ATLAS_DIRS.map((dir) => ({ source: `/${dir}/:file*`, headers: ATLAS_CACHE })),
    ];
  },
  // /substitutions and /multigrid merged into /aperiodic (2026-07-27); they are now two views of one
  // shelf, selected in its sidebar and carried in ?view=. Temporary (307), not permanent, so a
  // later reshuffle of the aperiodic section isn't stuck in every browser's redirect cache.
  async redirects() {
    return [
      { source: "/substitutions", destination: "/aperiodic?view=subrosa", permanent: false },
      { source: "/multigrid", destination: "/aperiodic?view=multigrid", permanent: false },
    ];
  },
};

export default nextConfig;
