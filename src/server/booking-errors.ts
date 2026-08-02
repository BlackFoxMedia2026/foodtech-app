import { NextResponse } from "next/server";
import { AvailabilityError } from "./availability";

/**
 * Risposta unica per gli errori di scrittura di una prenotazione, così i tre canali
 * (sala, API interna, widget pubblico) rispondono allo stesso modo.
 *
 * Una prenotazione rifiutata perché il locale è pieno o il tavolo è occupato non è
 * una richiesta malformata: è un conflitto con lo stato attuale dell'agenda, quindi 409.
 * Il campo `issues` permette a un'interfaccia di mostrare i motivi uno per uno.
 */
export function bookingWriteErrorResponse(err: unknown) {
  if (err instanceof AvailabilityError) {
    return NextResponse.json(
      { error: err.message, code: "unavailable", issues: err.issues },
      { status: 409 },
    );
  }

  if (err instanceof Error && err.message === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { error: err instanceof Error ? err.message : "invalid" },
    { status: 400 },
  );
}
