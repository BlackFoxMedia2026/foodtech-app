import { CalendarRange, Gauge, Users, Wallet } from "lucide-react";
import { riepilogoIncasso, type IncassoDelGiorno } from "@/components/overview/incasso";
import { FasciaTessere, TesseraKpi } from "@/components/ui/tessera-kpi";

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
  mostraIncasso = true,
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
  /**
   * Se mostrare il blocco dei soldi.
   *
   * Falso per i ruoli senza `view_revenue`. Il permesso esisteva da settimane
   * e diceva di no — semplicemente questa fascia non glielo aveva mai
   * chiesto, e un account di sala leggeva l'incasso del locale nella prima
   * riga della prima schermata. Gli altri tre blocchi restano: prenotazioni,
   * coperti e pienezza sono il lavoro, non i conti.
   */
  mostraIncasso?: boolean;
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

  if (mostraIncasso) {
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
  }

  // La tessera è quella comune (`ui/tessera-kpi.tsx`): nata qui, ora è la
  // stessa in lista d'attesa, Report, Pagamenti e Coupon.
  return (
    <FasciaTessere colonne={Math.max(2, Math.min(4, blocchi.length)) as 2 | 3 | 4}>
      {blocchi.map(({ chiave, icona, etichetta, corta, valore, barra, nota }, i) => (
        <TesseraKpi
          key={chiave}
          icona={icona}
          etichetta={etichetta}
          corta={corta}
          valore={valore}
          barra={barra}
          nota={nota}
          ultimaDispari={blocchi.length % 2 === 1 && i === blocchi.length - 1}
        />
      ))}
    </FasciaTessere>
  );
}
