import { z } from "zod";
import { db } from "@/lib/db";
import { CentralinoRemotoError, assegnaNumero, configurato } from "@/server/admin/centralino-remoto";
import { aggiungiLinea } from "@/server/voice/numeri-linea";

/**
 * Assegnare una linea a un locale, dal pannello di piattaforma.
 *
 * ## L'ordine dei due gesti, e perché non è indifferente
 *
 * **Prima il centralino, poi Tavolo.** Il centralino è quello che riceve la
 * telefonata: se l'assegnazione là non riesce, in Tavolo non deve comparire
 * niente — un numero mostrato nella procedura di collegamento viene dettato
 * all'operatore telefonico, e una deviazione impostata verso un numero che
 * nessuno riceve è un ristorante che perde le chiamate senza capire perché.
 *
 * L'ordine opposto sarebbe più comodo (si scrive subito, si sincronizza dopo) e
 * produrrebbe esattamente quel danno.
 */

export const LineaInput = z.object({
  numero: z.string().trim().min(3).max(40),
  etichetta: z.string().trim().max(80).optional(),
});

export class LineaError extends Error {
  constructor(
    readonly codice: "non_configurato" | "tenant_sconosciuto" | "locale_non_trovato",
    message: string,
  ) {
    super(message);
    this.name = "LineaError";
  }
}

export async function assegnaLinea(venueId: string, raw: unknown) {
  const dati = LineaInput.parse(raw);

  if (!configurato()) {
    throw new LineaError(
      "non_configurato",
      "Il collegamento al centralino non è configurato su questa installazione: il numero va assegnato dal centralino.",
    );
  }

  const locale = await db.venue.findUnique({
    where: { id: venueId },
    select: { centralinoTenantId: true },
  });
  if (!locale) throw new LineaError("locale_non_trovato", "Questo locale non esiste.");

  if (!locale.centralinoTenantId) {
    /* Non si indovina, e non si prova col nome del locale: assegnare un numero
       al cliente sbagliato manda le telefonate di un ristorante nel gestionale
       di un altro. L'identificativo arriva dal centralino quando dichiara le
       sue linee — cioe quando qualcuno salva il collegamento di questo
       locale. */
    throw new LineaError(
      "tenant_sconosciuto",
      "Il centralino non si è ancora presentato per questo locale: salva il collegamento del gestionale dal centralino, poi riprova.",
    );
  }

  const esito = await assegnaNumero(locale.centralinoTenantId, dati.numero, dati.etichetta);

  /* Solo adesso, e con il numero **normalizzato dal centralino**: quella e la
     forma che riconoscera quando la chiamata arriva. */
  await aggiungiLinea(venueId, "blackfox", esito.numero, dati.etichetta);

  return { numero: esito.numero };
}

export { CentralinoRemotoError, configurato };
