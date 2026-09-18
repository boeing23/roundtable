import {
  getCompaction,
  getTopic,
  latestSummary,
  listMessages,
  listProfileFacts,
  upsertCompaction,
  type Attachment,
  type Message,
  type Topic,
} from "./db";
import { getModel, MODELS, utilityModel, type ModelDef } from "./models";
import { renderProfile } from "./profile";
import { completeModel, type ChatTurn } from "./providers";

// Rough token estimate; every provider tokenizes differently, this only has to
// be in the right ballpark to decide when to compact.
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const COMPACT_AT_TOKENS = 120_000; // trigger
const KEEP_RECENT = 10; // turns kept verbatim after compaction

type TimedTurn = ChatTurn & { at: number };

// ---------- rendering helpers ----------

function renderAttachments(atts: Attachment[]): string {
  if (!atts.length) return "";
  return (
    atts
      .map((a) => `<document name="${a.name.replace(/"/g, "'")}">\n${a.text}\n</document>`)
      .join("\n\n") + "\n\n"
  );
}

const nameOf = (id: string | null) => MODELS.find((x) => x.id === id)?.name ?? id ?? "?";
const attr = (s: string) => s.replace(/"/g, "'");

function renderSharedOpinion(byId: Map<string, Message>, m: Message): string {
  const turn = m.turn_id ? byId.get(m.turn_id) : null;
  const q = turn?.content?.trim();
  const header = q ? `<opinion from="${nameOf(m.model_id)}" answering="${attr(q)}">` : `<opinion from="${nameOf(m.model_id)}">`;
  return `${header}\n${m.content}\n</opinion>`;
}

/** Solo messages the mediator picked, grouped per thread, as a labelled excerpt. */
function renderSharedSolo(msgs: Message[]): string {
  const model = nameOf(msgs[0].model_id);
  const lines = msgs.map((m) => {
    const who = m.role === "user" ? "USER" : model.toUpperCase();
    return `${who}: ${renderAttachments(m.attachments)}${m.content}`.trim();
  });
  return `<conversation with="${model}">\n${lines.join("\n\n")}\n</conversation>`;
}

/**
 * Everything the mediator shared in one roundtable turn, as `self` should see it.
 * Roundtable answers -> <opinion>; solo messages -> <conversation> per thread.
 * Anything from self's own timeline is skipped (it already has it).
 */
function renderShared(byId: Map<string, Message>, ids: string[], self: ModelDef): string[] {
  const out: string[] = [];
  const solo = new Map<string, Message[]>();
  for (const id of ids) {
    const m = byId.get(id);
    if (!m || !m.model_id || m.model_id === self.id) continue;
    if (m.channel === "round") {
      if (m.role === "model" && m.content.trim()) out.push(renderSharedOpinion(byId, m));
    } else {
      (solo.get(m.model_id) ?? solo.set(m.model_id, []).get(m.model_id)!).push(m);
    }
  }
  for (const msgs of solo.values()) {
    msgs.sort((a, b) => a.created_at - b.created_at);
    out.push(renderSharedSolo(msgs));
  }
  return out;
}

/**
 * The timeline as one specific model experienced it: its solo chats, plus the
 * roundtable turns it was asked in (with whatever opinions the mediator shared).
 * Nothing else leaks in.
 */
export function timelineFor(messages: Message[], self: ModelDef): TimedTurn[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const out: TimedTurn[] = [];

  for (const m of messages) {
    if (m.channel === "solo") {
      if (m.model_id !== self.id) continue;
      out.push({
        role: m.role === "user" ? "user" : "assistant",
        text: m.role === "user" ? renderAttachments(m.attachments) + m.content : m.content,
        at: m.created_at,
      });
      continue;
    }

    // roundtable
    if (m.role === "user") {
      if (!m.asked.includes(self.id)) continue;
      const shared = renderShared(byId, m.shared, self);
      const parts: string[] = [];
      if (shared.length) {
        parts.push("The user has shared the following from their other conversations:\n\n" + shared.join("\n\n"));
      }
      const body = renderAttachments(m.attachments) + m.content.trim();
      if (body) parts.push(body);
      else if (shared.length) parts.push("What is your take on the above?");
      out.push({ role: "user", text: parts.join("\n\n"), at: m.created_at });
    } else if (m.model_id === self.id && !m.error && m.content.trim()) {
      out.push({ role: "assistant", text: m.content, at: m.created_at });
    }
  }

  return mergeAdjacent(out);
}

// Providers differ on tolerating consecutive same-role turns; merge to be safe.
function mergeAdjacent(turns: TimedTurn[]): TimedTurn[] {
  const out: TimedTurn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) {
      last.text += "\n\n" + t.text;
      last.at = t.at;
    } else out.push({ ...t });
  }
  return out;
}

