import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { saluteInfrastruttura } from "@/server/costi/salute";

export const dynamic = "force-dynamic";

/**
 * Lo stato della catena di invio. `?ricontrolla=1` rifà le letture subito.
 *
 * Diagnostica e basta: qualunque cosa risponda, gli invii continuano a
 * dipendere solo dal ledger.
 */
export async function GET(req: Request) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  const forza = new URL(req.url).searchParams.get("ricontrolla") === "1";
  const fotografia = await saluteInfrastruttura(forza);
  return NextResponse.json(fotografia);
}
