import type { ModelDef } from "../models";
import { anthropicProvider } from "./anthropic";
import { googleProvider } from "./google";
import { openaiProvider } from "./openai";
import type { ChatTurn, Provider } from "./types";

export type { ChatTurn, Provider, StreamArgs } from "./types";

const PROVIDERS: Record<ModelDef["provider"], Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
};

export function streamModel(
  def: ModelDef,
  system: string,
  messages: ChatTurn[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  return PROVIDERS[def.provider].stream({ model: def.model, system, messages, signal });
}

/** Non-streaming convenience for housekeeping calls (summaries, suggestions). */
export async function completeModel(
  def: ModelDef,
  system: string,
  messages: ChatTurn[],
): Promise<string> {
  let out = "";
  for await (const delta of streamModel(def, system, messages)) out += delta;
  return out.trim();
}
