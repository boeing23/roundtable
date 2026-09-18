import { NextResponse } from "next/server";
import { getProfileSources, listProfileFacts, replaceProfileFacts, type ProfileFact } from "@/lib/db";
import { currentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const owner = currentUser(req);
  return NextResponse.json({ facts: listProfileFacts(owner), sources: getProfileSources(owner) });
}

/** PUT { facts } -> replaces this person's whole profile. */
export async function PUT(req: Request) {
  const { facts } = (await req.json()) as { facts?: Array<Pick<ProfileFact, "text" | "category" | "sources">> };
  if (!Array.isArray(facts)) return NextResponse.json({ error: "facts array required" }, { status: 400 });
  return NextResponse.json({ facts: replaceProfileFacts(currentUser(req), facts) });
}
