import { NextResponse } from "next/server";
import { createTopic, latestSummary, listTopics } from "@/lib/db";
import { currentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const topics = listTopics(currentUser(req));
  return NextResponse.json(topics.map((t) => ({ ...t, latest: latestSummary(t.id) })));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { title?: string; context_topic_ids?: string[] };
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  const owner = currentUser(req);
  // Only link topics this person owns.
  const mine = new Set(listTopics(owner).map((t) => t.id));
  const links = (body.context_topic_ids ?? []).filter((id) => mine.has(id));
  return NextResponse.json(createTopic(owner, body.title, links), { status: 201 });
}
