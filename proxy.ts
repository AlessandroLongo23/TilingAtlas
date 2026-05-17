import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { unauthorized } from "@/lib/api/responses";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/pipeline")) {
    const secret = request.headers.get("x-pipeline-secret");
    if (!secret || secret !== process.env.PIPELINE_SECRET) {
      return unauthorized();
    }
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
