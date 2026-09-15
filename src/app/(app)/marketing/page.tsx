import { redirect } from "next/navigation";

/**
 * `/marketing` non è più una pagina: **reindirizza alle campagne**.
 *
 * Qui c'erano sei riquadri, uno per strumento, ognuno con il suo numero. Il
 * numero li faceva sembrare un cruscotto, ma la pagina non permetteva di fare
 * niente: si leggeva e si cliccava. Chi voleva i coupon pagava tre gesti —
 * apri Marketing, leggi l'indice, apri Coupon — e i primi due gli dicevano
 * cose che sapeva già. L'indice adesso è il menu che si apre dalla voce in
 * barra (`components/shell/marketing-menu.tsx`), e il primo clic mostra tutte
 * e sette le porte.
 *
 * Il percorso resta e reindirizza invece di sparire: è nei segnalibri, lo usa
 * il comando «vai in marketing» dell'agente, e un 404 su un indirizzo che
 * ieri funzionava è la cosa peggiore che si possa fare a chi si fida di un
 * link salvato.
 *
 * Va alle campagne perché sono la prima voce del menu e la cosa che si fa più
 * spesso: scrivere a qualcuno. Non è un redirect permanente — la destinazione
 * predefinita del marketing è una scelta di prodotto, e un 308 resta nella
 * cache del browser anche dopo averla cambiata.
 *
 * `server/marketing/intenti.ts` — «cosa vuoi ottenere», le proposte con i loro
 * numeri — restava appeso a questa pagina e adesso non è renderizzato da
 * nessuna parte. Il modulo e i suoi test sono ancora qui: la scelta di dove
 * rimetterlo è aperta, non è codice rotto da rimuovere.
 */
export default function MarketingPage() {
  redirect("/campaigns");
}
