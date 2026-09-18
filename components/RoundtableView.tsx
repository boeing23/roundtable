"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import { Author, ErrorLine } from "./SoloView";
import type { Attachment, Message, ModelInfo } from "@/lib/client";
import type { Live } from "./TopicView";

type Props = {
  models: ModelInfo[];
  messages: Message[];
  live: Live[];
  busy: boolean;
  onSend: (asked: string[], shared: string[], text: string, atts: Attachment[]) => Promise<void>;
  onContinueSolo: (modelId: string) => void;
};

export function RoundtableView({ models, messages, live, busy, onSend, onContinueSolo }: Props) {
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const turns = messages.filter((m) => m.channel === "round" && m.role === "user");
  const repliesFor = (turnId: string) => messages.filter((m) => m.channel === "round" && m.role === "model" && m.turn_id === turnId);
  const modelOf = (id: string | null) => models.find((m) => m.id === id);

  const [asked, setAsked] = useState<Set<string>>(() => new Set(models.filter((m) => m.available).map((m) => m.id)));
  const [shared, setShared] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const liveProgress = live.map((l) => l.text.length).join(",");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, liveProgress]);

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  const sharedList = [...shared].map((id) => byId.get(id)).filter((m): m is Message => Boolean(m));
  const sharedOpinions = sharedList.filter((m) => m.channel === "round");
  // Solo messages picked, counted per thread, for the chips.
  const sharedSolo = new Map<string, number>();
  for (const m of sharedList) if (m.channel === "solo" && m.model_id) sharedSolo.set(m.model_id, (sharedSolo.get(m.model_id) ?? 0) + 1);

  const soloThreads = models
    .map((m) => ({ model: m, msgs: messages.filter((x) => x.channel === "solo" && x.model_id === m.id && !x.error) }))
    .filter((t) => t.msgs.length > 0);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function send(text: string, atts: Attachment[]) {
    const a = [...asked];
    const s = [...shared];
    setShared(new Set());
    setPickerOpen(false);
    await onSend(a, s, text, atts);
  }

  const setMany = (ids: string[], on: boolean) =>
    setShared((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const header = (
    <div className="mb-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-zinc-500 text-xs">Ask:</span>
        {models.map((m) => (
          <button
            key={m.id}
            disabled={!m.available}
            onClick={() => setAsked((s) => toggle(s, m.id))}
            className={`px-2.5 py-0.5 rounded-full border text-xs flex items-center gap-1.5 disabled:opacity-40 ${
              asked.has(m.id) ? "border-transparent text-white" : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
            }`}
            style={asked.has(m.id) ? { background: m.color } : undefined}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {m.name}
          </button>
        ))}
        {soloThreads.length > 0 && (
          <button className="text-xs underline text-zinc-500 hover:text-foreground ml-2" onClick={() => setPickerOpen((o) => !o)}>
            {pickerOpen ? "hide solo chats" : "share from solo chats ▾"}
          </button>
        )}
        {(sharedOpinions.length > 0 || sharedSolo.size > 0) && <span className="text-zinc-500 text-xs ml-2">Sharing:</span>}
        {sharedOpinions.map((m) => (
          <span key={m.id} className="chip" style={{ borderColor: modelOf(m.model_id)?.color }}>
            {modelOf(m.model_id)?.name}&apos;s answer
            <button className="ml-1 opacity-60 hover:opacity-100" onClick={() => setShared((s) => toggle(s, m.id))}>
              ×
            </button>
          </span>
        ))}
        {[...sharedSolo].map(([mid, n]) => (
          <span key={mid} className="chip" style={{ borderColor: modelOf(mid)?.color }}>
            {modelOf(mid)?.name} chat · {n} msg{n > 1 ? "s" : ""}
            <button
              className="ml-1 opacity-60 hover:opacity-100"
              onClick={() => setMany(soloThreads.find((t) => t.model.id === mid)?.msgs.map((x) => x.id) ?? [], false)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {pickerOpen && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 max-h-64 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
          {soloThreads.map(({ model, msgs }) => {
            const ids = msgs.map((x) => x.id);
            const all = ids.every((id) => shared.has(id));
            return (
              <div key={model.id} className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium flex items-center gap-1.5" style={{ color: model.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: model.color }} />
                    chat with {model.name} · {msgs.length} msgs
                  </span>
                  <button className="underline text-zinc-500" onClick={() => setMany(ids, !all)}>
                    {all ? "unselect all" : "select all"}
                  </button>
                </div>
                <div className="space-y-0.5">
                  {msgs.map((x) => (
                    <label key={x.id} className="flex items-start gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded px-1 py-0.5">
                      <input type="checkbox" className="mt-0.5" checked={shared.has(x.id)} onChange={() => setShared((s) => toggle(s, x.id))} />
                      <span className="text-zinc-500 shrink-0 w-12">{x.role === "user" ? "you" : model.name}</span>
                      <span className="truncate">
                        {x.attachments.map((a) => `📄${a.name} `)}
                        {x.content}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8">
        {turns.length === 0 && live.length === 0 && (
          <div className="text-sm text-zinc-500 max-w-xl space-y-2">
            <p>Ask several models at once. Each answers independently, without seeing the others.</p>
            <p>Then mediate: tick the answers you want to pass along, pick who should respond, and send. Only what you tick is shared.</p>
          </div>
        )}

        {turns.map((turn, ti) => {
          const replies = repliesFor(turn.id);
          const liveHere = live.filter((l) => l.turn_id === turn.id);
          const sharedIn = turn.shared.map((id) => byId.get(id)).filter((m): m is Message => Boolean(m));
          return (
            <section key={turn.id}>
              <div className="text-xs text-zinc-500 mb-1">
                Round {ti + 1} · to {turn.asked.map((id) => modelOf(id)?.name ?? id).join(", ")}
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap max-w-3xl">
                {sharedIn.length > 0 && (
                  <div className="text-xs text-zinc-500 mb-1">
                    shared: {describeShared(sharedIn, modelOf)}
                  </div>
                )}
                {turn.attachments.map((a, i) => (
                  <span key={i} className="chip mr-1 mb-1">📄 {a.name}</span>
                ))}
                {turn.content || <span className="text-zinc-400 italic">what&apos;s your take?</span>}
              </div>

              <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: `repeat(${Math.min(3, turn.asked.length)}, minmax(0, 1fr))` }}>
                {turn.asked.map((mid) => {
                  const m = modelOf(mid);
                  const reply = replies.find((r) => r.model_id === mid);
                  const l = liveHere.find((x) => x.model_id === mid);
                  const text = reply?.content ?? l?.text ?? "";
                  const error = reply?.error ?? l?.error ?? null;
                  return (
                    <div key={mid} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col min-h-[80px]">
                      <Author model={m} streaming={Boolean(l) && !reply} />
                      <div className="flex-1 text-sm">
                        {error && <ErrorLine text={error} />}
                        {text ? <Markdown text={text} /> : !error && <span className="text-zinc-400">…</span>}
                      </div>
                      {reply && !reply.error && reply.content && (
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-900 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={shared.has(reply.id)} onChange={() => setShared((s) => toggle(s, reply.id))} />
                            share next
                          </label>
                          <button className="underline text-zinc-500 hover:text-foreground" onClick={() => onContinueSolo(mid)}>
                            continue solo →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        <div ref={endRef} />
      </div>

      <Composer
        header={header}
        allowEmpty={sharedList.length > 0}
        placeholder={sharedList.length ? "Optional note for the models you're asking… (empty = 'what's your take?')" : "Ask the selected models…"}
        disabled={busy || asked.size === 0}
        onSend={send}
      />
    </div>
  );
}

/** "Claude's answer, GPT chat · 3 msgs" */
function describeShared(msgs: Message[], modelOf: (id: string | null) => ModelInfo | undefined): string {
  const parts: string[] = [];
  const solo = new Map<string, number>();
  for (const m of msgs) {
    if (m.channel === "round") parts.push(`${modelOf(m.model_id)?.name}'s answer`);
    else if (m.model_id) solo.set(m.model_id, (solo.get(m.model_id) ?? 0) + 1);
  }
  for (const [mid, n] of solo) parts.push(`${modelOf(mid)?.name} chat · ${n} msg${n > 1 ? "s" : ""}`);
  return parts.join(", ");
}
