import { accorda, type Parola } from "@/lib/accordo";
import { cn } from "@/lib/utils";

/**
 * La tessera dei numeri della Panoramica, resa comune (3 novembre 2026).
 *
 * Nata nel briefing della Panoramica: vetro, dischetto verde con l'icona a
 * tratto sfumato, etichetta in maiuscoletto e numero monospaziato grande. Le
 * altre fasce di numeri del back office — lista d'attesa, Report, Pagamenti,
 * Coupon — avevano ognuna il suo disegno (celle divise da filetti, carte a
 * tinta piena, carte di vetro colorato), e lo stesso dato «quanti sono»
 * sembrava detto da quattro prodotti diversi. Adesso è una tessera sola.
 *
 * Regole che vengono con lei:
 * - **il numero è il primo elemento visivo**, l'etichetta lo accompagna;
 * - **l'etichetta concorda col numero** (`Parola`, vedi `lib/accordo.ts`);
 * - **la nota non si taglia**: è la base del numero («tavolo tenuto»,
 *   «1 conto chiuso»), e un numero senza la sua base non è un numero.
 */

/**
 * Le due sfumature dei tratti delle icone.
 *
 * `gradientUnits="userSpaceOnUse"` non è un dettaglio da copiare a memoria:
 * col valore predefinito (`objectBoundingBox`) il gradiente si risolve sul
 * riquadro di **ogni singolo sotto-tracciato**, e per specifica un elemento
 * il cui riquadro ha altezza o larghezza zero non viene disegnato. Le icone
 * di lucide sono piene di segmenti dritti e sparivano una riga per volta,
 * lasciando solo il contorno. Nello spazio del `viewBox` (`0 0 24 24`, lo
 * stesso per tutte) il problema non esiste.
 *
 * Due sfumature: crema→sabbia dentro il dischetto; sul tono dell'etichetta
 * quando sul telefono l'icona le sta in riga.
 *
 * La disegna ogni fascia: se in pagina ce ne sono due, gli `id` doppi
 * puntano a due definizioni identiche, e il browser usa la prima.
 */
export function TrattiSfumati() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="trattoVetro" gradientUnits="userSpaceOnUse" x1="12" y1="2" x2="12" y2="22">
          <stop offset="0" style={{ stopColor: "var(--tratto-vetro-alto)" }} />
          <stop offset="1" style={{ stopColor: "var(--tratto-vetro-basso)" }} />
        </linearGradient>
        <linearGradient id="trattoTenue" gradientUnits="userSpaceOnUse" x1="12" y1="2" x2="12" y2="22">
          <stop offset="0" style={{ stopColor: "var(--tratto-tenue-alto)" }} />
          <stop offset="1" style={{ stopColor: "var(--tratto-tenue-basso)" }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

const COLONNE: Record<2 | 3 | 4, string> = {
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
};

/**
 * La fila delle tessere: due colonne sotto `xl`, tutte in fila da `xl`.
 *
 * Con quattro numeri e una valuta («2.250,00 €») le colonne strette non
 * bastano prima di 1280 px: le tessere vanno a capo invece di stringersi.
 * Con tre numeri si sta in fila già da `md`. Se le tessere sono dispari,
 * l'ultima prende la riga sotto `xl` (lo fa la tessera con `ultimaDispari`).
 */
export function FasciaTessere({
  colonne,
  className,
  children,
}: {
  colonne: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("fissa", className)}>
      <TrattiSfumati />
      <ul
        className={cn(
          "grid grid-cols-2 gap-2 sm:gap-3",
          /* Sotto `md` le tessere sono sempre due per riga, e lo spigolo vivo
             di ognuna punta al centro della fascia (16 nov 2026): la prima
             riga lo gira in basso (sinistra in basso a destra, destra in basso
             a sinistra), le righe sotto lo tengono in alto, con quelle di
             sinistra girate verso destra. L'ultima dispari, larga tutta la
             riga, resta com'è. */
          "max-md:[&>li:first-child:not(.col-span-2)]:rounded-[24px_24px_4px_24px]",
          "max-md:[&>li:nth-child(2)]:rounded-[24px_24px_24px_4px]",
          "max-md:[&>li:nth-child(2n+3):not(.col-span-2)]:rounded-[24px_4px_24px_24px]",
          colonne === 3 && "md:grid-cols-3",
          COLONNE[colonne],
        )}
      >
        {children}
      </ul>
    </section>
  );
}

