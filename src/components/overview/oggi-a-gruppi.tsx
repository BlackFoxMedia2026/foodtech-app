import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { gruppiOggi, statoRiga, type PrenotazioneRiquadro } from "@/lib/prenotazioni-nuove";
import { oraInVenue } from "@/lib/venue-time";

/**
 * La giornata come le Impostazioni di iOS: un pannello per Pranzo e uno per
 * Cena, una riga per prenotazione. La riga porta al dettaglio che c'è già.
 */
export function OggiAGruppi({ prenotazioni, fuso }: { prenotazioni: PrenotazioneRiquadro[]; fuso: string }) {
  const gruppi = gruppiOggi(prenotazioni, fuso);

  if (gruppi.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
        <p className="vi-titolo-sezione">Giornata libera</p>
        <p className="vi-sottotitolo">Nessuna prenotazione per oggi.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {gruppi.map((g) => (
        <section key={g.fascia} aria-labelledby={`gruppo-${g.fascia}`}>
          <div className="vi-gruppo-testa">
            <h4 id={`gruppo-${g.fascia}`}>{g.etichetta}</h4>
            <span className="vi-cifre">
              {g.coperti} {g.coperti === 1 ? "coperto" : "coperti"}
            </span>
          </div>
          <ul className="vi-pannello vetro-ios-scheda">
            {g.righe.map((p) => {
              const stato = statoRiga(p.status);
              return (
                <li key={p.id}>
                  <Link href={`/bookings/${p.id}`} className="vi-riga">
                    <span className="vi-riga-ora">{oraInVenue(p.startsAt, fuso)}</span>
                    <span className="vi-riga-chi">
                      {p.nome} <span>· {p.partySize} pers.</span>
                    </span>
                    <span className="vi-stato" data-tono={stato.tono}>
                      {stato.parola}
                    </span>
                    <ChevronRight className="vi-chevron h-4 w-4" aria-hidden="true" />
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
