import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { MergeError, unisciOspiti } from "@/server/guest-merge";

/**
 * Unire due schede della stessa persona.
 *
 * Chiede `manage_venue` — cioè il ruolo Manager — e non `manage_bookings`:
 * è l'unica operazione che **cancella una riga di anagrafica**, e chi accoglie
 * durante il servizio non deve poterla fare per sbaglio da un menù.
 *
 * I messaggi d'errore dicono cosa è andato storto in italiano, perché in
 * questa schermata chi legge sta decidendo su due clienti veri.
 */

const Input = z.object({
  principaleId: z.string().min(1),
  duplicatoId: z.string().min(1),
});

const MESSAGGI: Record<string, { stato: number; testo: string }> = {
  stessa_scheda: { stato: 422, testo: "È la stessa scheda: non c'è niente da unire." },
  non_trovata: { stato: 404, testo: "Una delle due schede non esiste più, o non è di questo locale." },
  anonimizzata: {
    stato: 422,
    testo:
      "Una delle due schede è stata anonimizzata su richiesta del cliente: unirla rimetterebbe in circolo dati cancellati.",
  },
  nessun_segnale: {
    stato: 422,
    testo:
      "Queste due schede non hanno né la stessa email né lo stesso telefono: non c'è modo di sapere che sono la stessa persona.",
  },
};

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const { principaleId, duplicatoId } = Input.parse(await req.json());
    const esito = await unisciOspiti(ctx.venueId, principaleId, duplicatoId, {
      actor: auditActor(ctx, req),
    });
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof MergeError) {
      const m = MESSAGGI[err.code];
      return apiError(m?.stato ?? 422, err.code, m?.testo ?? "Non è stato possibile unire le schede.");
    }
    if (err instanceof z.ZodError) {
      return apiError(422, "richiesta_non_valida", "Servono le due schede da unire.");
    }
    throw err;
  }
}
