"use client";

import { useCallback, useEffect, useState } from "react";
import { api, streamReply, type Attachment, type ModelInfo, type TopicData } from "@/lib/client";
import { CloseTopic } from "./CloseTopic";
import { RoundtableView } from "./RoundtableView";
import { SoloView } from "./SoloView";
import { Markdown } from "./Markdown";

/** An in-flight model reply, shown until the server copy replaces it. */
export type Live = { key: string; model_id: string; turn_id: string | null; text: string; error: string | null };

type Mode = "solo" | "round";

export function TopicView({ topicId, models, onTopicsChanged }: { topicId: string; models: ModelInfo[]; onTopicsChanged: () => void }) {
  const [data, setData] = useState<TopicData | null>(null);
  const [mode, setMode] = useState<Mode>("solo");
  const [soloModel, setSoloModel] = useState<string>(() => models.find((m) => m.available)?.id ?? models[0]?.id ?? "claude");
  const [live, setLive] = useState<Live[]>([]);
  const [closing, setClosing] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setData(await api.topic(topicId));
  }, [topicId]);

  // page.tsx mounts this with key={topicId}, so state resets on topic change for free.
  useEffect(() => {
    void api.topic(topicId).then((d) => setData(d));
  }, [topicId]);

  const busy = live.length > 0;

  /** Stream one reply into `live`, then drop it once the server copy is reloaded. */
  async function generate(modelId: string, turnId: string | null) {
    const key = `${modelId}:${turnId ?? "solo"}:${Date.now()}`;
    setLive((l) => [...l, { key, model_id: modelId, turn_id: turnId, text: "", error: null }]);
    const upd = (patch: Partial<Live>) => setLive((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    try {
      const res = await streamReply(topicId, modelId, turnId, (delta) =>
        setLive((l) => l.map((x) => (x.key === key ? { ...x, text: x.text + delta } : x))),
      );
      if (res.error) upd({ error: res.error });
    } catch (e) {
      upd({ error: e instanceof Error ? e.message : String(e) });
    }
    await reload();
    setLive((l) => l.filter((x) => x.key !== key));
  }

  async function sendSolo(modelId: string, text: string, atts: Attachment[]) {
    setErr(null);
    await api.sendMessage(topicId, { channel: "solo", model_id: modelId, content: text, attachments: atts });
    await reload();
    await generate(modelId, null);
    onTopicsChanged();
  }

  async function sendRound(asked: string[], shared: string[], text: string, atts: Attachment[]) {
    setErr(null);
    const turn = await api.sendMessage(topicId, { channel: "round", content: text, attachments: atts, asked, shared });
    await reload();
    await Promise.all(asked.map((m) => generate(m, turn.id)));
    onTopicsChanged();
  }

  async function saveTitle(title: string) {
    setEditingTitle(false);
    if (!data || !title.trim() || title === data.topic.title) return;
    await api.patchTopic(topicId, { title: title.trim() });
    await reload();
    onTopicsChanged();
  }

  async function reopen() {
    await api.patchTopic(topicId, { status: "open" });
    await reload();
    onTopicsChanged();
  }

  async function remove() {
    if (!confirm(`Delete "${data?.topic.title}" and all its messages? This also removes its memory bucket.`)) return;
    await api.deleteTopic(topicId);
    onTopicsChanged();
  }

  if (!data) return <div className="flex-1 p-6 text-sm text-zinc-500">Loading…</div>;
  const { topic, summaries } = data;
  const latest = summaries[summaries.length - 1];
  const closed = topic.status === "closed";

  return (
    <div className="flex flex-col flex-1 min-h-0 h-screen">
      <header className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
        {editingTitle ? (
          <input
            autoFocus
            className="input text-base font-semibold flex-1"
            defaultValue={topic.title}
            onBlur={(e) => void saveTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
          />
        ) : (
          <button className="text-base font-semibold truncate text-left" title="rename" onClick={() => setEditingTitle(true)}>
            {topic.title}
          </button>
        )}
        {closed && <span className="chip text-xs">closed</span>}
        {latest && (
          <button className="text-xs text-zinc-500 underline" onClick={() => setShowRecord((s) => !s)}>
            record v{latest.version}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 text-sm mr-2">
            {(["solo", "round"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md ${mode === m ? "bg-zinc-200 dark:bg-zinc-800" : "text-zinc-500"}`}
              >
                {m === "solo" ? "Solo" : "Roundtable"}
              </button>
            ))}
          </div>
          {closed ? (
            <button className="btn-ghost text-sm" onClick={() => void reopen()}>
              Reopen
            </button>
          ) : (
            <button className="btn-ghost text-sm" disabled={busy} onClick={() => setClosing(true)}>
              Close topic
            </button>
          )}
          <button className="btn-ghost text-sm text-zinc-500" title="delete topic" onClick={() => void remove()}>
            🗑
          </button>
        </div>
      </header>

      {topic.context_topic_ids.length > 0 && (
        <div className="px-4 py-1.5 text-xs text-zinc-500 border-b border-zinc-100 dark:border-zinc-900">
          background from {topic.context_topic_ids.length} past topic{topic.context_topic_ids.length > 1 ? "s" : ""}
        </div>
      )}

      {showRecord && latest && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-sm max-h-64 overflow-y-auto">
          <Markdown text={latest.summary} />
          {latest.decision && (
            <div className="mt-2">
              <span className="text-xs font-medium text-zinc-500">DECISION</span>
              <Markdown text={latest.decision} />
            </div>
          )}
        </div>
      )}

      {err && <div className="px-4 py-1 text-xs text-red-500">{err}</div>}

      {mode === "solo" ? (
        <SoloView models={models} messages={data.messages} live={live} modelId={soloModel} onModel={setSoloModel} busy={busy || closed} onSend={sendSolo} />
      ) : (
        <RoundtableView
          models={models}
          messages={data.messages}
          live={live}
          busy={busy || closed}
          onSend={sendRound}
          onContinueSolo={(id) => {
            setSoloModel(id);
            setMode("solo");
          }}
        />
      )}

      {closing && (
        <CloseTopic
          topicId={topicId}
          onCancel={() => setClosing(false)}
          onDone={() => {
            setClosing(false);
            void reload();
            onTopicsChanged();
          }}
        />
      )}
    </div>
  );
}
