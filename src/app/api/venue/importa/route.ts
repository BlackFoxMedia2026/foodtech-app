import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { anteprimaImportazione, eseguiImportazione } from "@/server/importazione";

/**
 * Portare dentro i clienti di un altro gestionale.
 *
 * ## Due gesti, una rotta
 *
 * `POST` con `esegui: false` (o assente) **guarda**: legge il file, dice cosa
 * succederebbe, non scrive niente. Con `esegui: true` scrive.
 *
 * Il file arriva come testo nel corpo e non come `multipart`: un CSV è testo,
 * e leggerlo nel browser costa una riga (`file.text()`). Il caricamento
 * multipart servirebbe per un allegato binario — qui aggiungerebbe un pezzo
 * di codice per niente.
 *
 * ## Perché `manage_venue` e non `manage_bookings`
 *
 * Perché un'importazione scrive **nella rubrica e nell'agenda di tutti**, e si
 * fa una volta quando si cambia gestionale: è il potere di chi configura il
 * locale, non di chi prende le prenotazioni della sera. Un cameriere che
 * carica per sbaglio il file del ristorante di un amico non deve poter
 * riempire la rubrica di duemila sconosciuti.
 */

export const dynamic = "force-dynamic";

/**
 * Il tetto sul testo, prima di leggerlo.
 *
 * Cinquemila righe da duecento caratteri sono un megabyte: due sono
 * abbondanti, e un file più grande di così non è l'esportazione di un
 * ristorante — è un errore che va detto subito invece di far lavorare il
 * server per trenta secondi e poi rispondere «troppo lungo».
 */
const TESTO_MASSIMO = 2 * 1024 * 1024;

const Corpo = z.object({
  /** Il contenuto del CSV, come testo. */
  testo: z.string().min(1).max(TESTO_MASSIMO),
  /** Falso o assente = anteprima. Vero = scrive. */
  esegui: z.boolean().optional(),
});

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const corpo = Corpo.parse(await req.json());

    if (!corpo.esegui) {
      return NextResponse.json(await anteprimaImportazione(ctx.venueId, corpo.testo));
    }

    const esito = await eseguiImportazione(ctx.venueId, corpo.testo, {
      actor: auditActor(ctx, req),
    });
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof z.ZodError) {
      /* Il messaggio dice **quale** limite, perché «file non valido» su un
         file da tre megabyte manda a cercare un problema di formato. */
      return apiError(
        413,
        "file_troppo_grande",
        "Il file è troppo grande: dividilo in due e caricali uno per volta.",
      );
    }
    return apiErrorResponse(err);
  }
}
