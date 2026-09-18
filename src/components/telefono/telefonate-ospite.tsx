import Link from "next/link";
import { Phone, PhoneMissed } from "lucide-react";
import type { ChiamataDiOspite } from "@/server/chiamate";
import { NOME_ESITO } from "@/lib/voice-esiti";

/**
 * Le telefonate di questa persona, sulla sua scheda.
 *
 * Nello storico del telefono le chiamate sono righe; qui sono **il rapporto
 * con quella persona**. «Ha chiamato tre volte in due settimane e non ha mai
 * prenotato» è una cosa che chi risponde vuole sapere mentre le parla, e non
 * c'era nessun posto dove si potesse leggere.
 *
 * Due colonne di informazione e non di più: quando, e com'è finita. Chi guarda
 * una scheda cliente sta cercando una cosa sola per volta, e un elenco di
 * telefonate con durata, esito, operatore e qualità della linea sarebbe il
 * cruscotto del centralino messo in mezzo al CRM.
 */

const GIORNO = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function durata(secondi: number | null): string | null {
  if (secondi == null) return null;
  if (secondi < 60) return `${secondi}s`;
  return `${Math.floor(secondi / 60)} min`;
}

export function TelefonateOspite({
  chiamate,
}: {
  chiamate: ChiamataDiOspite[];
}) {
  if (chiamate.length === 0) {
    return (
      <p className="t-nota">
        Nessuna telefonata da questo numero. Compaiono qui appena chiama, con il
        collegamento alla prenotazione se ne nasce una.
      </p>
    );
  }

  const senzaRisposta = chiamate.filter((c) => c.stato === "MISSED").length;

  return (
    <div className="space-y-3">
      {/* Il conto che cambia una telefonata: se ha provato e non ha trovato
          nessuno, la prima cosa da dire è «scusi, la scorsa volta». */}
      {senzaRisposta > 0 && (
        <p className="t-nota">
          <strong className="text-foreground">
            {senzaRisposta === 1
              ? "Una volta ha chiamato e non ha trovato nessuno."
              : `${senzaRisposta} volte ha chiamato e non ha trovato nessuno.`}
          </strong>
        </p>
      )}

      <ul className="space-y-1.5">
        {chiamate.map((c) => {
          const persa = c.stato === "MISSED";
          const Icona = persa ? PhoneMissed : Phone;
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-baseline gap-x-2 text-sm"
            >
              <Icona
                className={`h-3.5 w-3.5 shrink-0 ${persa ? "text-destructive-soft" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span className="tabular-nums">
                {GIORNO.format(new Date(c.quando))}
              </span>
              <span className="t-nota">
                {persa
                  ? "nessuna risposta"
                  : (durata(c.durataSecondi) ??
                    (c.stato === "RINGING" ? "sta chiamando" : "risposta"))}
              </span>
              {c.prenotazione ? (
                <Link
                  href={`/bookings/${c.prenotazione.id}`}
                  className="t-nota underline underline-offset-2 hover:text-foreground"
                >
                  ne è nata una prenotazione
                </Link>
              ) : (
                /* L'esito solo quando **non** c'è la prenotazione: quando c'è,
                   il collegamento dice già la stessa cosa e meglio — ci si può
                   anche cliccare. Due righe che dicono «prenotazione presa»
                   una accanto all'altra sono rumore. E niente esito sulle
                   perse: «nessuna risposta» è già scritto due parole prima. */
                c.esito &&
                !persa && (
                  <span className="t-nota">
                    {NOME_ESITO[c.esito].toLowerCase()}
                  </span>
                )
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
