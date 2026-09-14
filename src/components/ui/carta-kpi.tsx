import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { accorda, type Parola } from "@/lib/accordo";

/**
 * Le sei tinte della fascia. Stanno tutte dentro la coppia verde/oro di
 * Tavolo: la fascia distingue sei dati diversi **senza** introdurre un colore
 * che nel prodotto non significa niente.
 *
 * La meccanica del vetro — velatura, sfocatura, bordo, ombra — è scritta una
 * volta sola in `globals.css` (`.kpi-vetro`); ogni tono dichiara solo le
 * quattro variabili di colore. Per cambiare il materiale si tocca un posto,
 * per cambiare una tinta se ne tocca un altro.
 */
export type TonoKpi = "bosco" | "bronzo" | "petrolio" | "oliva" | "salvia" | "alloro";

const TONO: Record<TonoKpi, string> = {
  bosco: "kpi-bosco",
  bronzo: "kpi-bronzo",
  petrolio: "kpi-petrolio",
  oliva: "kpi-oliva",
  salvia: "kpi-salvia",
  alloro: "kpi-alloro",
};

/**
 * La fascia: sei carte affiancate su scrivania, tre per due su tablet, e sul
 * telefono le tre che servono davvero (chi le porta decide con `hidden`).
 *
 * Sei colonne partono da `lg`, non da `xl`: a 1024 px una carta misura ~155 px
 * e il numero ci sta comodo; scendere a due righe da 1024 in giù avrebbe
 * speso trecento pixel di altezza su una schermata che non scorre.
 */
export function FasciaKpi({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid grid-cols-3 gap-2.5 md:gap-3.5 lg:grid-cols-6 lg:gap-4", className)}>
      {children}
    </div>
  );
}

/**
 * Una carta della fascia dei numeri.
 *
 * **Il numero è il primo elemento visivo**, e non era così: prima stava in
 * `text-lg` — la misura del titolo della pagina — sopra un'etichetta in 10 px,
 * dentro una cella alta 44 px. Sei dati con lo stesso identico aspetto non
 * sono una testata, sono un indice: per sapere quanti aspettano si leggeva
 * l'etichetta e poi il numero, mentre una fascia di KPI si guarda al
 * contrario. Ora l'ordine di lettura è numero → etichetta → base.
 *
 * **Da tablet in su la carta è coricata**: dischetto a sinistra, numero e
 * didascalia a destra. In piedi misurava 156 px, e li spendeva quasi tutti in
 * aria fra l'icona in alto e il numero in basso — `justify-between` teneva i
 * due estremi lontani per riempire un'altezza decisa a priori. Coricata sono
 * 84 px: gli stessi quattro elementi, senza il vuoto in mezzo. I settantadue
 * pixel risparmiati sono due card operative in più sopra la piega in
 * Servizio, che è dove si lavora davvero.
 *
 * Sul telefono resta in piedi: a 112 px di larghezza il dischetto e
 * «IN ATTESA» non ci stanno sulla stessa riga, e comprimere l'uno o
 * troncare l'altra sarebbe peggio dell'altezza che si risparmia.
 *
 * **L'icona adesso è una sola.** La filigrana al 5% sul fianco destro era
 * materia, e su una carta da 156 px funzionava; su una da 84 finisce dietro
 * il numero, ed è l'unico posto dove una texture non va mai. Il
 * riconoscimento a colpo d'occhio resta al dischetto, che per questo cresce
 * un poco.
 *
 * **La base del numero c'è sempre**, anche quando è vuota: un `&nbsp;` tiene
 * la riga, così le sei carte allineano la stessa griglia orizzontale invece di
 * far ballare l'etichetta di quella senza nota. Ed è la stessa regola di
 * `CellaNumero`: un numero senza la sua base non è un numero, quindi va a
 * capo, non si taglia.
 */
export function CartaKpi({
  icona: Icona,
  etichetta,
  valore,
  nota,
  tono,
  allarme = false,
  className,
}: {
  icona: LucideIcon;
  etichetta: Parola;
  valore: number | string;
  /** La base del numero: «persone», «coperti», «entro 60 min». */
  nota?: Parola;
  tono: TonoKpi;
  /**
   * Il dato è fuori norma. Accende il numero in `accent-strong` — l'oro che si
   * legge — e non un rosso: sulla fascia sarebbe l'unica tinta estranea alla
   * marca, e il tono `oliva` porta già il bordo oro che l'accompagna.
   */
  allarme?: boolean;
  className?: string;
}) {
  const etichettaResa = accorda(etichetta, valore);
  const notaResa = nota === undefined ? undefined : accorda(nota, valore);

  return (
    <div
      className={cn(
        "kpi-vetro flex flex-col gap-2 rounded-xl p-3",
        "md:flex-row md:items-center md:gap-3 md:p-3.5",
        TONO[tono],
        className,
      )}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cream/10 bg-cream/[0.07] text-cream/55 md:h-11 md:w-11"
        aria-hidden="true"
      >
        <Icona className="h-4 w-4 md:h-5 md:w-5" />
      </span>

      <div className="min-w-0">
        {/* `text-2xl` e non più `2rem`: coricata, la carta dà al numero la
            larghezza che resta dopo il dischetto — a 1024 px sono una
            settantina di pixel, e «2/17» in 32 px non ci starebbe. Torna
            grande da `xl`, dove la larghezza c'è. */}
        <p
          className={cn(
            "text-2xl font-semibold leading-none tabular-nums xl:text-[1.75rem]",
            allarme ? "text-accent-strong" : "text-cream",
          )}
        >
          {valore}
        </p>
        <p className="mt-1.5 truncate text-[11px] font-semibold uppercase leading-tight tracking-wider text-cream/90">
          {etichettaResa}
        </p>
        {/* 65% e non 55%: misurato sul **reso**, cioè sulla tinta composita
            alla quota dove la nota sta davvero (in basso, dove il gradiente è
            quasi tutto `--kpi-basso`), il crema al 55% fa 4,24-4,56 : 1 e su
            quattro toni su sei manca la soglia. A 65% fa 5,27-5,77 : 1 e resta
            comunque due gradini sotto l'etichetta. */}
        <p className="mt-0.5 truncate text-[11px] leading-tight text-cream/65">
          {notaResa || "\u00A0"}
        </p>
      </div>
    </div>
  );
}
