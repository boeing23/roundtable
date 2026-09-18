"use client";

import { useEffect, useState } from "react";
import { api, type Bucket, type TopicListItem } from "@/lib/client";

type Props = {
  topics: TopicListItem[];
  selected: string | null;
  view: "topic" | "memory" | "profile";
  onSelect: (id: string) => void;
  onMemory: () => void;
  onProfile: () => void;
  onCreated: (id: string) => void;
  onRefresh: () => void;
};

export function Sidebar({ topics, selected, view, onSelect, onMemory, onProfile, onCreated, onRefresh }: Props) {
  const [creating, setCreating] = useState(false);

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="font-semibold tracking-tight">Roundtable</span>
        <button className="btn-ghost text-sm" onClick={() => setCreating(true)}>
          + New
        </button>
      </div>

      {creating && <NewTopic onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); onCreated(id); }} />}

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {topics.length === 0 && !creating && (
          <p className="text-xs text-zinc-500 px-2 py-4">No topics yet. Start one to begin.</p>
        )}
        {topics.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`w-full text-left px-2 py-1.5 rounded-md text-sm truncate flex items-center gap-2 ${
              view === "topic" && selected === t.id ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "closed" ? "bg-zinc-400" : "bg-emerald-500"}`} />
            <span className="truncate">{t.title}</span>
          </button>
        ))}
      </nav>

      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
        <button
          onClick={onProfile}
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${view === "profile" ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
        >
          👤 About me
        </button>
        <button
          onClick={onMemory}
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${view === "memory" ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
        >
          🧠 Memory
        </button>
        <button onClick={onRefresh} className="w-full text-left px-2 py-1 rounded-md text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
          refresh
        </button>
        <Who />
      </div>
    </aside>
  );
}

/** Whose workspace this is. Only interesting once others reach the app over Tailscale. */
function Who() {
  const [me, setMe] = useState<{ user: string; identified: boolean } | null>(null);
  useEffect(() => {
    void api.me().then((m) => setMe(m));
  }, []);
  if (!me) return null;
  return (
    <div className="px-2 pt-1 text-[10px] text-zinc-400 truncate" title={me.identified ? "identified by Tailscale" : "local access"}>
      {me.identified ? "👤" : "💻"} {me.user}
    </div>
  );
}

function NewTopic({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.buckets().then(setBuckets);
  }, []);

  // Suggest related buckets once the user pauses typing.
  useEffect(() => {
    if (!title.trim() || buckets.length === 0) return;
    const h = setTimeout(async () => {
      setSuggesting(true);
      try {
        const { ids } = await api.suggest(title);
        setPicked((p) => new Set([...p, ...ids]));
      } catch {
        /* suggestion is best-effort */
      } finally {
        setSuggesting(false);
      }
    }, 700);
    return () => clearTimeout(h);
  }, [title, buckets.length]);

  const visible = showAll ? buckets : buckets.filter((b) => picked.has(b.id));

  async function create() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const t = await api.createTopic(title, [...picked]);
      onCreated(t.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-2 mb-2 p-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-sm">
      <input
        autoFocus
        className="input w-full"
        placeholder="What's the topic?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void create();
          if (e.key === "Escape") onCancel();
        }}
      />
      {buckets.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-zinc-500 flex justify-between">
            <span>Pull in past decisions {suggesting && "· suggesting…"}</span>
            <button className="underline" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "suggested only" : "show all"}
            </button>
          </div>
          <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
            {visible.length === 0 && <div className="text-xs text-zinc-400">none suggested yet</div>}
            {visible.map((b) => (
              <label key={b.id} className="flex items-start gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={picked.has(b.id)}
                  onChange={(e) =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (e.target.checked) n.add(b.id);
                      else n.delete(b.id);
                      return n;
                    })
                  }
                />
                <span className="truncate">{b.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 mt-2 justify-end">
        <button className="btn-ghost text-xs" onClick={onCancel}>
          cancel
        </button>
        <button className="btn-primary text-xs" disabled={!title.trim() || busy} onClick={() => void create()}>
          Create
        </button>
      </div>
    </div>
  );
}
