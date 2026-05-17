import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose SvelteKit-style PUBLIC_* env vars to the browser. Next.js only
  // auto-inlines NEXT_PUBLIC_*; listing them here makes them available to
  // client-side code via `process.env.PUBLIC_*`.
  env: {
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
