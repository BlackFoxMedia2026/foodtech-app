import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getDayAvailability } from "@/server/availability";

/**
 * Orari prenotabili di una giornata, per lo staff.
 *
 * Esiste in parallelo a `/api/public/availability` perché il locale qui non
 * arriva dalla richiesta ma dalla sessione: chi prenota al telefono non deve
 * passare un identificativo, e nessuno può interrogare la disponibilità di un
 * altro ristorante.
 *
 * Il widget pubblico proponeva solo gli orari accettabili fin da luglio; il
 * form dello staff no, e chi prenota al telefono scopriva il conflitto dopo
 * aver premuto "salva", con il cliente in linea.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const partySize = Number(url.searchParams.get("partySize") ?? "2");

  if (!date || !DATE_RE.test(date)) {
    return apiError(422, "invalid_date", "Data non valida: attesa nel formato AAAA-MM-GG.");
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    return apiError(422, "invalid_party_size", "Indica quante persone sono, da 1 a 50.");
  }

  const [year, month, day] = date.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return apiError(422, "invalid_date", "Data non valida.");
  }

  try {
    return NextResponse.json(await getDayAvailability(ctx.venueId, { year, month, day }, partySize));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
