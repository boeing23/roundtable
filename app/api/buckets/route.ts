import { NextResponse } from "next/server";
import { listBuckets } from "@/lib/db";
import { currentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return NextResponse.json(listBuckets(currentUser(req)));
}
