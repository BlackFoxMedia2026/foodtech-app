import Link from "next/link";
import { Cake, Clock, ShieldAlert, Star, Users } from "lucide-react";

/**
 * Il briefing prima del servizio.
 *
 * È la frase che un direttore dice alla brigata prima di aprire: quanti siamo,
 * quanto siamo pieni, chi va trattato con attenzione, e a che ora si stringe.
 *
 * Non aggiunge un dato: prende quelli che la Panoramica aveva già sparsi in
 * quattro riquadri e in una card di avvisi, e li mette in **una riga che si
 * legge in tre secondi**, che è il tempo che uno ha prima di aprire la porta.
 *
 * Due regole che lo tengono onesto:
 *
 * - **si mostra solo quello che c'è**. Nessun «0 compleanni»: un conteggio a
 *   zero non è un'informazione, è rumore che allontana quella vera;
 * - **il picco compare solo se è un picco davvero**. Se le persone arrivano
 *   distribuite, o se sono poche, la frase sparisce invece di inventare un
 *   momento critico.
 */
export function Briefing({
  prenotazioni,
  coperti,
  occupancyPct,
  vip,
  compleanni,
  allergie,
  daConfermare,
  picco,
}: {
  /**
   * Quante prenotazioni: era in una fascia a parte sotto questa frase, che
   * ripeteva coperti e occupazione già scritti qui. Duecentosessantasei
   * pixel per dire due numeri due volte.
   */
  prenotazioni: number;
  coperti: number;
  /** Nullo quando il locale non ha turni configurati: non lo sappiamo. */
  occupancyPct: number | null;
  vip: number;
  compleanni: number;
  allergie: number;
  daConfermare: number;
  picco: { ora: string; coperti: number } | null;
}) {
  if (coperti === 0) return null;

  const voci = [
    vip > 0 && { icona: Star, testo: `${vip} VIP`, href: "/service" },
    compleanni > 0 && {
      icona: Cake,
      testo: `${compleanni} ${compleanni === 1 ? "compleanno" : "compleanni"}`,
      href: "/bookings",
    },
    allergie > 0 && {
      icona: ShieldAlert,
      testo: `${allergie} ${allergie === 1 ? "allergia" : "allergie"}`,
      href: "/service",
      forte: true,
    },
    daConfermare > 0 && {
      icona: Clock,
      testo: `${daConfermare} da confermare`,
      href: "/bookings?status=pending",
    },
  ].filter((v): v is { icona: typeof Star; testo: string; href: string; forte?: boolean } => Boolean(v));

  return (
    <section className="riquadro bg-current/[0.04] p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Oggi, in breve</p>

      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg">
        <Users className="h-4 w-4 self-center text-muted-foreground" aria-hidden="true" />
        <span>
          <strong className="tabular-nums">{prenotazioni}</strong>{" "}
          {prenotazioni === 1 ? "prenotazione" : "prenotazioni"}
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          <strong className="tabular-nums">{coperti}</strong> coperti
        </span>
        {/* Senza turni configurati non sappiamo quanto sia pieno, e non lo
            diciamo: prima si divideva per una capienza di ripiego (90) e usciva
            una percentuale che non voleva dire niente. */}
        {occupancyPct != null && (
          <>
            <span className="text-muted-foreground">·</span>
            <span>
              <strong className="tabular-nums">{occupancyPct}%</strong> pieno
            </span>
          </>
        )}
        {picco && (
          <>
            <span className="text-muted-foreground">·</span>
            <span>
              alle <strong>{picco.ora}</strong> ne arrivano{" "}
              <strong className="tabular-nums">{picco.coperti}</strong> insieme
            </span>
          </>
        )}
      </p>

      {voci.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {voci.map(({ icona: Icona, testo, href, forte }) => (
            <li key={testo}>
              <Link
                href={href}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors ${
                  forte
                    ? "border-rose-300/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                    : "border-border hover:bg-current/5"
                }`}
              >
                <Icona className="h-3.5 w-3.5" aria-hidden="true" />
                {testo}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
