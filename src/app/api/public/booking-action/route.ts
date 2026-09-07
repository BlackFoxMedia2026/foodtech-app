import { NextResponse } from "next/server";
import { applyBookingAction } from "@/server/guest-actions";

/**
 * L'ospite conferma o annulla dal link del promemoria.
 *
 * Pubblica per necessità: chi prenota non ha un account. L'autorizzazione è la
 * firma del token, e il limite di frequenza nel middleware evita che qualcuno
 * provi token a caso in massa.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";

  if (!token) {
    return NextResponse.json(
      { error: "missing_token", message: "Link non valido." },
      { status: 422 },
    );
  }

  const esito = await applyBookingAction(token);
  if (!esito.ok) {
    const status = esito.code === "invalid_token" ? 401 : esito.code === "not_found" ? 404 : 409;
    return NextResponse.json({ error: esito.code, message: esito.message }, { status });
  }

  return NextResponse.json(esito);
}
