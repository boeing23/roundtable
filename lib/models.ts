export type ProviderId = "anthropic" | "openai" | "google";

export type ModelDef = {
  id: string; // short id used everywhere in the app + db
  name: string; // display name ("friend" name)
  provider: ProviderId;
  model: string; // provider model id
  envKey: string;
  color: string; // tailwind-friendly accent (hex)
};

export const MODELS: ModelDef[] = [
  {
    id: "claude",
    name: "Claude",
    provider: "anthropic",
    model: "claude-opus-5",
    envKey: "ANTHROPIC_API_KEY",
    color: "#d97757",
  },
  {
    id: "gpt",
    name: "GPT",
    provider: "openai",
    model: "gpt-6-astra",
    envKey: "OPENAI_API_KEY",
    color: "#10a37f",
  },
  {
    id: "gemini",
    name: "Gemini",
    provider: "google",
    model: "gemini-3.1-pro-preview",
    envKey: "GEMINI_API_KEY",
    color: "#4285f4",
  },
];

export function getModel(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model id: ${id}`);
  return m;
}

export function isAvailable(m: ModelDef): boolean {
  return Boolean(process.env[m.envKey]);
}

/** Model used for housekeeping: compaction, bucket drafts, related-topic suggestions. */
export function utilityModel(): ModelDef {
  const preferred = MODELS.find((m) => m.id === "claude");
  if (preferred && isAvailable(preferred)) return preferred;
  const any = MODELS.find(isAvailable);
  if (!any) throw new Error("No provider API key configured. Add one to .env.local");
  return any;
}
