import type { NextConfig } from "next";

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
  // /substitutions and /multigrid merged into /aperiodic (2026-07-27); they are now two views of one
  // shelf, selected in its sidebar and carried in ?view=. Temporary (307) rather than permanent so a
  // later reshuffle of the aperiodic section isn't stuck in every browser's redirect cache.
  async redirects() {
    return [
      { source: "/substitutions", destination: "/aperiodic?view=subrosa", permanent: false },
      { source: "/multigrid", destination: "/aperiodic?view=multigrid", permanent: false },
    ];
  },
};

export default nextConfig;
