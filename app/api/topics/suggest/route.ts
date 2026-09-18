import { NextResponse } from "next/server";
import { listBuckets } from "@/lib/db";
import { utilityModel } from "@/lib/models";
import { completeModel } from "@/lib/providers";
import { currentUser } from "@/lib/user";

/**
 * POST { title } -> { ids: string[] } of past buckets likely relevant to a new topic.
 * The user confirms the selection in the UI; this only proposes.
 */
export async function POST(req: Request) {
  const { title } = (await req.json()) as { title: string };
  const buckets = listBuckets(currentUser(req));
  if (!title?.trim() || buckets.length === 0) return NextResponse.json({ ids: [] });

  const catalog = buckets
    .map((b) => `- id: ${b.id}\n  title: ${b.title}\n  summary: ${b.latest!.summary.slice(0, 300).replace(/\s+/g, " ")}`)
    .join("\n");

  let raw: string;
  try {
    raw = await completeModel(
      utilityModel(),
      "You pick which past decision records are relevant to a new topic. Answer with a JSON array of ids only.",
      [
        {
          role: "user",
          text: `New topic: "${title}"\n\nPast records:\n${catalog}\n\nReturn a JSON array of the ids that would give useful background for the new topic (empty array if none). Be selective.`,
        },
      ],
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const match = raw.match(/\[[\s\S]*?\]/);
  let ids: string[] = [];
  try {
    ids = match ? (JSON.parse(match[0]) as unknown[]).filter((x): x is string => typeof x === "string") : [];
  } catch {
    ids = [];
  }
  const valid = new Set(buckets.map((b) => b.id));
  return NextResponse.json({ ids: ids.filter((i) => valid.has(i)) });
}
