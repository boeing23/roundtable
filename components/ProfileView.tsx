"use client";

import { useEffect, useState } from "react";
import { api, type Conflict, type DraftFact, type MergeDraft } from "@/lib/client";
import { CATEGORIES, EXPORT_PROMPT, PROFILE_SOURCES, SOURCE_NAMES } from "@/lib/profile";

const label = (c: string) => c[0].toUpperCase() + c.slice(1);

export function ProfileView() {
  const [facts, setFacts] = useState<DraftFact[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<MergeDraft | null>(null);
  const [busy, setBusy] = useState<"merge" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void api.profile().then((p) => {
      setFacts(p.facts);
      setRaw(p.sources);
    });
  }, []);

  const run = async (kind: "merge" | "save", fn: () => Promise<void>) => {
    setBusy(kind);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = (next: DraftFact[]) =>
    run("save", async () => {
      const res = await api.saveProfile(next);
      setFacts(res.facts);
      setDirty(false);
      setDraft(null);
    });

  const edit = (i: number, patch: Partial<DraftFact>) => {
    setFacts((f) => f!.map((x, j) => (j === i ? { ...x, ...patch, sources: patch.text !== undefined ? ["manual"] : x.sources } : x)));
    setDirty(true);
  };

  if (!facts) return <div className="flex-1 p-6 text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="max-w-3xl space-y-8">
        <header>
          <h1 className="font-semibold text-lg">About me</h1>
          <p className="text-sm text-zinc-500 mt-1">
            One profile every model gets in every topic. Import what ChatGPT, Claude and Gemini each remember, merge, then edit anything.
          </p>
        </header>

        {err && <div className="text-sm text-red-500">⚠ {err}</div>}

        {draft ? (
          <Review draft={draft} busy={busy === "save"} onCancel={() => setDraft(null)} onApply={(f) => void save(f)} />
        ) : (
          <>
            {/* ---------- current profile ---------- */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-medium">Profile · {facts.length} facts</h2>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => {
                      setFacts((f) => [...f!, { text: "", category: "other", sources: ["manual"] }]);
                      setDirty(true);
                    }}
                  >
                    + Add fact
                  </button>
                  <button className="btn-primary text-sm" disabled={!dirty || busy !== null} onClick={() => void save(facts)}>
                    {busy === "save" ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              {facts.length === 0 ? (
                <p className="text-sm text-zinc-500">Empty. Import below, or add facts by hand.</p>
              ) : (
                <FactList facts={facts} onEdit={edit} onRemove={(i) => { setFacts((f) => f!.filter((_, j) => j !== i)); setDirty(true); }} />
              )}
            </section>

            {/* ---------- import ---------- */}
            <section className="space-y-3">
              <h2 className="font-medium">Import memories</h2>
              <div className="text-sm text-zinc-500 space-y-1">
                <p>In each app, paste this prompt, then paste its reply below. (ChatGPT also lists memories under Settings → Personalization.)</p>
                <div className="flex items-start gap-2">
                  <code className="flex-1 text-xs rounded-md bg-zinc-100 dark:bg-zinc-900 px-2 py-1.5">{EXPORT_PROMPT}</code>
                  <button
                    className="btn-ghost text-xs shrink-0"
                    onClick={() => {
                      void navigator.clipboard.writeText(EXPORT_PROMPT).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      });
                    }}
                  >
                    {copied ? "copied ✓" : "copy"}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {PROFILE_SOURCES.map((s) => (
                  <label key={s.id} className="block">
                    <span className="text-xs text-zinc-500">{s.name}</span>
                    <textarea
                      className="input w-full h-40 text-xs mt-1"
                      placeholder={`Paste ${s.name}'s memory…`}
                      value={raw[s.id] ?? ""}
                      onChange={(e) => setRaw((r) => ({ ...r, [s.id]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="btn-primary text-sm"
                  disabled={busy !== null || (!Object.values(raw).some((v) => v?.trim()) && facts.length === 0)}
                  onClick={() => void run("merge", async () => setDraft(await api.mergeProfile(raw)))}
                >
                  {busy === "merge" ? "Merging…" : "Merge into profile"}
                </button>
                <span className="text-xs text-zinc-500">
                  {dirty ? "Save your edits first, or they won't be part of the merge." : "Nothing changes until you review the result."}
                </span>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function FactList({
  facts,
  onEdit,
  onRemove,
}: {
  facts: DraftFact[];
  onEdit: (i: number, patch: Partial<DraftFact>) => void;
  onRemove: (i: number) => void;
}) {
  const indexed = facts.map((f, i) => ({ f, i }));
  return (
    <div className="space-y-4">
      {CATEGORIES.map((c) => {
        const items = indexed.filter(({ f }) => (CATEGORIES as readonly string[]).includes(f.category) ? f.category === c : c === "other");
        if (!items.length) return null;
        return (
          <div key={c}>
            <div className="text-xs font-medium text-zinc-500 mb-1">{label(c)}</div>
            <div className="space-y-1">
              {items.map(({ f, i }) => (
                <div key={i} className="flex items-center gap-2 group">
                  <input className="input flex-1 py-1" value={f.text} placeholder="New fact…" onChange={(e) => onEdit(i, { text: e.target.value })} />
                  <select className="input py-1 text-xs w-32" value={f.category} onChange={(e) => onEdit(i, { category: e.target.value })}>
                    {CATEGORIES.map((x) => (
                      <option key={x} value={x}>
                        {label(x)}
                      </option>
                    ))}
                  </select>
                  <Sources ids={f.sources} />
                  <button className="text-zinc-400 hover:text-red-500 px-1" title="remove" onClick={() => onRemove(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sources({ ids }: { ids: string[] }) {
  return (
    <span className="text-[10px] text-zinc-500 w-28 shrink-0 truncate" title={ids.map((s) => SOURCE_NAMES[s] ?? s).join(", ")}>
      {ids.map((s) => SOURCE_NAMES[s] ?? s).join(" · ")}
    </span>
  );
}

/** Review a merge draft: keep/drop/edit facts, resolve conflicts, then apply. */
function Review({ draft, busy, onCancel, onApply }: { draft: MergeDraft; busy: boolean; onCancel: () => void; onApply: (f: DraftFact[]) => void }) {
  const [facts, setFacts] = useState(draft.facts.map((f) => ({ ...f, keep: true })));
  // Per conflict: index of chosen option, or -1 to skip.
  const [choice, setChoice] = useState<number[]>(draft.conflicts.map(() => -1));
  const unresolved = choice.filter((c) => c === -1).length;

  function apply() {
    const kept: DraftFact[] = facts.filter((f) => f.keep).map(({ text, category, sources }) => ({ text, category, sources }));
    draft.conflicts.forEach((c: Conflict, i) => {
      if (choice[i] >= 0) kept.push(c.options[choice[i]]);
    });
    onApply(kept);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm">
        Review the merged profile. Applying <b>replaces</b> your current profile with what&apos;s ticked below.
      </div>

      {draft.conflicts.length > 0 && (
        <div>
          <h2 className="font-medium mb-2">
            Conflicts · pick one each <span className="text-zinc-500 text-sm font-normal">({unresolved} unresolved, skipped ones are left out)</span>
          </h2>
          <div className="space-y-3">
            {draft.conflicts.map((c, i) => (
              <div key={i} className="rounded-lg border border-amber-300 dark:border-amber-800 p-3">
                <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">{c.about}</div>
                {c.options.map((o, j) => (
                  <label key={j} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                    <input type="radio" name={`c${i}`} checked={choice[i] === j} onChange={() => setChoice((ch) => ch.map((x, k) => (k === i ? j : x)))} />
                    <span className="flex-1">{o.text}</span>
                    <Sources ids={o.sources} />
                  </label>
                ))}
                <label className="flex items-center gap-2 text-xs text-zinc-500 py-0.5 cursor-pointer">
                  <input type="radio" name={`c${i}`} checked={choice[i] === -1} onChange={() => setChoice((ch) => ch.map((x, k) => (k === i ? -1 : x)))} />
                  skip, leave both out
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-medium mb-2">Merged facts · {facts.filter((f) => f.keep).length} kept</h2>
        <div className="space-y-1">
          {facts.map((f, i) => (
            <div key={i} className={`flex items-center gap-2 ${f.keep ? "" : "opacity-40"}`}>
              <input type="checkbox" checked={f.keep} onChange={() => setFacts((fs) => fs.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} />
              <span className="text-[10px] text-zinc-500 w-20 shrink-0">{label(f.category)}</span>
              <input
                className="input flex-1 py-1"
                value={f.text}
                onChange={(e) => setFacts((fs) => fs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
              <Sources ids={f.sources} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background py-3 border-t border-zinc-200 dark:border-zinc-800">
        <button className="btn-ghost text-sm" onClick={onCancel}>
          Discard
        </button>
        <button className="btn-primary text-sm" disabled={busy} onClick={apply}>
          {busy ? "Applying…" : "Apply to profile"}
        </button>
      </div>
    </section>
  );
}
