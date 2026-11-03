import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { accorda, type Parola } from "@/lib/accordo";
import { TrattiSfumati } from "@/components/ui/tessera-kpi";

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
  valoreCompatto = false,
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
  /**
   * Il valore è un **nome**, non un numero.
   *
   * «Il più usato: Martedì da noi» è un dato di testata come gli altri, ma
   * ventotto pixel sono la misura di una cifra: un nome di coupon lì dentro va
   * a capo, e una carta che cresce di una riga rompe l'allineamento di tutta
   * la fascia. Qui scende alla misura di un titolo di scheda e si taglia —
   * l'unica eccezione alla Regola di Ciò che Non si Taglia consentita in
   * questa fascia, perché il nome per intero sta due centimetri più giù,
   * nell'elenco.
   */
  valoreCompatto?: boolean;
  className?: string;
}) {
  const etichettaResa = accorda(etichetta, valore);
  const notaResa = nota === undefined ? undefined : accorda(nota, valore);

  /*
    Dal 3 novembre 2026 la carta ha il disegno della tessera della Panoramica
    (`tessera-kpi.tsx`): vetro chiaro, dischetto verde con l'icona a tratto
    sfumato, numero monospaziato. Le sei tinte (`tono`) restano nella firma ma
    non colorano più la carta: sei vetri di sei colori accanto alla fascia
    neutra della Panoramica sembravano un altro prodotto.
  */
  void tono;
  return (
    <div className={cn("vetro card-notch flex items-start gap-3 p-3 sm:p-4", className)}>
      <TrattiSfumati />
      <span
        className="vetro kpi-pastiglia hidden h-12 w-12 shrink-0 place-items-center rounded-full sm:grid"
        aria-hidden="true"
      >
        <Icona className="h-6 w-6" stroke="url(#trattoVetro)" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="t-etichetta truncate text-[13px] text-kpi-label-muted sm:text-sm">{etichettaResa}</p>
        <p
          className={cn(
            valoreCompatto
              ? "mt-1 truncate text-base font-semibold leading-tight md:text-lg"
              : "mt-0.5 font-mono text-2xl leading-8 tabular-nums xl:text-3xl xl:leading-9",
            allarme ? "text-accent-strong" : "text-foreground",
          )}
          title={valoreCompatto ? String(valore) : undefined}
        >
          {valore}
        </p>
        <p className="mt-1 truncate text-[11px] leading-tight text-muted-foreground">{notaResa || " "}</p>
      </div>
    </div>
  );
}
