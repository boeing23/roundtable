import { NextResponse } from "next/server";
import { getTopic, insertSummary, listMessages, latestSummary, updateTopic } from "@/lib/db";
import { MODELS, utilityModel } from "@/lib/models";
import { completeModel } from "@/lib/providers";

type Ctx = { params: Promise<{ id: string }> };

const nameOf = (id: string | null) => MODELS.find((m) => m.id === id)?.name ?? id ?? "?";

/** Everything the user saw, in order, as a labelled transcript. */
function fullTranscript(topicId: string): string {
  return listMessages(topicId)
    .filter((m) => m.content.trim() || m.attachments.length)
    .map((m) => {
      const atts = m.attachments.length ? ` [attached: ${m.attachments.map((a) => a.name).join(", ")}]` : "";
      if (m.role === "user") {
        const to = m.channel === "solo" ? `to ${nameOf(m.model_id)}` : `roundtable → ${m.asked.map(nameOf).join(", ")}`;
        return `USER (${to})${atts}:\n${m.content}`;
      }
      return `${nameOf(m.model_id).toUpperCase()} (${m.channel})${atts}:\n${m.content}`;
    })
    .join("\n\n---\n\n");
}

/** POST: draft a bucket (summary + decision) from the whole topic. Nothing is saved. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const topic = getTopic(id);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });

  const prev = latestSummary(id);
  const transcript = fullTranscript(id);
  if (!transcript.trim()) return NextResponse.json({ summary: "", decision: "" });

  let raw: string;
  try {
    raw = await completeModel(
      utilityModel(),
      "You write decision records. Output only the two sections requested, in the exact format, no preamble.",
      [
        {
          role: "user",
          text:
            `Topic: "${topic.title}"\n\n` +
            (prev ? `Previous record for this topic (it was reopened):\nSUMMARY:\n${prev.summary}\nDECISION:\n${prev.decision}\n\n` : "") +
            `Full transcript of the user's conversations with their AI advisors:\n\n${transcript}\n\n` +
            `Write a record the user can rely on months later without rereading anything. Format exactly:\n\nSUMMARY:\n<what the question was, key facts/constraints, options considered, where advisors agreed and disagreed and why - dense prose or bullets, under 400 words>\n\nDECISION:\n<what the user decided or leaned toward, with the deciding reasons; if no decision was reached, say "Undecided" and list what would settle it>`,
        },
      ],
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const m = raw.match(/SUMMARY:\s*([\s\S]*?)\n\s*DECISION:\s*([\s\S]*)$/i);
  return NextResponse.json(
    m ? { summary: m[1].trim(), decision: m[2].trim() } : { summary: raw.trim(), decision: "" },
  );
}

/** PUT: save the (edited) record as a new bucket version and close the topic. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getTopic(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { summary, decision } = (await req.json()) as { summary: string; decision: string };
  if (!summary?.trim()) return NextResponse.json({ error: "summary required" }, { status: 400 });
  const s = insertSummary(id, summary.trim(), (decision ?? "").trim());
  const topic = updateTopic(id, { status: "closed" });
  return NextResponse.json({ topic, summary: s });
}
