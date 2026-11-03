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
  const cortaResa = corta === undefined ? etichettaResa : accorda(corta, valore);
  const notaResa = nota === undefined ? undefined : accorda(nota, valore);

  return (
    <li
      className={cn(
        "vetro card-notch flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-3 sm:p-4",
        ultimaDispari && "col-span-2 md:col-span-1",
        className,
      )}
    >
      {/* Il dischetto solo da `sm`: in una colonna da 114 px, 48 px di tondo
          non lasciano spazio al numero accanto. */}
      <span className="vetro kpi-pastiglia hidden h-12 w-12 shrink-0 place-items-center rounded-full sm:grid">
        <Icona className="h-6 w-6" stroke="url(#trattoVetro)" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="t-etichetta flex items-center gap-1.5 text-[13px] text-kpi-label-muted sm:text-sm">
          <Icona className="h-[22px] w-[22px] shrink-0 sm:hidden" stroke="url(#trattoTenue)" />
          <span className="sm:hidden">{cortaResa}</span>
          <span className="hidden sm:inline">{etichettaResa}</span>
        </p>
        <p
          className={cn(
            "mt-0.5 font-mono text-2xl leading-8 tabular-nums xl:text-3xl xl:leading-9",
            allarme ? "text-accent-strong" : "text-foreground",
          )}
        >
          {valore}
        </p>
        {barra != null && (
          <div className="barra-binario mt-1.5 h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className="barra-pieno h-full rounded-full bg-surface-brown-light"
              style={{ width: `${Math.min(100, Math.max(0, barra))}%` }}
            />
          </div>
        )}
        {notaResa && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{notaResa}</p>}
      </div>
    </li>
  );
}