export function TesseraKpi({
  icona: Icona,
  etichetta,
  corta,
  valore,
  nota,
  barra,
  allarme = false,
  ultimaDispari = false,
  className,
}: {
  icona: React.ComponentType<{ className?: string; stroke?: string }>;
  etichetta: Parola;
  /**
   * Il nome accorciato per il telefono, dove la colonna è larga 114 px.
   * È la stessa parola abbreviata, non un secondo vocabolario.
   */
  corta?: Parola;
  valore: number | string;
  /** La riga piccola sotto il numero: da dove viene, o cosa manca. */
  nota?: Parola;
  /** Una percentuale da mostrare anche come barra (la pienezza). */
  barra?: number;
  /** Il dato è fuori norma: il numero si accende nell'oro che si legge. */
  allarme?: boolean;
  /** Ultima di un numero dispari: prende tutta la riga sotto `xl`. */
  ultimaDispari?: boolean;
  className?: string;
}) {
  const etichettaResa = accorda(etichetta, valore);
  /* `corta` resta nella firma per chi la passa, ma non si usa più: vedi
     l'etichetta qui sotto. */
  void corta;
  const notaResa = nota === undefined ? undefined : accorda(nota, valore);

  return (
    <li
      className={cn(
        "vetro card-notch flex flex-col gap-1.5 p-3.5 sm:flex-row sm:items-start sm:gap-3 sm:p-4",
        ultimaDispari && "col-span-2 md:col-span-1",
        className,
      )}
    >
      {/* Il dischetto solo da `sm`: in una colonna da 114 px, 48 px di tondo
          non lasciano spazio al numero accanto. */}
      <span className="vetro kpi-pastiglia hidden h-12 w-12 shrink-0 place-items-center rounded-full sm:grid">
        <Icona className="h-6 w-6" stroke="url(#trattoVetro)" />
      </span>

      <div className="min-w-0 flex-1 [container-type:inline-size]">
        {/* Sul telefono l'etichetta è intera anche lei: «PRENOT.» faceva
            indovinare. Per farla stare l'icona scende a 18 px e la spaziatura
            si stringe; se ancora non basta va a capo, non si taglia. */}
        <p className="t-etichetta flex items-center gap-1.5 text-sm text-kpi-label-muted max-sm:tracking-[0.02em]">
          <Icona className="h-5 w-5 shrink-0 sm:hidden" stroke="url(#trattoTenue)" />
          <span className="min-w-0 break-words">{etichettaResa}</span>
        </p>
        <p
          className={cn(
            "mt-1 font-mono leading-tight tabular-nums sm:mt-0.5 sm:text-2xl sm:leading-8 xl:text-3xl xl:leading-9",
            /* Sul telefono il numero è il più grande possibile: i corti
               («8», «23%») a 36 px; quelli lunghi («1.575,00 €») seguono la
               larghezza della colonna (cqw) così non vanno mai a capo. */
            String(valore).length > 5 ? "text-[clamp(1.375rem,15cqw,2rem)]" : "text-[2.25rem]",
            allarme ? "text-accent-strong" : "text-foreground",
          )}
        >
          {valore}
        </p>
        {barra != null && (
          <div className="barra-binario mt-2 h-2.5 w-full sm:mt-1.5 sm:h-2 overflow-hidden rounded-full bg-border">
            <div
              className="barra-pieno h-full rounded-full bg-surface-brown-light"
              style={{ width: `${Math.min(100, Math.max(0, barra))}%` }}
            />
          </div>
        )}
        {notaResa && <p className="mt-1 text-[13px] leading-tight text-muted-foreground sm:text-xs md:text-[11px]">{notaResa}</p>}
      </div>
    </li>
  );
}
