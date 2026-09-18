import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PARTI, indirizzoParte } from "@/lib/parti-impostazioni";
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
export function IndiceImpostazioni() {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 md:mt-8 md:gap-4 lg:grid-cols-3">
      {PARTI.map((parte) => {
        const { icona: Icona } = SEGNI[parte.id];
        return (
          <Link
            key={parte.id}
            href={indirizzoParte(parte.id)}
            /* Tutta la scheda è il bersaglio, non un «apri» in un angolo: su
               un tablet in cucina il pollice non cerca un link di dodici
               pixel. */
            className="riquadro group flex min-h-[11.5rem] flex-col rounded-xl border-border/80 bg-white/[0.02] p-4 transition-colors hover:border-cream/40 hover:bg-white/[0.04] md:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60">
                <Icona
                  className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground"
                  aria-hidden="true"
                />
              </span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-tertiary-foreground transition-colors group-hover:text-foreground"
                aria-hidden="true"
              />
            </div>

            <h2 className="mt-3 text-display text-xl leading-tight">
              {parte.titolo}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {parte.sottotitolo}
            </p>

            {/* Cosa c'è dentro: è la ragione per cui questo indice funziona
                dove le cinque pagine di prima non funzionavano.

                Separato da una linea, e non solo da un po' d'aria: sono nomi
                di cose, non la continuazione della frase sopra. */}
            {/* `min-h` su due righe: in una fila di tre schede gli elenchi
                hanno lunghezze diverse, e senza un'altezza minima la linea di
                separazione cadeva a tre altezze differenti nella stessa fila.
                Una riga che dovrebbe ordinare e invece sfalsa è peggio di
                nessuna riga. */}
            <p className="mt-auto min-h-[2.75rem] border-t border-border/60 pt-3 text-xs leading-relaxed text-tertiary-foreground">
              {parte.dentro.join(" · ")}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
