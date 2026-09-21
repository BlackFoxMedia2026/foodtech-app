"use client";

import Link from "next/link";
import { AlertTriangle, Phone, PhoneIncoming, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChiamataViva } from "@/server/chiamate";

/**
 * Il telefono squilla, e chi risponde sa già chi è.
 *
 * Questo riquadro esiste per tre secondi. Non è una scheda cliente — quella c'è
 * nel CRM, e chi ha il telefono in mano non ha il tempo di leggerla — ed è
 * costruito intorno a tre cose e mezza:
 *
 *  1. **il nome**, perché rispondere «buonasera signor Rossi» è il prodotto;
 *  2. **il blocco**, perché va saputo *prima* di dire «sì, a che ora?»;
 *  3. **le allergie e le mancate presentazioni**, perché sono le due cose che
 *     si chiedono in fondo alla telefonata quando si sapevano già dall'inizio.
 *
 * E mezza: la prenotazione che ha già, perché nove telefonate su dieci sono
 * «volevo spostare quella di sabato».
 *
 * ## Perché sta in cima e non di lato
 *
 * Perché dura venti secondi. Tutto il resto della schermata dura un servizio;
 * questo dura uno squillo, e in uno squillo non si cerca. Occupa una fascia
 * intera per il tempo della chiamata e poi sparisce, senza lasciare un buco:
 * quando non c'è nessuna chiamata il riquadro non esiste, non è vuoto.
 */

const NOME_STATO: Record<string, string> = {
  RINGING: "sta chiamando",
  ANSWERED: "al telefono",
};

function daQuanto(secondi: number): string {
  if (secondi < 60) return `${secondi}s`;
  const m = Math.floor(secondi / 60);
  return `${m}m ${secondi % 60}s`;
}

const ORA = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
});
const GIORNO = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function ChiamateInArrivo({ chiamate }: { chiamate: ChiamataViva[] }) {
  // Nessuna chiamata: il riquadro non c'è. Non è vuoto, non c'è.
  if (chiamate.length === 0) return null;

  return (
    /* `fissa` non è decorazione: la schermata del Servizio è una colonna
       flessibile alta esattamente il video («una schermata operativa si
       guarda, non si scorre»), e un figlio senza `shrink-0` viene **compresso
       a zero** quando lo spazio è tutto assegnato. Senza questa classe il
       riquadro esisteva nel DOM, con i dati giusti, e non si vedeva. */
    <div className="fissa mb-3 space-y-2">
      {chiamate.map((c) => (
        <Chiamata key={c.id} c={c} />
      ))}
    </div>
  );
}

