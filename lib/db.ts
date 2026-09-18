import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// ---------- types ----------

export type TopicStatus = "open" | "closed";

export type Topic = {
  id: string;
  title: string;
  status: TopicStatus;
  context_topic_ids: string[]; // related topics whose buckets are pulled into context
  created_at: number;
  updated_at: number;
};

export type Attachment = { name: string; text: string; chars: number };

export type Channel = "solo" | "round";
export type Role = "user" | "model";

export type Message = {
  id: string;
  topic_id: string;
  channel: Channel;
  role: Role;
  /** solo: the model this chat is with (both user + model rows). round: the replying model (model rows only). */
  model_id: string | null;
  /** round model rows: id of the user "turn" message they answer. */
  turn_id: string | null;
  content: string;
  attachments: Attachment[];
  /** round user rows only: which models were asked this turn. */
  asked: string[];
  /** round user rows only: message ids shared with the asked models this turn. */
  shared: string[];
  error: string | null;
  created_at: number;
};

export type Summary = {
  id: string;
  topic_id: string;
  version: number;
  summary: string;
  decision: string;
  created_at: number;
};

export type Compaction = {
  topic_id: string;
  model_id: string;
  summary: string;
  through: number; // messages with created_at <= through are covered by summary
  updated_at: number;
};

export type Bucket = Topic & { latest: Summary | null; links: string[] };

export type ProfileFact = {
  id: string;
  text: string;
  category: string;
  sources: string[]; // "chatgpt" | "claude" | "gemini" | "manual"
  updated_at: number;
};

// ---------- connection ----------

