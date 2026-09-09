import type { ComponentType, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un blocco di configurazione: **il valore si legge da chiuso**, si apre solo
 * per cambiarlo.
 *
 * Impostazioni era una colonna di schede tutte aperte, ognuna col suo titolo,
 * la sua spiegazione, il suo modulo e la sua nota in fondo. Per sapere a quanto
 * era impostato lo scontrino medio si scorreva fino a trovare il riquadro e si
 * leggeva dentro il campo; per sapere se il portale Wi-Fi era attivo, uguale.
 * La parte «Ospiti» misurava 466 px di scorrimento interno per dire quattro
 * numeri.
 *
 * Adesso ogni blocco dichiara il suo valore nell'intestazione: aprendo la
 * pagina si legge **la configurazione**, non i moduli per cambiarla. Il modulo
 * c'è ancora, a un clic, e non si è perso niente — è la differenza fra leggere
 * e modificare, che qui erano la stessa cosa.
 *
 * `<details>` e non uno stato: funziona senza JavaScript, con la tastiera, e
 * il browser ci mette la semantica giusta senza che serva `aria-expanded`.
 *
 * Senza `children` è una riga sola — titolo, valore, e un'azione che porta
 * altrove. Serve ai blocchi che non si configurano qui (il brand, il portale
 * Wi-Fi): meglio una riga che una scheda vuota con un pulsante.
 */
export function Blocco({
  titolo,
  icona: Icona,
  valore,
  azione,
  aperto = false,
  className,
  children,
}: {
  titolo: string;
  icona?: ComponentType<{ className?: string }>;
  /**
   * I valori correnti, in poche parole: «45 € a persona», «Google · 1
   * collegamento», «3 turni · 96 coperti». È l'informazione che prima si
   * poteva avere solo aprendo.
   *
   * Quando non c'è niente da dichiarare va detto anche quello — «non
   * impostato» — perché uno spazio vuoto si legge come un errore di
   * caricamento.
   */
  valore?: ReactNode;
  /**
   * Un comando che non richiede di aprire: di solito un link a un'altra
   * pagina. **Solo per i blocchi senza `children`** — dentro un `<summary>`
   * ogni clic finisce sul summary, quindi un pulsante lì aprirebbe il blocco
   * invece di fare la sua cosa.
   */
  azione?: ReactNode;
  /**
   * Aperto già all'apertura della pagina.
   *
   * Da usare con parsimonia: se sono aperti tutti, siamo tornati alla colonna
   * di prima. Vale per il blocco che è **il lavoro** di quella parte, non per
   * quello che è solo importante.
   */
  aperto?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const nome = (
    <span className="flex min-w-0 items-center gap-2">
      {Icona && <Icona className="h-4 w-4 shrink-0 text-accent-strong" />}
      <span className="t-titolo-scheda truncate">{titolo}</span>
    </span>
  );

  if (!children) {
    return (
      <div className={cn("surface flex items-center justify-between gap-3 p-4", className)}>
        {nome}
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {valore}
          {azione}
        </span>
      </div>
    );
  }

  return (
    <details className={cn("surface group overflow-hidden", className)} open={aperto}>
      {/*
        Dentro il `<summary>` non va niente su cui si possa premere.

        Il browser gira ogni clic dentro il summary sul summary: un pulsante
        lì dentro apre e chiude il blocco invece di fare la sua cosa — e sul
        blocco che nasce aperto lo **chiude**, facendo sparire quello che ha
        appena aperto. Per questo `azione` vale solo per i blocchi che non si
        aprono; qui il comando sta dentro, in cima al corpo.

        E per questo il summary non porta `.tocco-comodo`: quella classe
        allarga il bersaglio con un `::after` che copre tutto il contenuto, e
        su una riga che contiene già altro ruberebbe il puntatore. Non serve:
        i 44 px ci sono per conto loro.
      */}
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        {nome}
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {valore}
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

/**
 * La spiegazione di un blocco, dentro il blocco aperto.
 *
 * Stava nell'intestazione, dove occupava una riga anche a chi passava senza
 * fermarsi. Chi apre un blocco è chi sta per cambiare qualcosa: è lì che la
 * spiegazione serve.
 */
export function BloccoNota({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm text-card-foreground/65">{children}</p>;
}
