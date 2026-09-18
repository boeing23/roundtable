import { NextResponse } from "next/server";
import { deleteTopic, getTopic, listMessages, listSummaries, updateTopic, type Topic } from "@/lib/db";
import { currentUser } from "@/lib/user";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const topic = getTopic(id, currentUser(req));
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ topic, messages: listMessages(id), summaries: listSummaries(id) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const patch = (await req.json()) as Partial<Pick<Topic, "title" | "status" | "context_topic_ids">>;
  const topic = updateTopic(id, currentUser(req), patch);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(topic);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  deleteTopic(id, currentUser(req));
  return new Response(null, { status: 204 });
}
