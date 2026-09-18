export type ChatTurn = { role: "user" | "assistant"; text: string };

export type StreamArgs = {
  model: string;
  system: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
};

export interface Provider {
  stream(args: StreamArgs): AsyncGenerator<string, void, undefined>;
}
