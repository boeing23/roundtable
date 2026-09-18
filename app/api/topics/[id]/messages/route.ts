import { NextResponse } from "next/server";
import { getTopic, insertMessage, type Attachment, type Channel } from "@/lib/db";
import { MODELS } from "@/lib/models";

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  channel: Channel;
  model_id?: string; // solo only
  content: string;
  attachments?: Attachment[];
  asked?: string[]; // round only
  shared?: string[]; // round only
};

/** Save a user message (solo) or a roundtable turn. Model replies come from /generate. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getTopic(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json()) as Body;

  const known = new Set(MODELS.map((m) => m.id));
  if (b.channel === "solo" && (!b.model_id || !known.has(b.model_id))) {
    return NextResponse.json({ error: "solo needs a valid model_id" }, { status: 400 });
  }
  const asked = (b.asked ?? []).filter((m) => known.has(m));
  if (b.channel === "round" && asked.length === 0) {
    return NextResponse.json({ error: "round needs at least one model in asked" }, { status: 400 });
  }
  if (!b.content?.trim() && !(b.attachments?.length || b.shared?.length)) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const msg = insertMessage({
    topic_id: id,
    channel: b.channel,
    role: "user",
    model_id: b.channel === "solo" ? b.model_id! : null,
    turn_id: null,
    content: b.content ?? "",
    attachments: b.attachments ?? [],
    asked: b.channel === "round" ? asked : [],
    shared: b.channel === "round" ? (b.shared ?? []) : [],
  });
  return NextResponse.json(msg, { status: 201 });
}
