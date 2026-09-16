import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { indirizzoEsternoAmmesso } from "@/lib/indirizzo-esterno";

/**
 * Il logo, riportato come dato dentro il nostro stesso indirizzo.
 *
 * Sembra un giro inutile, e invece è l'unico modo perché il logo esista nei
 * file che si scaricano. Un SVG che rimanda a un'immagine **esterna** non la
 * mostra quando viene aperto come immagine — i browser caricano gli SVG in
 * una modalità che vieta ogni riferimento verso fuori — e disegnarlo su una
 * tela per farne un PNG «sporca» la tela con un'origine diversa, che poi
 * rifiuta di essere letta.
 *
 * Portando i byte dentro il file, l'SVG che si scarica è completo anche su una
 * macchina che non ha mai visto il nostro sito, e il PNG si può produrre.
 */

export const dynamic = "force-dynamic";

const MASSIMO = 4 * 1024 * 1024;
const TIPI = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"]);

export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!indirizzoEsternoAmmesso(url)) {
    return NextResponse.json({ error: "indirizzo_non_ammesso" }, { status: 400 });
  }

  try {
    const risposta = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "follow" });
    if (!risposta.ok) return NextResponse.json({ error: "non_raggiungibile" }, { status: 502 });

    const tipo = (risposta.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TIPI.has(tipo)) return NextResponse.json({ error: "formato_non_supportato" }, { status: 415 });

    const byte = Buffer.from(await risposta.arrayBuffer());
    if (byte.length > MASSIMO) return NextResponse.json({ error: "troppo_grande" }, { status: 413 });

    return NextResponse.json({ dataUrl: `data:${tipo};base64,${byte.toString("base64")}` });
  } catch {
    return NextResponse.json({ error: "non_raggiungibile" }, { status: 502 });
  }
}
