import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/api/responses";

// Runs on the pipeline API alone, where it checks the shared secret. Until 2026-11-15 it ran on every page
// to refresh a Supabase session, but the site has no sign-in: no visitor carries a session, nothing reads
// one, and those refreshes were 1.2 h of the team's 4 h monthly Vercel CPU allowance. If accounts arrive,
// widen the matcher and refresh only when an `sb-…-auth-token` cookie is present.
export function proxy(request: NextRequest) {
	const secret = request.headers.get("x-pipeline-secret");
	if (!secret || secret !== process.env.PIPELINE_SECRET) return unauthorized();
	return NextResponse.next();
}

// A literal: Next reads it at build time and ignores a variable.
export const config = {
	matcher: ["/api/pipeline/:path*"],
};
