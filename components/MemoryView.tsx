"use client";

import { useEffect, useState } from "react";
import { api, fmtDate, type Bucket } from "@/lib/client";
import { Markdown } from "./Markdown";

export function MemoryView({ onOpen }: { onOpen: (id: string) => void }) {
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);

  useEffect(() => {
    void api.buckets().then(setBuckets);
  }, []);

  const title = (id: string) => buckets?.find((b) => b.id === id)?.title ?? "(open topic)";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 max-w-4xl">
      <h1 className="font-semibold text-lg mb-1">Memory</h1>
      <p className="text-sm text-zinc-500 mb-5">
        Closed topics become buckets: a summary plus the decision you took. New topics can pull these in as background.
      </p>
      {buckets === null && <p className="text-sm text-zinc-500">Loading…</p>}
      {buckets?.length === 0 && <p className="text-sm text-zinc-500">Nothing saved yet. Close a topic to create the first bucket.</p>}
      <div className="space-y-4">
        {buckets?.map((b) => (
          <article key={b.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <button className="font-medium hover:underline text-left" onClick={() => onOpen(b.id)}>
                {b.title}
              </button>
              <span className="text-xs text-zinc-500 shrink-0">
                {b.status === "open" ? "reopened · " : ""}v{b.latest!.version} · {fmtDate(b.latest!.created_at)}
              </span>
            </div>
            {b.links.length > 0 && (
              <div className="text-xs text-zinc-500 mt-1">
                drew on: {b.links.map((id) => title(id)).join(", ")}
              </div>
            )}
            <div className="text-sm mt-2">
              <Markdown text={b.latest!.summary} />
            </div>
            {b.latest!.decision && (
              <div className="text-sm mt-2 rounded-md bg-zinc-100 dark:bg-zinc-900 px-3 py-2">
                <span className="text-xs font-medium text-zinc-500">DECISION</span>
                <Markdown text={b.latest!.decision} />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
