import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDayAvailability } from "@/server/availability";

/**
 * Orari prenotabili di una giornata, per il widget pubblico.
 *
 * Esempio: `/api/public/availability?venue=<id>&date=2026-08-03&partySize=2`
 *
 * Restituisce istanti assoluti in ISO, non stringhe di orario: il cliente rimanda
 * indietro lo stesso valore, così un cliente in un altro fuso non prenota per sbaglio
 * a un'ora diversa da quella che ha letto.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venueId = url.searchParams.get("venue");
  const date = url.searchParams.get("date");
  const partySizeRaw = url.searchParams.get("partySize") ?? "2";

  if (!venueId) {
    return NextResponse.json({ error: "Locale non indicato." }, { status: 400 });
  }

  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Data non valida: attesa nel formato AAAA-MM-GG." }, { status: 400 });
  }

  const partySize = Number(partySizeRaw);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    return NextResponse.json({ error: "Numero di persone non valido." }, { status: 400 });
  }

  const [year, month, day] = date.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return NextResponse.json({ error: "Data non valida." }, { status: 400 });
  }

  const venue = await db.venue.findFirst({ where: { id: venueId, active: true }, select: { id: true } });
  if (!venue) {
    return NextResponse.json({ error: "Locale non trovato." }, { status: 404 });
  }

  const availability = await getDayAvailability(venueId, { year, month, day }, partySize);

  return NextResponse.json(availability, {
    // La disponibilità cambia a ogni prenotazione: non va messa in cache.
    headers: { "cache-control": "no-store" },
  });
}
