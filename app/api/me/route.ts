import { NextResponse } from "next/server";
import { currentUser, DEFAULT_OWNER } from "@/lib/user";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const user = currentUser(req);
  return NextResponse.json({
    user,
    // true when Tailscale identified the caller, false for plain local access
    identified: Boolean(req.headers.get("tailscale-user-login")),
    isPrimary: user === DEFAULT_OWNER,
  });
}
