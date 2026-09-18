import type { Attachment, Bucket, Message, ProfileFact, Summary, Topic } from "@/lib/db";
import type { Conflict, DraftFact, MergeDraft } from "@/lib/profile";
import { ERROR_MARK } from "@/lib/stream";

export type { Attachment, Bucket, Conflict, DraftFact, MergeDraft, Message, ProfileFact, Summary, Topic };

export type ModelInfo = { id: string; name: string; model: string; color: string; available: boolean };
export type TopicListItem = Topic & { latest: Summary | null };
export type TopicData = { topic: Topic; messages: Message[]; summaries: Summary[] };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

const post = (url: string, body: unknown, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  models: () => fetch("/api/models").then((r) => json<ModelInfo[]>(r)),
  topics: () => fetch("/api/topics").then((r) => json<TopicListItem[]>(r)),
  topic: (id: string) => fetch(`/api/topics/${id}`).then((r) => json<TopicData>(r)),
  createTopic: (title: string, context_topic_ids: string[]) =>
    post("/api/topics", { title, context_topic_ids }).then((r) => json<Topic>(r)),
  patchTopic: (id: string, patch: Partial<Pick<Topic, "title" | "status" | "context_topic_ids">>) =>
    post(`/api/topics/${id}`, patch, "PATCH").then((r) => json<Topic>(r)),
  deleteTopic: (id: string) => fetch(`/api/topics/${id}`, { method: "DELETE" }),
  buckets: () => fetch("/api/buckets").then((r) => json<Bucket[]>(r)),
  suggest: (title: string) => post("/api/topics/suggest", { title }).then((r) => json<{ ids: string[] }>(r)),
  sendMessage: (
    topicId: string,
    body: {
      channel: "solo" | "round";
      model_id?: string;
      content: string;
      attachments?: Attachment[];
      asked?: string[];
      shared?: string[];
    },
  ) => post(`/api/topics/${topicId}/messages`, body).then((r) => json<Message>(r)),
  draftClose: (id: string) => post(`/api/topics/${id}/close`, {}).then((r) => json<{ summary: string; decision: string }>(r)),
  saveClose: (id: string, summary: string, decision: string) =>
    post(`/api/topics/${id}/close`, { summary, decision }, "PUT").then((r) => json<{ topic: Topic; summary: Summary }>(r)),
  me: () => fetch("/api/me").then((r) => json<{ user: string; identified: boolean; isPrimary: boolean }>(r)),
  profile: () => fetch("/api/profile").then((r) => json<{ facts: ProfileFact[]; sources: Record<string, string> }>(r)),
  saveProfile: (facts: DraftFact[]) => post("/api/profile", { facts }, "PUT").then((r) => json<{ facts: ProfileFact[] }>(r)),
  mergeProfile: (sources: Record<string, string>) => post("/api/profile/merge", { sources }).then((r) => json<MergeDraft>(r)),
  upload: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return json<Attachment>(await fetch("/api/upload", { method: "POST", body: fd }));
  },
};

/** Stream one model reply, calling onDelta as text arrives. Resolves with the saved row id. */
export async function streamReply(
  topicId: string,
  model_id: string,
  turn_id: string | null,
  onDelta: (text: string) => void,
): Promise<{ id: string | null; error: string | null }> {
  const res = await post(`/api/topics/${topicId}/generate`, { model_id, turn_id: turn_id ?? undefined });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; message_id?: string };
    return { id: j.message_id ?? null, error: j.error ?? res.statusText };
  }
  const id = res.headers.get("X-Message-Id");
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let error: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    const i = chunk.indexOf(ERROR_MARK);
    if (i >= 0) {
      if (i > 0) onDelta(chunk.slice(0, i));
      error = chunk.slice(i + ERROR_MARK.length);
      break;
    }
    onDelta(chunk);
  }
  return { id, error };
}

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