function Chiamata({ c }: { c: ChiamataViva }) {
  const chi = c.chi;
  const bloccatoAltrove = c.altreSchede.some((s) => s.blocked);
  /* Il bordo si accende solo per il blocco. Un riquadro che squilla è già
     vistoso; se si accendesse anche per «è un VIP» o «ha un'allergia», il
     rosso smetterebbe di significare «fermati». */
  const allarme = Boolean(chi?.blocked || bloccatoAltrove);

  return (
    <section
      aria-live="polite"
      className={[
        "riquadro overflow-hidden p-0",
        allarme
          ? "border-destructive/60 bg-destructive/10"
          : "border-accent/50 bg-accent/10",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 p-3 md:p-4">
        {/* ── chi è ─────────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={[
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              allarme
                ? "bg-destructive/20 text-destructive-soft"
                : "bg-accent/20 text-accent-strong",
            ].join(" ")}
            aria-hidden="true"
          >
            {c.stato === "RINGING" ? (
              <PhoneIncoming className="h-4 w-4" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
          </span>

          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-display text-base leading-tight md:text-lg">
                {chi
                  ? `${chi.firstName}${chi.lastName ? ` ${chi.lastName}` : ""}`
                  : "Non riconosciuto"}
              </span>
              <span className="t-nota">
                {NOME_STATO[c.stato] ?? "in linea"} ·{" "}
                {daQuanto(c.daQuandoISecondi)}
              </span>
            </p>

            <p className="mt-0.5 t-nota tabular-nums">
              {c.telefono ?? "numero riservato"}
              {chi && chi.totalVisits > 0 && (
                <span className="ml-2">
                  {chi.totalVisits}{" "}
                  {chi.totalVisits === 1 ? "visita" : "visite"}
                </span>
              )}
            </p>

            {/* ── le cose per cui questo riquadro esiste ───────────────── */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {chi?.blocked && (
                <Badge tone="danger" className="gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Bloccato{chi.blockedReason ? `: ${chi.blockedReason}` : ""}
                </Badge>
              )}
              {/* Il blocco su un'altra scheda con lo stesso numero: la famiglia
                  col fisso, o il centralino di un'azienda. La scheda scelta può
                  essere pulita e il blocco stare sul marito. */}
              {!chi?.blocked && bloccatoAltrove && (
                <Badge tone="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Su questo numero c&apos;è una scheda bloccata
                </Badge>
              )}
              {chi && chi.noShowCount > 0 && (
                <Badge tone={chi.noShowCount >= 2 ? "warning" : "neutral"}>
                  {chi.noShowCount === 1
                    ? "1 volta non si è presentato"
                    : `${chi.noShowCount} volte non si è presentato`}
                </Badge>
              )}
              {chi?.allergies && (
                <Badge tone="warning" className="gap-1">
                  Allergie: {chi.allergies}
                </Badge>
              )}
              {chi?.loyaltyTier === "VIP" ||
              chi?.loyaltyTier === "AMBASSADOR" ? (
                <Badge tone="success">
                  {chi.loyaltyTier === "VIP" ? "VIP" : "Ambasciatore"}
                </Badge>
              ) : null}
              {c.altreSchede.length > 0 && (
                <Badge tone="neutral">
                  {c.altreSchede.length === 1
                    ? "un'altra scheda con questo numero"
                    : `altre ${c.altreSchede.length} schede con questo numero`}
                </Badge>
              )}
            </div>

            {/* La prenotazione che ha già: nove telefonate su dieci sono
                «volevo spostare quella di sabato». */}
            {c.prossimaPrenotazione && (
              <p className="mt-2 t-nota">
                Ha già una prenotazione:{" "}
                <strong className="text-foreground">
                  {GIORNO.format(new Date(c.prossimaPrenotazione.startsAt))}{" "}
                  alle {ORA.format(new Date(c.prossimaPrenotazione.startsAt))}
                </strong>{" "}
                · {c.prossimaPrenotazione.partySize}{" "}
                {c.prossimaPrenotazione.partySize === 1 ? "persona" : "persone"}
                {c.prossimaPrenotazione.tavolo
                  ? ` · tavolo ${c.prossimaPrenotazione.tavolo}`
                  : ""}
                {c.prossimaPrenotazione.notes
                  ? ` · ${c.prossimaPrenotazione.notes}`
                  : ""}
              </p>
            )}
          </div>
        </div>

        {/* ── cosa si può fare, mentre si parla ─────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {c.prossimaPrenotazione && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/bookings/${c.prossimaPrenotazione.id}`}>
                La prenotazione
              </Link>
            </Button>
          )}
          {chi && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/guests/${chi.id}`}>La scheda</Link>
            </Button>
          )}
          {/* Prenotare è l'azione per cui la gente telefona, quindi è l'unica
              in evidenza. Il numero viaggia nell'indirizzo: chi risponde non
              deve ridigitarlo mentre lo sta ascoltando. */}
          <Button asChild variant="accent" size="sm">
            <Link
              href={{
                pathname: "/bookings/new",
                query: {
                  ...(chi ? { guest: chi.id } : {}),
                  ...(c.telefono ? { phone: c.telefono } : {}),
                  source: "PHONE",
                },
              }}
            >
              <Users className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Prenota
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
