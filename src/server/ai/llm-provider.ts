export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LLMProvider {
  readonly available: boolean;
  stream(messages: LLMMessage[]): AsyncGenerator<string, void, unknown>;
}
