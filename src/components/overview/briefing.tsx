import { CalendarRange, Gauge, Users, Wallet } from "lucide-react";
import { riepilogoIncasso, type IncassoDelGiorno } from "@/components/overview/incasso";
import { cn } from "@/lib/utils";

/**
 * Le due sfumature dei tratti delle icone.
 *
 * `gradientUnits="userSpaceOnUse"` non è un dettaglio da copiare a memoria:
 * col valore predefinito (`objectBoundingBox`) il gradiente si risolve sul
 * riquadro di **ogni singolo sotto-tracciato**, e per specifica un elemento
 * il cui riquadro ha altezza o larghezza zero non viene disegnato. Le icone
 * di lucide sono piene di segmenti dritti — il calendario ne ha sette su
 * otto: `M3 10h18`, `M16 2v4`, i due puntini — e sparivano una riga per
 * volta, lasciando solo il rettangolo esterno. Nello spazio del `viewBox`
 * (`0 0 24 24`, lo stesso per tutte) il problema non esiste.
 *
 * Due sfumature e non una perché l'icona deve stare nel registro di chi le
 * sta accanto: crema→sabbia dentro il dischetto, dove il vicino è il numero;
 * sul tono dell'etichetta quando sul telefono le sta in riga, altrimenti
 * l'icona diventa più chiara della parola che accompagna e si prende
 * l'attenzione da sola.
 */
function TrattiSfumati() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="trattoVetro" gradientUnits="userSpaceOnUse" x1="12" y1="2" x2="12" y2="22">
          <stop offset="0" stopColor="#F2E7D0" />
          <stop offset="1" stopColor="#A89B80" />
        </linearGradient>
        <linearGradient id="trattoTenue" gradientUnits="userSpaceOnUse" x1="12" y1="2" x2="12" y2="22">
          <stop offset="0" stopColor="#E1CA97" />
          <stop offset="1" stopColor="#A1906C" />
        </linearGradient>
      </defs>
    </svg>
  );
}

type Blocco = {
  chiave: string;
  icona: React.ComponentType<{ className?: string; stroke?: string }>;
  etichetta: string;
  /**
   * Il nome accorciato per il telefono, dove la colonna è larga 114 px e
   * «Prenotazioni» in maiuscoletto non ci sta. È la stessa parola abbreviata,
   * come `shortLabel` in navigazione: non un secondo vocabolario.
   */
  corta: string;
  valore: string;
  /** La percentuale, sui blocchi che mostrano anche la barra. */
  barra?: number;
  /**
   * La riga piccola sotto il numero: cosa manca quando il numero non c'è, o
   * da dove viene quando c'è. Non è decorazione — è ciò che tiene onesto un
   * trattino («imposta lo scontrino medio») e un incasso vero («3 conti
   * chiusi · 40,00 € da gift card»).
   */
  nota?: string;
};

/**
 * Il briefing prima del servizio.
 *
 * Quanti siamo, quanto siamo pieni e quanto vale la giornata, prima di
 * aprire. Un blocco per numero, e niente altro.
 *
 * Prima era **una frase**: «17 prenotazioni · 70 coperti · 47% pieno». Si
 * legge in tre secondi, ma i tre numeri che contano avevano lo stesso peso
 * dei punti che li separavano, e nessuno dei tre si trovava a colpo d'occhio.
 * Adesso sono blocchi, ognuno con la sua icona e il suo numero grande.
 *
 * L'incasso è il quarto, e sta qui invece che in un riquadro marrone a metà
 * pagina: è uno dei numeri che si dicono prima di aprire, non un dettaglio da
 * andare a cercare scorrendo. La regola che scegli fra incasso vero e stima
 * non sta in questo file — sta in `incasso.ts`, perché è una regola sul dato
 * e non sul suo aspetto.
 *
 * Resta la regola che teneva onesta la frase: **si mostra solo quello che
 * c'è**. La pienezza è un blocco in meno quando il locale non ha turni
 * configurati, non una percentuale calcolata su una capienza di ripiego.
 *
 * Qui sotto non ci sono più né gli avvisi né il picco, e le due uscite sono
 * diverse:
 *
 * - **gli avvisi** (VIP, compleanni, allergie, da confermare) erano quattro
 *   pillole con un conteggio aggregato, cioè un numero su cui non si agisce:
 *   «5 allergie» non dice di chi. Stanno dove servono, sulla prenotazione —
 *   `CosaSapere` in `/bookings/[id]`, nella tabella prenotazioni, in Servizio
 *   e in Sala — e da lì si sa il nome e il piatto;
 * - **il picco** è finito in «Prenotazioni di oggi», segnato sulla riga da cui
 *   parte, invece di essere una frase staccata qui sopra: lì è accanto alle
 *   persone che arrivano in quel momento.
 */
