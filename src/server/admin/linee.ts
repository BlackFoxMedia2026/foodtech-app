import { z } from "zod";
import { db } from "@/lib/db";
import {
  CentralinoRemotoError,
  assegnaNumero,
  configurato,
  montaLinea,
} from "@/server/admin/centralino-remoto";
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

/* -------------------------------------------------------------------------- */
/*  Montare la linea dell'operatore, e assegnarla in un colpo                 */
/* -------------------------------------------------------------------------- */

export const LineaOperatoreInput = z.object({
  /** Come si chiama l'operatore: serve solo a riconoscere la linea. */
  nome: z.string().trim().min(2).max(60),
  /** Il server SIP dell'operatore. */
  host: z.string().trim().min(3).max(200),
  porta: z.coerce.number().int().min(1).max(65535).optional(),
  trasporto: z.enum(["UDP", "TCP", "TLS"]).optional(),
  /** L'utenza con cui ci registriamo. Spesso è il numero stesso. */
  utente: z.string().trim().max(120).optional(),
  /** La password dell'operatore. **Non si salva in Tavolo.** */
  password: z.string().max(200).optional(),
  /** Il numero che arriva su questa linea. */
  numero: z.string().trim().min(3).max(40),
  /** A quale locale assegnarlo. */
  venueId: z.string().trim().min(1),
});

/**
 * Una linea nuova, dall'inizio alla fine: si monta e si assegna.
 *
 * Sono due gesti sul centralino — la linea dell'operatore, e il numero che
 * arriva su quella linea per un locale — e si fanno **in quest'ordine**, in una
 * richiesta sola, perché chi vende una linea non pensa «prima il trunk, poi il
 * DID»: pensa «ho comprato questo numero, è di questo ristorante».
 *
 * Se il primo riesce e il secondo no, la linea resta montata e il numero non
 * assegnato: si ripreme e si va avanti, perché montare la stessa linea due
 * volte non crea un doppione (il centralino riusa quella che c'è).
 */
export async function montaEAssegna(raw: unknown) {
  const dati = LineaOperatoreInput.parse(raw);

  if (!configurato()) {
    throw new LineaError(
      "non_configurato",
      "Il collegamento al centralino non è configurato su questa installazione.",
    );
  }

  const linea = await montaLinea({
    nome: dati.nome,
    host: dati.host,
    ...(dati.porta ? { porta: dati.porta } : {}),
    ...(dati.trasporto ? { trasporto: dati.trasporto } : {}),
    ...(dati.utente ? { utente: dati.utente } : {}),
    ...(dati.password ? { password: dati.password } : {}),
  });

  const assegnato = await assegnaLinea(dati.venueId, {
    numero: dati.numero,
    etichetta: dati.nome,
  });

  return { ...assegnato, montata: linea.montata, avvisi: linea.avvisi };
}
