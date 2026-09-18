import { NextResponse } from "next/server";
import { listProfileFacts, setProfileSource } from "@/lib/db";
import { utilityModel } from "@/lib/models";
import { mergePrompt, parseMergeDraft, PROFILE_SOURCES } from "@/lib/profile";
import { completeModel } from "@/lib/providers";
import { currentUser } from "@/lib/user";

/**
 * POST { sources: { chatgpt?, claude?, gemini? } }
 * Saves the raw dumps, then returns a merge draft. The profile itself is not
 * changed until the user reviews the draft and PUTs /api/profile.
 */
export async function POST(req: Request) {
  const { sources = {} } = (await req.json()) as { sources?: Record<string, string> };
  const owner = currentUser(req);
  for (const s of PROFILE_SOURCES) {
    if (typeof sources[s.id] === "string") setProfileSource(owner, s.id, sources[s.id]);
  }

  const existing = listProfileFacts(owner);
  const hasDumps = PROFILE_SOURCES.some((s) => sources[s.id]?.trim());
  if (!hasDumps && existing.length === 0) {
    return NextResponse.json({ error: "Paste at least one memory dump first" }, { status: 400 });
  }

  try {
    const raw = await completeModel(
      utilityModel(),
      "You merge what different AI assistants remember about one person into a single clean profile. Output JSON only.",
      [{ role: "user", text: mergePrompt(existing, sources) }],
    );
    return NextResponse.json(parseMergeDraft(raw));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
