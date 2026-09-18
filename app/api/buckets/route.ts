import { NextResponse } from "next/server";
import { listBuckets } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(listBuckets());
}
