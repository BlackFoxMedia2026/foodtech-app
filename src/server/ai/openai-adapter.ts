import OpenAI from "openai";
import type { LLMMessage, LLMProvider } from "./llm-provider";

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const openaiProvider: LLMProvider = {
  get available() {
    return client !== null;
  },
  async *stream(messages: LLMMessage[]) {
    if (!client) throw new Error("llm_unavailable");
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      stream: true,
    });
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  },
};
