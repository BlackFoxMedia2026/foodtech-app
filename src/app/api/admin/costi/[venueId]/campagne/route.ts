import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { campagneDelCiclo, dettaglioCosti } from "@/server/costi/dettaglio";

export const dynamic = "force-dynamic";

/** Le campagne che consumano o impegnano budget nel ciclo corrente. */
export async function GET(_req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  const dettaglio = await dettaglioCosti(params.venueId);
  if (!dettaglio) return apiError(404, "not_found", "Locale non trovato.");

  return NextResponse.json({
    righe: await campagneDelCiclo(params.venueId, dettaglio.ciclo, dettaglio.exchangeRate),
  });
}
