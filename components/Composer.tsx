"use client";

import { useRef, useState, type ReactNode } from "react";
import { api, type Attachment } from "@/lib/client";

type Props = {
  placeholder: string;
  disabled?: boolean;
  /** Allow sending with empty text (roundtable: sharing opinions alone is a valid turn). */
  allowEmpty?: boolean;
  onSend: (text: string, attachments: Attachment[]) => Promise<void> | void;
  /** Extra controls rendered above the textarea (model toggles, shared chips). */
  header?: ReactNode;
};

export function Composer({ placeholder, disabled, allowEmpty, onSend, header }: Props) {
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = !disabled && !uploading && (allowEmpty || text.trim() || atts.length);

  async function send() {
    if (!canSend) return;
    const t = text;
    const a = atts;
    setText("");
    setAtts([]);
    setErr(null);
    try {
      await onSend(t.trim(), a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setText(t);
      setAtts(a);
    }
  }

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setErr(null);
    try {
      const done: Attachment[] = [];
      for (const f of Array.from(files)) done.push(await api.upload(f));
      setAtts((p) => [...p, ...done]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-background px-4 py-3">
      {header}
      {atts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {atts.map((a, i) => (
            <span key={i} className="chip">
              📄 {a.name} <span className="opacity-60">({Math.round(a.chars / 1000)}k chars)</span>
              <button className="ml-1 opacity-60 hover:opacity-100" onClick={() => setAtts((p) => p.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          className="input flex-1 resize-none min-h-[44px] max-h-48"
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" multiple hidden onChange={(e) => void pick(e.target.files)} />
        <button className="btn-ghost" title="Attach PDF or text" disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "…" : "📎"}
        </button>
        <button className="btn-primary" disabled={!canSend} onClick={() => void send()}>
          Send
        </button>
      </div>
      <div className="mt-1 text-xs text-zinc-500 flex justify-between">
        <span>{err ? <span className="text-red-500">{err}</span> : "⌘/Ctrl+Enter to send"}</span>
      </div>
    </div>
  );
}
