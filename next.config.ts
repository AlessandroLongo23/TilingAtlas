import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
