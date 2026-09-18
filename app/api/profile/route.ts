import { NextResponse } from "next/server";
import { getProfileSources, listProfileFacts, replaceProfileFacts, type ProfileFact } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ facts: listProfileFacts(), sources: getProfileSources() });
}

/** PUT { facts } -> replaces the whole profile. */
export async function PUT(req: Request) {
  const { facts } = (await req.json()) as { facts?: Array<Pick<ProfileFact, "text" | "category" | "sources">> };
  if (!Array.isArray(facts)) return NextResponse.json({ error: "facts array required" }, { status: 400 });
  return NextResponse.json({ facts: replaceProfileFacts(facts) });
}
