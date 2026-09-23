import type { IntegrationAdapter } from "./tipi";
import { lightspeedK } from "./lightspeed-k";
import { cassaInCloud } from "./cassa-in-cloud";
import { tilby } from "./tilby";
import { oracleSimphony } from "./oracle-simphony";

/**
 * Quale codice parla con quale fornitore.
 *
 * Aggiungere un fornitore = scrivere il suo adattatore e aggiungerlo qui, poi
 * portare la sua voce del catalogo da `PLANNED` a `IN_DEVELOPMENT`. Nient'altro:
 * rotte, interfaccia, motore di sincronizzazione e webhook sono gli stessi.
 */
const ADATTATORI = new Map<string, IntegrationAdapter>([
  [lightspeedK.slug, lightspeedK],
  [cassaInCloud.slug, cassaInCloud],
  [tilby.slug, tilby],
  [oracleSimphony.slug, oracleSimphony],
]);

export function adattatoreDi(slug: string): IntegrationAdapter | null {
  return ADATTATORI.get(slug) ?? null;
}

export function slugConAdattatore(): string[] {
  return [...ADATTATORI.keys()];
}

/**
 * Solo per le prove: un adattatore finto registrato sotto uno slug di prova.
 * Rifiuta gli slug del catalogo, così una prova non può sostituire
 * l'adattatore vero di Lightspeed per tutto il processo.
 */
export function registraAdattatorePerProve(a: IntegrationAdapter): () => void {
  if (process.env.NODE_ENV === "production") throw new Error("solo_nelle_prove");
  if (!a.slug.startsWith("prova-")) throw new Error("slug_di_prova_obbligatorio");
  ADATTATORI.set(a.slug, a);
  return () => ADATTATORI.delete(a.slug);
}
