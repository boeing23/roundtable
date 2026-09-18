import { NextResponse } from "next/server";
import { deleteTopic, getTopic, listMessages, listSummaries, updateTopic, type Topic } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const topic = getTopic(id);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ topic, messages: listMessages(id), summaries: listSummaries(id) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const patch = (await req.json()) as Partial<Pick<Topic, "title" | "status" | "context_topic_ids">>;
  const topic = updateTopic(id, patch);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(topic);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  deleteTopic(id);
  return new Response(null, { status: 204 });
}
