import { NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { getMessage, getTopic, insertMessage, updateMessageContent } from "@/lib/db";
import { getModel, isAvailable } from "@/lib/models";
import { streamModel } from "@/lib/providers";
import { ERROR_MARK } from "@/lib/stream";
import { currentUser } from "@/lib/user";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Stream one model's reply. Body: { model_id, turn_id? }.
 * turn_id present -> roundtable reply to that turn; absent -> solo reply.
 * Response: text/plain stream of deltas, header X-Message-Id = saved row id.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const owner = currentUser(req);
  const topic = getTopic(id, owner);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { model_id, turn_id } = (await req.json()) as { model_id: string; turn_id?: string };
  const def = getModel(model_id);
  if (!isAvailable(def)) {
    return NextResponse.json({ error: `${def.name}: no ${def.envKey} configured` }, { status: 400 });
  }
  if (turn_id) {
    const turn = getMessage(turn_id);
    if (!turn || turn.topic_id !== id || turn.channel !== "round" || !turn.asked.includes(model_id)) {
      return NextResponse.json({ error: "invalid turn for this model" }, { status: 400 });
    }
  }

  const row = insertMessage({
    topic_id: id,
    channel: turn_id ? "round" : "solo",
    role: "model",
    model_id,
    turn_id: turn_id ?? null,
    content: "",
    attachments: [],
    asked: [],
    shared: [],
  });

  let ctx: Awaited<ReturnType<typeof buildContext>>;
  try {
    ctx = await buildContext(id, owner, model_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateMessageContent(row.id, "", msg);
    return NextResponse.json({ error: msg, message_id: row.id }, { status: 500 });
  }

  const encoder = new TextEncoder();
  let acc = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamModel(def, ctx.system, ctx.messages, req.signal)) {
          acc += delta;
          controller.enqueue(encoder.encode(delta));
        }
        updateMessageContent(row.id, acc, null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        updateMessageContent(row.id, acc, msg);
        controller.enqueue(encoder.encode(ERROR_MARK + msg));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Message-Id": row.id,
      "X-Context-Tokens": String(ctx.tokens),
    },
  });
}
