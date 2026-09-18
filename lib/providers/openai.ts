import OpenAI from "openai";
import type { Provider, StreamArgs } from "./types";

let client: OpenAI | null = null;
const getClient = () => (client ??= new OpenAI());

export const openaiProvider: Provider = {
  async *stream({ model, system, messages, signal }: StreamArgs) {
    const stream = await getClient().responses.create(
      {
        model,
        instructions: system,
        input: messages.map((m) => ({ role: m.role, content: m.text })),
        stream: true,
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield event.delta;
      } else if (event.type === "error") {
        throw new Error(event.message ?? "OpenAI stream error");
      }
    }
  },
};
