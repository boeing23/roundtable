import { GoogleGenAI } from "@google/genai";
import type { Provider, StreamArgs } from "./types";

let client: GoogleGenAI | null = null;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export const googleProvider: Provider = {
  async *stream({ model, system, messages, signal }: StreamArgs) {
    const response = await getClient().models.generateContentStream({
      model,
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      })),
      config: { systemInstruction: system, abortSignal: signal },
    });

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) yield text;
    }
  },
};
