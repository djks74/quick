import { NextRequest, NextResponse } from "next/server";

// Mitigate stale Server Action calls from older deployments.
// Some long-lived clients keep posting retired action IDs and spam 404 errors.
const STALE_SERVER_ACTION_IDS = new Set([
  "60a815f398ba6656096389b8825a5673beea8dccf1",
]);

export function middleware(req: NextRequest) {
  if (req.method !== "POST") return NextResponse.next();

  const actionId =
    req.headers.get("next-action") || req.headers.get("Next-Action") || "";
  if (!actionId || !STALE_SERVER_ACTION_IDS.has(actionId)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.searchParams.set("_sa_recover", "1");
  return NextResponse.redirect(url, 303);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
