import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { TrattiSfumati } from "@/components/ui/tessera-kpi";
import { PARTI, indirizzoParte, type ParteId } from "@/lib/parti-impostazioni";
import { SEGNI } from "./segni-impostazioni";

/**
 * L'indice delle Impostazioni: cinque schede, e una si apre.
 *
 * ## Il difetto che questo corregge
 *
 * Una pagina sola alta **ottomila pixel**: otto schermate e mezzo di righe
 * tutte uguali, con cinque ancore in alto per saltare. «Uno scroll infinito»,
 * ed era vero — anche dopo aver messo in ordine righe, schede e valori, la
 * quantità restava quella.
 *
 * ## Perché non è un ritorno alle cinque pagine di prima
 *
 * Le Impostazioni **erano** cinque pagine, e sono diventate una perché quelle
 * cinque avevano un difetto preciso: entrando si vedeva un quinto delle
 * impostazioni e si doveva **indovinare** in quale degli altri quattro stesse
 * la cosa cercata.
 *
 * Il rimedio a quel difetto non era mettere tutto in una pagina: era dire
 * cosa c'è dentro. Per questo ogni scheda porta l'elenco dei suoi gruppi —
 * «Brand, Locali del gruppo, Turni di servizio» — e chi cerca i turni li
 * **vede** dall'indice, senza aprire e senza scorrere. Quaranta righe di
 * impostazioni diventano quattordici nomi su una schermata.
 *
 * ## Niente stato, niente pallini
 *
 * Le schede non dicono «tre cose da completare»: dirlo vorrebbe calcolare, per
 * ogni sezione, quali valori contano come mancanti — cioè una seconda verità
 * accanto a quella che le righe mostrano già, e la prima volta che le due non
 * combaciano non si crede più a nessuna delle due. Quello che manca si vede
 * dentro, con i bollini tratteggiati.
 */
/**
 * Sul telefono le sei schede diventano **gruppi di righe**, come le
 * Impostazioni del telefono stesso: sei schede alte 190 px erano quattro
 * schermate da scorrere per scegliere fra sei voci. Una riga dice le stesse
 * cose — simbolo, nome, cosa c'è dentro — in un quarto dello spazio, e tutto
 * l'indice sta in una schermata. I gruppi dicono di chi è la decisione, lo
 * stesso criterio di `parti-impostazioni.ts`.
 */
const GRUPPI_TELEFONO: { titolo: string; parti: ParteId[] }[] = [
  { titolo: "Il ristorante", parti: ["locale", "prenotazioni", "ospiti"] },
  { titolo: "Comunicazione", parti: ["centralino", "marketing"] },
  { titolo: "Account e sistema", parti: ["sistema"] },
];

/**
 * Il dischetto della sezione: la stessa cupola verde delle tessere della
 * Panoramica (19 nov 2026). Prima era un tondo grigio da 36 px con l'icona
 * grigia, e le Impostazioni sembravano un altro prodotto accanto alla
 * Panoramica, che è il riferimento di stile di tutto il back office.
 */
export function DischettoSezione({
  id,
  grande = false,
}: {
  id: ParteId;
  grande?: boolean;
}) {
  const Icona = SEGNI[id].icona as React.ComponentType<{
    className?: string;
    stroke?: string;
  }>;
  return (
    <span
      className={
        grande
          ? "vetro kpi-pastiglia grid h-14 w-14 shrink-0 place-items-center rounded-full"
          : "vetro kpi-pastiglia grid h-10 w-10 shrink-0 place-items-center rounded-full"
      }
    >
      <Icona
        className={grande ? "h-7 w-7" : "h-5 w-5"}
        stroke="url(#trattoVetro)"
        aria-hidden="true"
      />
    </span>
  );
}

function IndiceTelefono() {
  return (
    <div className="mt-5 space-y-6 md:hidden">
      {GRUPPI_TELEFONO.map((gruppo) => (
        <section key={gruppo.titolo} aria-label={gruppo.titolo}>
          <h2 className="t-etichetta px-1">{gruppo.titolo}</h2>
          <ul className="vetro card-notch mt-2 overflow-hidden">
            {gruppo.parti.map((id) => {
              const parte = PARTI.find((p) => p.id === id)!;
              return (
                <li key={id} className="border-b border-border/50 last:border-b-0">
                  <Link
                    href={indirizzoParte(id)}
                    className="flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors active:bg-current/5"
                  >
                    <DischettoSezione id={id} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold leading-snug text-foreground">
                        {parte.titolo}
                      </span>
                      {/* Cosa c'è dentro, per intero: è ciò che fa trovare
                          i turni senza aprire tre sezioni a caso. */}
                      <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted-foreground">
                        {parte.dentro.join(" · ")}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function IndiceImpostazioni() {
  return (
    <>
      <TrattiSfumati />
      <IndiceTelefono />
      <div className="mt-6 hidden gap-4 md:mt-8 md:grid md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {PARTI.map((parte) => (
          <Link
            key={parte.id}
            href={indirizzoParte(parte.id)}
            /* Tutta la scheda è il bersaglio, non un «apri» in un angolo: su
               un tablet in cucina il pollice non cerca un link di dodici
               pixel. */
            className="vetro card-notch group flex min-h-[15rem] flex-col p-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <DischettoSezione id={parte.id} grande />
              {/* Lo stesso tondo bianco con la freccia obliqua che apre
                  l'andamento sulla Panoramica: «si apre», detto uguale. */}
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70 text-foreground shadow-sm ring-1 ring-white/80 transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary dark:bg-white/10 dark:ring-white/10">
                <ArrowUpRight className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
              </span>
            </div>

            <h2 className="mt-5 text-display text-2xl leading-tight">
              {parte.titolo}
            </h2>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
              {parte.sottotitolo}
            </p>

            {/* Cosa c'è dentro: è la ragione per cui questo indice funziona
                dove le cinque pagine di prima non funzionavano. Capsule e non
                una riga di testo grigio separato da punti: sono **nomi di
                cose**, e una capsula ciascuno si legge come un elenco di
                posti, non come la coda della frase sopra. `mt-auto` le tiene
                in fondo, così nella stessa fila partono alla stessa altezza. */}
            <ul className="mt-auto flex flex-wrap gap-1.5 pt-5">
              {parte.dentro.map((voce) => (
                <li
                  key={voce}
                  className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium leading-none text-foreground/75"
                >
                  {voce}
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </div>
    </>
  );
}
