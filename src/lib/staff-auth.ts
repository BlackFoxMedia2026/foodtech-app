import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { apiError } from "./api-auth";
import { puo, type PermessoStaff } from "./permessi-staff";
import { risolviContestoStaff, type ContestoStaff } from "@/server/contesto-staff";
import type { AuditActor } from "@/server/audit";

/**
 * **La guardia della Staff App.**
 *
 * Fa per il servizio quello che `requireVenueApi` fa per il back office, e la
 * differenza è tutta nell'ultima riga: là si verifica un'`Ability` sul ruolo
 * d'accesso, qui un `PermessoStaff` sui permessi effettivi della **persona**
 * (mestiere ∩ ruolo d'accesso, vedi `lib/permessi-staff.ts`).
 *
 * Il permesso è un argomento e non un'opzione con un valore per difetto:
 * dimenticarlo dev'essere una scelta visibile in fase di revisione, non una
 * distrazione che apre una rotta a chiunque. Le uniche chiamate senza
 * permesso sono le letture che riguardano soltanto sé stessi, e lì il filtro
 * è la `where` sul proprio `waiterId`.
 *
 * ## Perché non nascondiamo e basta
 *
 * §1 del brief: «NON devono essere semplicemente nascoste graficamente le
 * sezioni non autorizzate». Un pulsante nascosto è un suggerimento; un
 * cameriere che scrive a mano `/api/...` nella barra degli indirizzi non lo
 * vede nemmeno. Il controllo vero sta qui, nel server, e la navigazione lo
 * rispecchia — non lo sostituisce.
 */

export type StaffApiContext = ContestoStaff & { ok: true };
export type StaffApiFailure = { ok: false; response: NextResponse };
export type StaffApiResult = StaffApiContext | StaffApiFailure;

/** Il messaggio che si legge quando un account non ha un'anagrafica collegata. */
export const SENZA_ANAGRAFICA =
  "Il tuo account non è ancora collegato a una scheda del personale. Chiedi a un responsabile di collegarlo.";

export async function requireStaffApi(permesso: PermessoStaff): Promise<StaffApiResult> {
  const esito = await risolviContestoStaff();

  switch (esito.stato) {
    case "senza_sessione":
      return {
        ok: false,
        response: apiError(401, "unauthenticated", "Sessione scaduta. Rientra per continuare."),
      };
    case "senza_locale":
      return {
        ok: false,
        response: apiError(403, "no_venue", "Il tuo account non è collegato a nessun locale."),
      };
    case "senza_anagrafica":
      return {
        ok: false,
        response: apiError(403, "no_staff_record", SENZA_ANAGRAFICA),
      };
    case "non_attivo":
      return {
        ok: false,
        response: apiError(
          403,
          "staff_not_active",
          "Il tuo profilo non risulta in servizio. Chiedi a un responsabile di riattivarlo.",
        ),
      };
    case "ok":
      break;
  }

  if (!puo(esito.contesto.permessi, permesso)) {
    return {
      ok: false,
      response: apiError(403, "forbidden", "Il tuo ruolo non consente questa operazione.", {
        permesso,
        ruolo: esito.contesto.persona.primaryRole,
      }),
    };
  }

  return { ok: true, ...esito.contesto };
}

/**
 * Lo stesso controllo per le **pagine**, dove la risposta giusta non è uno
 * status ma una destinazione.
 *
 * Chi non ha una scheda collegata finisce sulla Panoramica del back office e
 * non su una pagina d'errore: quasi sempre è un manager che ha aperto per
 * curiosità l'indirizzo della Staff App, e mandarlo in un vicolo cieco
 * sarebbe scortese. Chi non ha proprio accesso al locale passa dalle stesse
 * porte di sempre.
 */
export async function getContestoStaff(permesso?: PermessoStaff): Promise<ContestoStaff> {
  const esito = await risolviContestoStaff();

  if (esito.stato === "senza_sessione") redirect("/sign-in");
  if (esito.stato === "senza_locale") redirect("/onboarding");
  if (esito.stato === "senza_anagrafica") redirect("/overview");
  if (esito.stato === "non_attivo") redirect("/overview");

  if (permesso && !puo(esito.contesto.permessi, permesso)) redirect("/staff-app");

  return esito.contesto;
}

/**
 * L'attore per il registro delle azioni, costruito dal contesto di servizio.
 *
 * `auditActor()` di `server/audit.ts` parte dal contesto del back office, che
 * porta con sé la sessione intera. Qui il contesto è più stretto — è la
 * persona, non l'account — e questa funzione esiste per non doverlo forzare a
 * somigliare all'altro con un cast: ogni cast in un percorso di sicurezza è un
 * posto in cui, fra sei mesi, qualcuno passerà `undefined` senza che il
 * compilatore dica niente.
 */
export function attoreStaff(ctx: ContestoStaff, req?: Request): AuditActor {
  return {
    userId: ctx.userId,
    email: ctx.email,
    orgId: ctx.orgId,
    venueId: ctx.venueId,
    ip: req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req?.headers.get("user-agent")?.slice(0, 255) ?? null,
  };
}
