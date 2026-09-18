import Anthropic from "@anthropic-ai/sdk";
import type { Provider, StreamArgs } from "./types";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export const anthropicProvider: Provider = {
  async *stream({ model, system, messages, signal }: StreamArgs) {
    const stream = getClient().messages.stream(
      {
        model,
        max_tokens: 64000,
        // Auto-caches the last cacheable block: the whole conversation prefix is
        // re-sent on every turn, so this cuts input cost on long topics.
        cache_control: { type: "ephemeral" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        thinking: { type: "adaptive" },
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      throw new Error(
        `Claude declined: ${final.stop_details?.explanation ?? final.stop_details?.category ?? "refusal"}`,
      );
    }
  },
};
