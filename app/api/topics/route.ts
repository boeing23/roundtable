import { NextResponse } from "next/server";
import { createTopic, latestSummary, listTopics } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(listTopics().map((t) => ({ ...t, latest: latestSummary(t.id) })));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { title?: string; context_topic_ids?: string[] };
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  const topic = createTopic(body.title, body.context_topic_ids ?? []);
  return NextResponse.json(topic, { status: 201 });
}