// MEDIATION_DB lets scripts/tests use a throwaway file instead of the real data.
const DB_PATH = process.env.MEDIATION_DB ?? path.join(process.cwd(), "data", "mediation.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  context_topic_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  role TEXT NOT NULL,
  model_id TEXT,
  turn_id TEXT,
  content TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  asked TEXT NOT NULL DEFAULT '[]',
  shared TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_topic ON messages(topic_id, created_at);
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS compactions (
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  through INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (topic_id, model_id)
);
CREATE TABLE IF NOT EXISTS profile_sources (
  source TEXT PRIMARY KEY,
  raw TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_facts (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
`;

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("busy_timeout = 5000");
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(SCHEMA);
  return conn;
}

// Opened lazily on first query (not at import) so build-time module evaluation
// never touches the file; cached on globalThis to survive dev hot-reloads.
const g = globalThis as unknown as { __mediationDb?: Database.Database; __mediationSchema?: string };
export function getDb(): Database.Database {
  const conn = (g.__mediationDb ??= open());
  // A hot-reloaded module may carry new tables; the cached connection wouldn't have them.
  if (g.__mediationSchema !== SCHEMA) {
    conn.exec(SCHEMA);
    g.__mediationSchema = SCHEMA;
  }
  return conn;
}

// ---------- row mappers ----------

type TopicRow = Omit<Topic, "context_topic_ids"> & { context_topic_ids: string };
type MessageRow = Omit<Message, "attachments" | "asked" | "shared"> & {
  attachments: string;
  asked: string;
  shared: string;
};

const j = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const rowToTopic = (r: TopicRow): Topic => ({ ...r, context_topic_ids: j(r.context_topic_ids, []) });
const rowToMessage = (r: MessageRow): Message => ({
  ...r,
  attachments: j(r.attachments, []),
  asked: j(r.asked, []),
  shared: j(r.shared, []),
});

// ---------- topics ----------

export function listTopics(): Topic[] {
  return getDb()
    .prepare<[], TopicRow>("SELECT * FROM topics ORDER BY updated_at DESC")
    .all()
    .map(rowToTopic);
}

export function getTopic(id: string): Topic | null {
  const r = getDb().prepare<[string], TopicRow>("SELECT * FROM topics WHERE id = ?").get(id);
  return r ? rowToTopic(r) : null;
}

export function createTopic(title: string, contextTopicIds: string[] = []): Topic {
  const now = Date.now();
  const t: Topic = {
    id: randomUUID(),
    title: title.trim() || "Untitled topic",
    status: "open",
    context_topic_ids: contextTopicIds,
    created_at: now,
    updated_at: now,
  };
  getDb().prepare(
    "INSERT INTO topics (id, title, status, context_topic_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(t.id, t.title, t.status, JSON.stringify(t.context_topic_ids), now, now);
  return t;
}

export function updateTopic(
  id: string,
  patch: Partial<Pick<Topic, "title" | "status" | "context_topic_ids">>,
): Topic | null {
  const cur = getTopic(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updated_at: Date.now() };
  getDb().prepare(
    "UPDATE topics SET title = ?, status = ?, context_topic_ids = ?, updated_at = ? WHERE id = ?",
  ).run(next.title, next.status, JSON.stringify(next.context_topic_ids), next.updated_at, id);
  return next;
}

export function touchTopic(id: string): void {
  getDb().prepare("UPDATE topics SET updated_at = ? WHERE id = ?").run(Date.now(), id);
}

export function deleteTopic(id: string): void {
  getDb().prepare("DELETE FROM topics WHERE id = ?").run(id);
}

// ---------- messages ----------

export function listMessages(topicId: string): Message[] {
  return getDb()
    .prepare<[string], MessageRow>(
      "SELECT * FROM messages WHERE topic_id = ? ORDER BY created_at ASC, rowid ASC",
    )
    .all(topicId)
    .map(rowToMessage);
}

export function getMessage(id: string): Message | null {
  const r = getDb().prepare<[string], MessageRow>("SELECT * FROM messages WHERE id = ?").get(id);
  return r ? rowToMessage(r) : null;
}

export function insertMessage(
  m: Omit<Message, "id" | "created_at" | "error"> & { error?: string | null },
): Message {
  const full: Message = {
    ...m,
    id: randomUUID(),
    error: m.error ?? null,
    created_at: Date.now(),
  };
  getDb().prepare(
    `INSERT INTO messages (id, topic_id, channel, role, model_id, turn_id, content, attachments, asked, shared, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    full.id,
    full.topic_id,
    full.channel,
    full.role,
    full.model_id,
    full.turn_id,
    full.content,
    JSON.stringify(full.attachments),
    JSON.stringify(full.asked),
    JSON.stringify(full.shared),
    full.error,
    full.created_at,
  );
  touchTopic(full.topic_id);
  return full;
}

export function updateMessageContent(id: string, content: string, error: string | null): void {
  getDb().prepare("UPDATE messages SET content = ?, error = ? WHERE id = ?").run(content, error, id);
}

// ---------- summaries (buckets) ----------

export function listSummaries(topicId: string): Summary[] {
  return getDb()
    .prepare<[string], Summary>("SELECT * FROM summaries WHERE topic_id = ? ORDER BY version ASC")
    .all(topicId);
}

export function latestSummary(topicId: string): Summary | null {
  return (
    getDb()
      .prepare<[string], Summary>(
        "SELECT * FROM summaries WHERE topic_id = ? ORDER BY version DESC LIMIT 1",
      )
      .get(topicId) ?? null
  );
}

export function insertSummary(topicId: string, summary: string, decision: string): Summary {
  const prev = latestSummary(topicId);
  const s: Summary = {
    id: randomUUID(),
    topic_id: topicId,
    version: (prev?.version ?? 0) + 1,
    summary,
    decision,
    created_at: Date.now(),
  };
  getDb().prepare(
    "INSERT INTO summaries (id, topic_id, version, summary, decision, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(s.id, s.topic_id, s.version, s.summary, s.decision, s.created_at);
  return s;
}

/** Every topic that has at least one summary, with its latest summary and outgoing links. */
export function listBuckets(): Bucket[] {
  return listTopics()
    .map((t) => ({ ...t, latest: latestSummary(t.id), links: t.context_topic_ids }))
    .filter((b) => b.latest !== null);
}

// ---------- compactions ----------

export function getCompaction(topicId: string, modelId: string): Compaction | null {
  return (
    getDb()
      .prepare<[string, string], Compaction>(
        "SELECT * FROM compactions WHERE topic_id = ? AND model_id = ?",
      )
      .get(topicId, modelId) ?? null
  );
}

export function upsertCompaction(c: Omit<Compaction, "updated_at">): void {
  getDb().prepare(
    `INSERT INTO compactions (topic_id, model_id, summary, through, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(topic_id, model_id) DO UPDATE SET summary = excluded.summary, through = excluded.through, updated_at = excluded.updated_at`,
  ).run(c.topic_id, c.model_id, c.summary, c.through, Date.now());
}

// ---------- profile ("about me") ----------

export function getProfileSources(): Record<string, string> {
  const rows = getDb().prepare<[], { source: string; raw: string }>("SELECT source, raw FROM profile_sources").all();
  return Object.fromEntries(rows.map((r) => [r.source, r.raw]));
}

export function setProfileSource(source: string, raw: string): void {
  getDb()
    .prepare(
      `INSERT INTO profile_sources (source, raw, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET raw = excluded.raw, updated_at = excluded.updated_at`,
    )
    .run(source, raw, Date.now());
}

export function listProfileFacts(): ProfileFact[] {
  return getDb()
    .prepare<[], Omit<ProfileFact, "sources"> & { sources: string }>(
      "SELECT id, text, category, sources, updated_at FROM profile_facts ORDER BY position ASC",
    )
    .all()
    .map((r) => ({ ...r, sources: j<string[]>(r.sources, []) }));
}

/** Replace the whole profile atomically, in the given order. */
export function replaceProfileFacts(facts: Array<Pick<ProfileFact, "text" | "category" | "sources">>): ProfileFact[] {
  const conn = getDb();
  const now = Date.now();
  const insert = conn.prepare(
    "INSERT INTO profile_facts (id, position, text, category, sources, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  conn.transaction(() => {
    conn.prepare("DELETE FROM profile_facts").run();
    facts.forEach((f, i) => {
      const text = f.text.trim();
      if (text) insert.run(randomUUID(), i, text, f.category || "other", JSON.stringify(f.sources ?? []), now);
    });
  })();
  return listProfileFacts();
}