// ---------- system prompt ----------

function relatedBackground(topic: Topic, owner: string): string {
  const lines: string[] = [];
  for (const id of topic.context_topic_ids) {
    const t = getTopic(id, owner);
    const s = latestSummary(id);
    if (!t || !s) continue;
    lines.push(
      `### ${t.title}\n${s.summary.trim()}${s.decision.trim() ? `\n**Decision taken:** ${s.decision.trim()}` : ""}`,
    );
  }
  return lines.join("\n\n");
}

export function systemPromptFor(topic: Topic, owner: string, self: ModelDef, compacted: string | null): string {
  const others = MODELS.filter((m) => m.id !== self.id)
    .map((m) => m.name)
    .join(", ");
  const sections = [
    `You are ${self.name}, one of several AI advisors (the others: ${others}) that the user consults on the topic "${topic.title}".
The user acts as mediator: they may talk to you alone, or run a roundtable where they collect opinions and selectively share material with you: other advisors' answers in <opinion from="..."> tags, and excerpts of their private chats with other advisors in <conversation with="..."> tags.
Treat shared material as context and peers' views: absorb the facts, engage with the opinions directly, agree or disagree with reasons, and add what they missed. Never claim you wrote them and never invent what another advisor said.
Be direct and concrete. Prefer a clear recommendation over a survey of options.`,
  ];
  // Profile before topic background: it changes rarely, so it stays in the cached prefix.
  const profile = renderProfile(listProfileFacts(owner));
  if (profile) sections.push(profile);
  const bg = relatedBackground(topic, owner);
  if (bg) sections.push(`## Background: the user's related past topics and decisions\n\n${bg}`);
  if (compacted) sections.push(`## Earlier in this conversation (summarized)\n\n${compacted}`);
  return sections.join("\n\n");
}

// ---------- compaction ----------

async function summarize(previous: string | null, turns: TimedTurn[], self: ModelDef): Promise<string> {
  const transcript = turns
    .map((t) => `${t.role === "user" ? "USER" : self.name.toUpperCase()}:\n${t.text}`)
    .join("\n\n---\n\n");
  const prompt =
    (previous ? `Existing summary of even earlier conversation:\n${previous}\n\n` : "") +
    `Transcript to fold into the summary:\n\n${transcript}\n\n` +
    `Write an updated "story so far" for ${self.name} to continue this conversation from. Keep: user's goals and constraints, key facts and numbers, options discussed, positions ${self.name} and other advisors took, open questions, and anything the user said they decided. Drop pleasantries. Plain prose with short headers, under 800 words.`;
  return completeModel(utilityModel(), "You compress conversation transcripts into faithful, dense summaries.", [
    { role: "user", text: prompt },
  ]);
}

/**
 * Build the request for `self` on `topic`, compacting first if the timeline is
 * too long. Returns the system prompt and the verbatim turns to send.
 */
export async function buildContext(
  topicId: string,
  owner: string,
  modelId: string,
): Promise<{ system: string; messages: ChatTurn[]; tokens: number }> {
  const topic = getTopic(topicId, owner);
  if (!topic) throw new Error("Topic not found");
  const self = getModel(modelId);

  const all = timelineFor(listMessages(topicId), self);
  let compaction = getCompaction(topicId, modelId);
  let turns = compaction ? all.filter((t) => t.at > compaction!.through) : all;

  const total = (ts: TimedTurn[]) =>
    ts.reduce((n, t) => n + estimateTokens(t.text), 0) + estimateTokens(compaction?.summary ?? "");

  if (total(turns) > COMPACT_AT_TOKENS && turns.length > KEEP_RECENT) {
    const old = turns.slice(0, turns.length - KEEP_RECENT);
    const summary = await summarize(compaction?.summary ?? null, old, self);
    const through = old[old.length - 1].at;
    upsertCompaction({ topic_id: topicId, model_id: modelId, summary, through });
    compaction = { topic_id: topicId, model_id: modelId, summary, through, updated_at: Date.now() };
    turns = turns.slice(turns.length - KEEP_RECENT);
  }

  // Providers require the first turn to be from the user.
  while (turns.length && turns[0].role !== "user") turns = turns.slice(1);

  const system = systemPromptFor(topic, owner, self, compaction?.summary ?? null);
  return {
    system,
    messages: turns.map(({ role, text }) => ({ role, text })),
    tokens: total(turns) + estimateTokens(system),
  };
}
