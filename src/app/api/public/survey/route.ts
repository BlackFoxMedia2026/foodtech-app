import { NextResponse } from "next/server";
import { submitSurveyResponse } from "@/server/surveys";

/**
 * La risposta dell'ospite al sondaggio dopo la visita.
 *
 * Pubblica per necessità — chi ha cenato non ha un account — e protetta dal
 * token del sondaggio, che è casuale, unico e vale una volta sola.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const score = Number(body?.score);

  if (!token) {
    return NextResponse.json({ error: "missing_token", message: "Link non valido." }, { status: 422 });
  }

  const esito = await submitSurveyResponse(token, {
    score,
    comment: typeof body?.comment === "string" ? body.comment.slice(0, 1000) : null,
  });

  if (!esito.ok) {
    const status = esito.code === "invalid_token" ? 401 : esito.code === "invalid_score" ? 422 : 409;
    return NextResponse.json({ error: esito.code, message: esito.message }, { status });
  }

  return NextResponse.json(esito);
}
