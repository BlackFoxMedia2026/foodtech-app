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

/**
 * Il modello che trascrive i vocali dell'agente. Si può cambiare senza
 * toccare il codice, come quello della chat.
 */
const MODELLO_TRASCRIZIONE = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

/**
 * Da audio a testo, in italiano. Lo usano la dettatura (il testo torna nel
 * campo da correggere) e il messaggio vocale (il testo parte da solo).
 */
export async function trascriviAudio(file: File): Promise<string> {
  if (!client) throw new Error("llm_unavailable");
  const esito = await client.audio.transcriptions.create({
    file,
    model: MODELLO_TRASCRIZIONE,
    language: "it",
  });
  return esito.text.trim();
}
