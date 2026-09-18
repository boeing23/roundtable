"use client";

import { useEffect, useRef } from "react";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import type { Attachment, Message, ModelInfo } from "@/lib/client";
import type { Live } from "./TopicView";

type Props = {
  models: ModelInfo[];
  messages: Message[];
  live: Live[];
  modelId: string;
  onModel: (id: string) => void;
  busy: boolean;
  onSend: (modelId: string, text: string, atts: Attachment[]) => Promise<void>;
};

export function SoloView({ models, messages, live, modelId, onModel, busy, onSend }: Props) {
  const model = models.find((m) => m.id === modelId) ?? models[0];
  const thread = messages.filter((m) => m.channel === "solo" && m.model_id === model?.id);
  const liveHere = live.filter((l) => l.turn_id === null && l.model_id === model?.id);
  const endRef = useRef<HTMLDivElement>(null);
  const liveProgress = liveHere.map((l) => l.text.length).join(",");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, liveProgress]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-1 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => onModel(m.id)}
            disabled={!m.available}
            title={m.available ? m.model : `no API key for ${m.name}`}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-2 ${
              m.id === model?.id ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
            } disabled:opacity-40`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
            {m.name}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500 self-center">private: only {model?.name} sees this thread</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {thread.length === 0 && liveHere.length === 0 && (
          <p className="text-sm text-zinc-500">Talk to {model?.name} one-on-one. Nothing here is shown to the other models unless you share it in a roundtable.</p>
        )}
        {thread.map((m) => (
          <Bubble key={m.id} m={m} model={model} />
        ))}
        {liveHere.map((l) => (
          <div key={l.key} className="max-w-3xl">
            <Author model={model} streaming />
            {l.error ? <ErrorLine text={l.error} /> : <Markdown text={l.text || "…"} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <Composer
        placeholder={`Message ${model?.name ?? ""}…`}
        disabled={busy || !model?.available}
        onSend={(t, a) => onSend(model!.id, t, a)}
      />
    </div>
  );
}

function Bubble({ m, model }: { m: Message; model?: ModelInfo }) {
  if (m.role === "user") {
    return (
      <div className="max-w-3xl ml-auto">
        <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap">
          {m.attachments.map((a, i) => (
            <span key={i} className="chip mr-1 mb-1">📄 {a.name}</span>
          ))}
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-3xl">
      <Author model={model} />
      {m.error && <ErrorLine text={m.error} />}
      {m.content && <Markdown text={m.content} />}
    </div>
  );
}

export function Author({ model, streaming }: { model?: ModelInfo; streaming?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium mb-1" style={{ color: model?.color }}>
      <span className="w-2 h-2 rounded-full" style={{ background: model?.color }} />
      {model?.name}
      {streaming && <span className="text-zinc-400 font-normal">thinking…</span>}
    </div>
  );
}

export function ErrorLine({ text }: { text: string }) {
  return <div className="text-xs text-red-500 my-1">⚠ {text}</div>;
}
