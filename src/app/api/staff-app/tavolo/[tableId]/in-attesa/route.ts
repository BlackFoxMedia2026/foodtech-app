import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { ospitiPerTavolo } from "@/server/staff-app/accoglienza";

/**
 * «Chi metto su questo tavolo?» — il secondo percorso del §4.
 *
 * La coda è la stessa della Sala e della Home: non è filtrata per tavolo, ma
 * ogni riga sa se ci sta (`ciStanno`). Nascondere chi non ci sta sarebbe
 * peggio — sei persone davanti a un quattro posti sono una decisione che in
 * sala si prende, avvicinando una sedia, e un elenco che tace quella
 * possibilità fa sembrare il prodotto rotto.
 */
export async function GET(_req: Request, { params }: { params: { tableId: string } }) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  try {
    const esito = await ospitiPerTavolo(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      params.tableId,
    );
    return NextResponse.json(esito, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
