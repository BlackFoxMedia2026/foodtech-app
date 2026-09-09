/**
 * **Quando** conta un avviso del servizio — che è la domanda che si fa chi
 * accoglie.
 *
 * Gli avvisi erano ordinati per gravità: prima i `warning`, poi il resto. Ma
 * chi è al leggio non ordina per gravità, ordina per **quando**: «critico» non
 * dice se devo alzarmi ora. E il caso in cui si vedeva era questo: «un tavolo
 * libero e una famiglia che aspetta» è un'opportunità, non un problema, e
 * finiva sotto quattro ritardi di mezz'ora che si recuperano con una
 * telefonata — mentre è l'unica cosa in quella schermata che si risolve solo
 * adesso.
 *
 * I quattro livelli si **derivano** da quello che c'era già: `urgenza` (fra
 * quanti minuti conta, zero = adesso) e la gravità. Nessun campo nuovo da
 * tenere allineato in dieci regole.
 *
 * Con un'eccezione, che una regola può dichiarare: **il tempo non è sempre la
 * risposta giusta**. Un cliente in ritardo di quaranta minuti conta adesso —
 * `urgenza` zero, ed è vero — ma non c'è nessuna decisione da prendere: c'è
 * una telefonata da fare. Provandolo sui dati veri si vedeva subito: quattro
 * ritardi diventavano quattro cartelli grandi identici, e il tavolo libero con
 * una famiglia in piedi — l'unica cosa che si risolve solo adesso — finiva in
 * fondo. Quindi una regola può scrivere `livello` e dire come stanno le cose;
 * oggi lo fa una sola, e le altre undici restano derivate.
 *
 * Sta in `lib` e non in `server/service-intelligence` per una ragione precisa:
 * la derivazione serve **anche al client**, che decide con questa quali avvisi
 * mostrare per esteso. Importando la funzione dal modulo del server, dentro il
 * pacchetto del browser sarebbe finito anche Prisma.
 */

export type GravitaAvviso = "warning" | "opportunity" | "info";

/**
 * - `adesso` — qualcuno sta aspettando una decisione, ora
 * - `fra_poco` — diventerà «adesso» se non si fa niente
 * - `guarda` — un fatto che cambia il servizio, ma non nei prossimi minuti
 * - `sapere` — contesto utile, nessuna azione
 */
export type LivelloAvviso = "adesso" | "fra_poco" | "guarda" | "sapere";

/** Entro quanti minuti un avviso è ancora «fra poco» e non «guarda». */
export const FRA_POCO_MIN = 15;

export const ORDINE_LIVELLI: Record<LivelloAvviso, number> = {
  adesso: 0,
  fra_poco: 1,
  guarda: 2,
  sapere: 3,
};

export function livelloAvviso(i: {
  severity: GravitaAvviso;
  urgenza: number;
  livello?: LivelloAvviso;
}): LivelloAvviso {
  if (i.livello) return i.livello;
  // Un'informazione resta un'informazione: non chiede niente a nessuno, quindi
  // non può prendersi lo spazio di una decisione da prendere adesso.
  if (i.severity === "info") return "sapere";
  // Urgenza zero è «conta adesso», e vale sia per un problema sia per
  // un'occasione: un tavolo libero con qualcuno in piedi si risolve ora, o non
  // si risolve.
  if (i.urgenza === 0) return "adesso";
  if (i.urgenza <= FRA_POCO_MIN) return "fra_poco";
  return "guarda";
}
