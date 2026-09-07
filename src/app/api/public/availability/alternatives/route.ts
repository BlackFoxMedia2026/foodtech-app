import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prossimiGiorniLiberi } from "@/server/availability";

/**
 * I primi giorni con posto, dopo quello richiesto.
 *
 * Sta in una rotta a parte, e non dentro la disponibilità del giorno, per una
 * ragione di velocità: la domanda «e allora quando?» si fa **solo** quando il
 * giorno scelto è pieno, e chi trova posto al primo colpo non deve pagare il
 * conto di una ricerca che non gli serve.
 *
 * Esempio: `/api/public/availability/alternatives?venue=<id>&date=2026-09-12&partySize=4`
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venueId = url.searchParams.get("venue");
  const date = url.searchParams.get("date");
  const partySize = Number(url.searchParams.get("partySize") ?? "2");

  if (!venueId) return NextResponse.json({ error: "Locale non indicato." }, { status: 400 });
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Data non valida: attesa nel formato AAAA-MM-GG." }, { status: 400 });
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    return NextResponse.json({ error: "Numero di persone non valido." }, { status: 400 });
  }

  const [year, month, day] = date.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return NextResponse.json({ error: "Data non valida." }, { status: 400 });
  }

  const venue = await db.venue.findFirst({ where: { id: venueId, active: true }, select: { id: true } });
  if (!venue) return NextResponse.json({ error: "Locale non trovato." }, { status: 404 });

  const giorni = await prossimiGiorniLiberi(venueId, { year, month, day }, partySize, {
    canale: "pubblico",
  });

  return NextResponse.json(
    { giorni },
    { headers: { "cache-control": "no-store" } },
  );
}
