import type { ZodError } from "zod";

/**
 * Cosa legge una persona quando un modulo viene rifiutato.
 *
 * Ogni route che valida i dati rispondeva «Alcuni campi non sono validi.», e
 * la spiegazione vera — «Il link dei biglietti non è un indirizzo valido» —
 * finiva in un dettaglio tecnico che nessuna interfaccia mostrava. Chi
 * compilava vedeva un rifiuto senza sapere cosa sistemare.
 *
 * Sta in un file suo, senza dipendenze, per la stessa ragione di
 * `lib/abilities.ts`: `lib/api-auth.ts` tira dentro la sessione e `cache()` di
 * React, e una funzione pura non deve avere bisogno di un browser per essere
 * provata.
 */

/**
 * Le frasi che Zod scrive da sé, in inglese, quando nessuno gliene ha data una.
 *
 * «Expected string, received number» è un messaggio per chi scrive il codice:
 * se l'errore è di questo tipo si preferisce la frase generica in italiano.
 */
const ZOD_PREDEFINITO =
  /^(Expected|Required|Invalid|String must|Number must|Array must|Unrecognized|Too big|Too small)/i;

export function messaggioDiValidazione(err: ZodError): string {
  const scritta = err.issues.find((i) => i.message && !ZOD_PREDEFINITO.test(i.message));
  return scritta?.message ?? "Alcuni campi non sono validi.";
}
