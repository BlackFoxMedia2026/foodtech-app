import { z } from "zod";
import { db } from "@/lib/db";
import { normalizzaE164 } from "@/lib/telefono";

/**
 * Le linee che arrivano a questo locale, dichiarate dal centralino.
 *
 * ## Perche le dichiara il centralino e non le digita il ristoratore
 *
 * Perche non sono sue. Il numero a cui far deviare le telefonate e **un
 * numero nostro**, sta nel centralino insieme al trunk che lo consegna, e il
 * centralino e l'unico posto che sa se quel numero e davvero collegato a quel
 * cliente. Un campo da riempire a mano in Tavolo produrrebbe la cosa peggiore
 * possibile: un numero scritto bene, mostrato con sicurezza, detto
 * all'operatore telefonico — e che non arriva da nessuna parte.
 *
 * Quindi il verso e lo stesso di tutto il resto del ponte: **il centralino
 * spinge, Tavolo riceve.** Il giorno che a un cliente si assegna una linea, la
 * procedura di collegamento lo mostra da sola.
 *
 * ## Le righe non si cancellano
 *
 * Una linea che non viene piu dichiarata si **spegne** (`attivo: false`) e non
 * si cancella: le chiamate di ieri puntano a quella riga (`PhoneCall.voiceNumberId`),
 * e cancellarla vorrebbe dire perdere *su quale linea* erano arrivate. Uno
 * storico che dimentica da dove entravano le telefonate non si puo
 * ricostruire.
 */

export const NumeriInput = z.object({
  numeri: z
    .array(
      z.object({
        /** Il numero come lo conosce il centralino. */
        numero: z.string().trim().min(3).max(40),
        /** Come mostrarlo al ristoratore, se piu leggibile della forma tecnica. */
        mostrato: z.string().trim().max(40).optional(),
        /** A cosa serve questa linea: «il numero sul menu». */
        etichetta: z.string().trim().max(80).optional(),
      }),
    )
    .max(20),
});

export class NumeroDiUnAltroError extends Error {
  constructor(readonly numero: string) {
    super("numero_di_un_altro_locale");
    this.name = "NumeroDiUnAltroError";
  }
}

export type EsitoNumeri = {
  /** Quante linee sono attive adesso per questo locale. */
  attive: number;
  /** Quante sono state spente perche non piu dichiarate. */
  spente: number;
};

export async function dichiaraNumeri(
  venueId: string,
  fornitore: string,
  raw: unknown,
): Promise<EsitoNumeri> {
  const { numeri } = NumeriInput.parse(raw);

  /* La forma E.164 e l'unica su cui si puo confrontare: lo stesso numero
     scritto `0114410418`, `+39 011 4410418` e `0039114410418` sono tre
     stringhe diverse e una sola linea. Se la normalizzazione non riesce si
     tiene quello che e arrivato — meglio una riga in una forma insolita che
     una linea che non compare. */
  const puliti = numeri.map((n) => ({
    numeroEsterno: normalizzaE164(n.numero) ?? n.numero,
    numeroMostrato: n.mostrato ?? null,
    etichetta: n.etichetta ?? null,
  }));

  /*
    Lo stesso numero non puo arrivare a due locali.

    Sul trunk il numero chiamato **e** la chiave con cui si trova il cliente:
    se due locali dichiarassero la stessa linea, la telefonata finirebbe nel
    gestionale sbagliato — e con lei il nome di chi chiama e la prenotazione.
    Si rifiuta, e si dice quale: un errore qui e una configurazione da
    correggere, non un caso da gestire in silenzio.
  */
  for (const n of puliti) {
    const altrove = await db.voiceNumber.findFirst({
      where: { fornitore, numeroEsterno: n.numeroEsterno, NOT: { venueId } },
      select: { id: true },
    });
    if (altrove) throw new NumeroDiUnAltroError(n.numeroEsterno);
  }

  for (const n of puliti) {
    await db.voiceNumber.upsert({
      where: { fornitore_numeroEsterno: { fornitore, numeroEsterno: n.numeroEsterno } },
      create: { venueId, fornitore, ...n, attivo: true },
      update: { venueId, ...n, attivo: true },
    });
  }

  const spente = await db.voiceNumber.updateMany({
    where: {
      venueId,
      fornitore,
      attivo: true,
      numeroEsterno: { notIn: puliti.map((n) => n.numeroEsterno) },
    },
    data: { attivo: false },
  });

  return { attive: puliti.length, spente: spente.count };
}
