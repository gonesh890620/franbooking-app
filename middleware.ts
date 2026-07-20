import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRODUCTION_HOST = "app.franbooking.com";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  if (host.endsWith(".vercel.app") && host !== PRODUCTION_HOST) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = PRODUCTION_HOST;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
