"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export function CloseTopic({ topicId, onDone, onCancel }: { topicId: string; onDone: () => void; onCancel: () => void }) {
  const [summary, setSummary] = useState("");
  const [decision, setDecision] = useState("");
  const [drafting, setDrafting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .draftClose(topicId)
      .then((d) => {
        if (!alive) return;
        setSummary(d.summary);
        setDecision(d.decision);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setDrafting(false));
    return () => {
      alive = false;
    };
  }, [topicId]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.saveClose(topicId, summary, decision);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-background rounded-2xl w-full max-w-2xl p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">Close topic → save to memory</h2>
        <p className="text-xs text-zinc-500">
          This record is what future topics will see. Edit it so it says what you actually concluded.
          {drafting && " Drafting…"}
        </p>
        <label className="block text-xs text-zinc-500">Summary</label>
        <textarea className="input w-full h-48 text-sm" value={summary} disabled={drafting} onChange={(e) => setSummary(e.target.value)} />
        <label className="block text-xs text-zinc-500">Decision</label>
        <textarea className="input w-full h-24 text-sm" value={decision} disabled={drafting} onChange={(e) => setDecision(e.target.value)} />
        {err && <div className="text-xs text-red-500">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost text-sm" onClick={onCancel}>
            cancel
          </button>
          <button className="btn-primary text-sm" disabled={drafting || saving || !summary.trim()} onClick={() => void save()}>
            {saving ? "Saving…" : "Save & close"}
          </button>
        </div>
      </div>
    </div>
  );
}
