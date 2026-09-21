import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { puo } from "@/lib/permessi-staff";
import { salaDelCameriere } from "@/server/staff-app/sala";

/**
 * I tavoli di chi sta guardando.
 *
 * `?tutti=1` chiede anche quelli degli altri, e **non basta chiederlo**: si
 * ricevono solo con `view_all_tables`. Un commis che scrive il parametro a
 * mano ottiene i suoi, non un errore — il parametro è un desiderio, il
 * permesso è la risposta.
 */
export async function GET(req: Request) {
  const ctx = await requireStaffApi("view_tables");
  if (!ctx.ok) return ctx.response;

  const url = new URL(req.url);
  const chiedeTutti = url.searchParams.get("tutti") === "1";

  try {
    const sala = await salaDelCameriere(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      {
        tuttaLaSala: chiedeTutti && puo(ctx.permessi, "view_all_tables"),
        roomId: url.searchParams.get("sala"),
        /*
          Come nella pagina che questa rotta ricarica: senza i tavoli liberi,
          al primo giro della sonda del realtime spariscono dallo schermo tutti
          i posti dove si può accomodare qualcuno — la pagina li aveva e
          l'aggiornamento li togliesse sarebbe il difetto peggiore, perché si
          manifesta cinque secondi dopo essere entrati.
        */
        ancheLiberi: true,
      },
    );
    return NextResponse.json(sala, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