export function Briefing({
  prenotazioni,
  coperti,
  occupancyPct,
  estimatedRevenueCents,
  incasso,
  currency,
  deltaIncasso,
}: {
  prenotazioni: number;
  coperti: number;
  /** Nullo quando il locale non ha turni configurati: non lo sappiamo. */
  occupancyPct: number | null;
  /** La stima: nulla quando il locale non ha dichiarato lo scontrino medio. */
  estimatedRevenueCents: number | null;
  /** L'incasso vero, quando qualche conto è già chiuso. */
  incasso?: IncassoDelGiorno;
  currency: string;
  /** Il confronto con ieri sulle stime, da `comparisons.revenue`. */
  deltaIncasso?: number | null;
}) {
  if (coperti === 0) return null;

  const soldi = riepilogoIncasso({ estimatedRevenueCents, incasso, currency, deltaStima: deltaIncasso });

  const blocchi: Blocco[] = [
    {
      chiave: "prenotazioni",
      icona: CalendarRange,
      etichetta: "Prenotazioni",
      corta: "Prenot.",
      valore: String(prenotazioni),
    },
    { chiave: "coperti", icona: Users, etichetta: "Coperti", corta: "Coperti", valore: String(coperti) },
  ];

  // Senza turni configurati non sappiamo quanto sia pieno, e non lo diciamo:
  // prima si divideva per una capienza di ripiego (90) e usciva una
  // percentuale che non voleva dire niente. Il blocco non c'è, e quelli che
  // restano si dividono la riga.
  if (occupancyPct != null) {
    blocchi.push({
      chiave: "pienezza",
      icona: Gauge,
      etichetta: "Pienezza",
      corta: "Pieno",
      valore: `${occupancyPct}%`,
      barra: occupancyPct,
    });
  }

  blocchi.push({
    chiave: "incasso",
    icona: Wallet,
    etichetta: soldi.label,
    corta: soldi.corta,
    valore: soldi.valore,
    // Il confronto con ieri sta nella stessa riga piccola della nota: le due
    // cose non capitano insieme (la nota parla di conti chiusi, e con i conti
    // chiusi il confronto non si fa) e una seconda riga sotto il numero
    // alzerebbe tutta la fascia.
    nota:
      soldi.nota ??
      (soldi.delta != null && soldi.delta !== 0
        ? `${soldi.delta > 0 ? "▲" : "▼"} ${Math.abs(soldi.delta)}% vs ieri`
        : undefined),
  });

  return (
    <section className="fissa">
      <TrattiSfumati />

      {/*
        Due colonne sul telefono, tutte in fila sul desktop ampio.

        Con tre numeri ci stavano tre colonne anche su 390 px. Il quarto è
        l'incasso, e «2.250,00 €» in una colonna da 85 px non ci sta in nessuna
        dimensione di carattere che si legga: sotto `xl` sono due colonne, e i
        blocchi vanno a capo invece di stringersi. Da `xl` (1280 px) la fila è
        una sola — l'obiettivo del desktop — e il numero più lungo ha 200 px
        di spazio, misurati sul carattere monospaziato.

        Se i blocchi sono un numero dispari l'ultimo prende tutta la riga,
        altrimenti sotto `xl` resterebbe mezza cella vuota accanto.

        E `items-start`, non `items-center`: la barra della pienezza allunga il
        suo blocco di quattordici pixel, e col contenuto centrato la sua
        etichetta e il suo numero finivano sette pixel più in alto degli altri
        — card accostate con le etichette su righe diverse. Ancorare la barra
        al fondo della card era peggio: il blocco perde l'altezza della barra e
        il filetto passava a ridosso del «47%».
      */}
      <ul
        className={cn(
          "grid grid-cols-2 gap-2 sm:gap-3",
          blocchi.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3",
        )}
      >
        {blocchi.map(({ chiave, icona: Icona, etichetta, corta, valore, barra, nota }, i) => (
          <li
            key={chiave}
            className={cn(
              "vetro card-notch flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-3 sm:p-4",
              blocchi.length % 2 === 1 && i === blocchi.length - 1 && "col-span-2 xl:col-span-1",
            )}
          >
            {/* Il dischetto solo da `sm`: in una colonna da 114 px, 48 px di
                tondo non lasciano spazio al numero accanto. */}
            <span className="vetro hidden h-12 w-12 shrink-0 place-items-center rounded-full sm:grid">
              <Icona className="h-6 w-6" stroke="url(#trattoVetro)" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="t-etichetta flex items-center gap-1.5 text-[13px] sm:text-sm">
                <Icona className="h-[22px] w-[22px] shrink-0 sm:hidden" stroke="url(#trattoTenue)" />
                <span className="sm:hidden">{corta}</span>
                <span className="hidden sm:inline">{etichetta}</span>
              </p>
              {/* Un gradino di corpo fra le due larghezze: a 30 px l'incasso
                  sforava la colonna del portatile, e un numero che va a capo
                  sull'euro si legge peggio di uno scritto più piccolo. */}
              <p className="mt-0.5 font-mono text-2xl leading-8 text-foreground xl:text-3xl xl:leading-9">
                {valore}
              </p>
              {barra != null && (
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-surface-brown-light"
                    style={{ width: `${Math.min(100, Math.max(0, barra))}%` }}
                  />
                </div>
              )}
              {nota && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{nota}</p>}
            </div>
          </li>
        ))}
      </ul>

    </section>
  );
}
