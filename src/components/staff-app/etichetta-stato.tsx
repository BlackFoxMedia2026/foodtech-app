import { cn } from "@/lib/utils";
import { STATO_STAFF_LABEL, type StatoTavoloStaff, type TonoStato } from "@/lib/stato-tavolo-staff";

/**
 * **Lo stato del tavolo, come parola**, nella testata del tavolo aperto.
 *
 * ## Perché è tutto quello che resta di `card-tavolo.tsx`
 *
 * Questo file è il residuo della card in elenco della Sala: una scheda larga
 * quanto lo schermo e alta 104 px con nome ospite, minuti, conto, stato per
 * esteso e riga di richiamo. Era ben fatta per essere **letta**, e la Sala
 * adesso chiede di essere **premuta**: i tavoli sono tasti in griglia
 * (`griglia-tavoli.tsx`), otto per schermata invece di quattro.
 *
 * Della card sopravvive l'etichetta di stato, perché la usa la testata del
 * tavolo aperto — dove lo spazio c'è e la parola intera si legge. Il resto è
 * stato cancellato invece di restare «per ogni eventualità»: un componente
 * senza chiamanti non si accorge di essere rotto.
 *
 * La classe del tono sta qui e non in `lib/stato-tavolo-staff.ts`: una classe
 * Tailwind scritta in un file di dati che il compilatore non scandisce come
 * template smette di esistere in produzione, in silenzio. È già successo in
 * questo progetto.
 */
const TESTO_TONO: Record<TonoStato, string> = {
  neutro: "text-muted-foreground",
  attesa: "text-muted-foreground",
  attivo: "text-sage-strong",
  urgente: "text-accent-strong",
  spento: "text-muted-foreground",
};

export function EtichettaStato({ stato, tono }: { stato: StatoTavoloStaff; tono: TonoStato }) {
  return (
    <span className={cn("text-xs font-medium", TESTO_TONO[tono])}>{STATO_STAFF_LABEL[stato]}</span>
  );
}
