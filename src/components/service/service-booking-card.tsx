"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Check,
  CircleUser,
  CreditCard,
  Phone,
  Receipt,
  Ticket,
  Timer,
  UserX,
  UtensilsCrossed,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { CosaSapere } from "@/components/guests/cosa-sapere";
import { durataUmana } from "@/lib/durata";
import { frasePrevisione } from "@/lib/liberazione";
import { cn } from "@/lib/utils";
import type { ServiceBooking } from "@/server/service";
import { TablePickerDialog } from "@/components/service/table-picker-dialog";
import { RedeemCouponDialog } from "@/components/coupons/redeem-dialog";
import { BillDialog } from "@/components/orders/bill-dialog";
import { useAvvisi } from "@/components/ui/avvisi";

/**
 * Una riga della modalità Servizio.
 *
 * I pulsanti cambiano con lo stato, e sono pochi di proposito: chi accoglie
 * non sceglie fra otto azioni, fa **la** cosa che va fatta adesso. Chi deve
 * arrivare si segna arrivato; chi è arrivato si accomoda; chi è seduto si
 * chiude. Il resto — cambiare tavolo, chiamare, aprire la scheda — sta a
 * fianco, più piccolo.
 */
export function ServiceBookingCard({
  booking,
  timezone,
  currency,
  canManage,
  onChanged,
}: {
  booking: ServiceBooking;
  timezone: string;
  currency: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contoAperto, setContoAperto] = useState(false);
  const [couponAperto, setCouponAperto] = useState(false);
  const [pickerFor, setPickerFor] = useState<"seat" | "move" | null>(null);
  const avvisi = useAvvisi();

  /*
    Il nome nell'avviso dice cosa è cambiato meglio di «Fatto», e su un tablet
    dove passano dieci schede è l'unico modo di sapere quale gesto si sta
    annullando.
    
    Le frasi sono costruite **senza participi che concordino col nome**: la
    prima versione diceva «Alessia Costa segnato come arrivato», perché il
    genere di una persona da un nome non si indovina — e indovinarlo male è
    peggio che non provarci. Quindi il participio sta sul fatto, non sulla
    persona: «Arrivo segnato per Alessia Costa».
  */
  const chiSi = booking.guestName;

  const ora = new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(booking.startsAt));

  /**
   * Cambia lo stato, e offre di tornare indietro.
   *
   * Prima l'azione era **silenziosa**: si premeva «Arrivato» e non succedeva
   * niente di visibile finché la lista non si riordinava. In sala, con il
   * telefono che squilla, quel silenzio si risolve premendo di nuovo.
   *
   * Adesso l'avviso dice cosa è successo e per sette secondi si può annullare.
   * È più veloce di una conferma preventiva e più sicuro del silenzio, perché
   * la protezione sta **dopo** l'errore invece di stare prima di ogni gesto
   * giusto — e questi gesti si fanno cinquanta volte a sera.
   *
   * L'annulla è onesto perché da oggi lo è il server: riportare lo stato
   * indietro **cancella** gli orari che non valgono più. Prima restavano
   * appesi, e un «seduto» annullato lasciava l'ora dell'accomodamento nelle
   * statistiche della durata misurata.
   */
  async function cambiaStato(nome: string, status: string, dettaglio?: string) {
    const precedente = booking.status;
    setBusy(nome);
    setError(null);
    const res = await fetch(`/api/bookings/${booking.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad aggiornare. Riprova."));
      return;
    }
    onChanged();

    if (dettaglio) {
      avvisi.mostra(dettaglio, async () => {
        const indietro = await fetch(`/api/bookings/${booking.id}/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: precedente }),
        });
        if (!indietro.ok) {
          avvisi.problema("Non siamo riusciti ad annullare: lo stato è rimasto quello nuovo.");
          return;
        }
        onChanged();
      });
    }
  }

  /** Scioglie la tavolata: resta il tavolo principale, gli altri si liberano. */
  async function dividi() {
    setBusy("split");
    setError(null);
    const res = await fetch(`/api/bookings/${booking.id}/split-tables`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a dividere la tavolata. Riprova."));
      return;
    }
    onChanged();
  }

  /** Accomodare richiede un tavolo: se non ce n'è uno, prima si scegli. */
  async function accomoda() {
    if (!booking.tableId) {
      setPickerFor("seat");
      return;
    }
    await cambiaStato("seat", "SEATED", `${chiSi} è a tavola`);
  }

  return (
    <article
      className={cn(
        "surface rounded-md border p-3",
        booking.lateBy > 0
          ? "border-accent/60"
          : booking.status === "SEATED" && (booking.minutesToFree ?? 1) <= 0
            ? "border-border-strong"
            : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Sans e tabellare: l'ora è il dato che si confronta con
                l'orologio, non un titolo. */}
            <span className="text-base font-semibold tabular-nums">{ora}</span>
            <span className="truncate font-medium">{booking.guestName}</span>
            {booking.isVip && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px]">VIP</span>
            )}
            {booking.tableLabel ? (
              <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px]">
                {/* Una tavolata si legge per intero: «4 + 5», non «4». */}
                {[booking.tableLabel, ...booking.tavoliUniti].join(" + ")}
              </span>
            ) : (
              <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-tertiary-foreground">
                senza tavolo
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {booking.partySize} {booking.partySize === 1 ? "persona" : "persone"}
            {booking.liberoVerso && (
              <>
                {" · "}
                <span
                  className={cn(booking.liberoVerso.minuti <= 0 && "text-accent")}
                  title={frasePrevisione(booking.liberoVerso, timezone).dettaglio}
                >
                  {frasePrevisione(booking.liberoVerso, timezone).testo}
                </span>
              </>
            )}
            {booking.lateBy > 0 && (
              <>
                {" · "}
                <span className="text-accent">in ritardo di {durataUmana(booking.lateBy)}</span>
              </>
            )}
            {booking.status !== "SEATED" &&
              booking.lateBy === 0 &&
              booking.minutesToArrival > 0 && <> · fra {booking.minutesToArrival} min</>}
          </p>

          {/*
            Allergie e occasione stavano qui come due pillole fra le altre.
            Adesso sono le prime due righe di «cosa sapere», che è lo stesso
            elenco che si legge in Sala: una persona deve leggersi uguale in
            tutte le schermate, o la seconda volta non la si guarda.
          */}
          <CosaSapere righe={booking.daSapere} className="mt-1.5" />

          {(booking.notes || booking.depositCents > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {booking.depositCents > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CreditCard className="h-3 w-3" aria-hidden="true" />
                  caparra {(booking.depositCents / 100).toFixed(0)} €
                </span>
              )}
              {booking.notes && <span className="text-tertiary-foreground">{booking.notes}</span>}
            </div>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {(booking.status === "CONFIRMED" || booking.status === "PENDING") && (
              <>
                <Button
                  size="sm" className="tocco-comodo"
                  variant="accent"
                  disabled={busy !== null}
                  onClick={() => cambiaStato("arrived", "ARRIVED", `Arrivo segnato per ${chiSi}`)}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {busy === "arrived" ? "…" : "Arrivato"}
                </Button>
                {booking.lateBy > 0 && (
                  <Button
                    size="sm" className="tocco-comodo"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => cambiaStato("noshow", "NO_SHOW", `Assenza segnata per ${chiSi}`)}
                  >
                    <UserX className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {busy === "noshow" ? "…" : "No-show"}
                  </Button>
                )}
              </>
            )}

            {booking.status === "ARRIVED" && (
              <Button size="sm" className="tocco-comodo" variant="accent" disabled={busy !== null} onClick={accomoda}>
                <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "seat" ? "…" : "Accomoda"}
              </Button>
            )}

            {booking.status === "SEATED" && (
              <Button
                size="sm" className="tocco-comodo"
                variant="outline"
                disabled={busy !== null}
                onClick={() => cambiaStato("done", "COMPLETED", `Tavolo di ${chiSi} liberato`)}
              >
                <Timer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "done" ? "…" : "Libera tavolo"}
              </Button>
            )}

            <div className="flex items-center gap-0.5">
              {booking.tavoliUniti.length > 0 && booking.status !== "COMPLETED" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void dividi()}
                  aria-label="Dividi la tavolata"
                  title="Dividi la tavolata: resta il primo tavolo, gli altri tornano liberi"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {booking.tableId && booking.status !== "COMPLETED" && (
                <button
                  type="button"
                  onClick={() => setPickerFor("move")}
                  aria-label="Cambia tavolo"
                  title="Cambia tavolo"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {canManage && (booking.status === "SEATED" || booking.status === "ARRIVED") && (
                <button
                  type="button"
                  onClick={() => setContoAperto(true)}
                  aria-label={`Apri il conto di ${booking.guestName}`}
                  title="Conto del tavolo"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {canManage && booking.status !== "COMPLETED" && (
                <button
                  type="button"
                  onClick={() => setCouponAperto(true)}
                  aria-label={`Usa un coupon per ${booking.guestName}`}
                  title="Usa un coupon"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {booking.phone && (
                <a
                  href={`tel:${booking.phone}`}
                  aria-label={`Chiama ${booking.guestName}`}
                  title="Chiama"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
              {booking.guestId && (
                <Link
                  href={`/guests/${booking.guestId}`}
                  aria-label={`Apri la scheda di ${booking.guestName}`}
                  title="Apri scheda ospite"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <CircleUser className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {contoAperto && (
        <BillDialog
          open
          onOpenChange={setContoAperto}
          bookingId={booking.id}
          guestName={booking.guestName}
          currency={currency}
          onChanged={onChanged}
        />
      )}

      {couponAperto && (
        <RedeemCouponDialog
          open
          onOpenChange={setCouponAperto}
          bookingId={booking.id}
          guestId={booking.guestId}
          guestName={booking.guestName}
          onDone={onChanged}
        />
      )}

      {pickerFor && (
        <TablePickerDialog
          open
          onOpenChange={(v) => !v && setPickerFor(null)}
          bookingId={booking.id}
          partySize={booking.partySize}
          startsAt={booking.startsAt}
          titolo={pickerFor === "seat" ? `Accomoda ${booking.guestName}` : `Sposta ${booking.guestName}`}
          /** Accomodando, dopo l'assegnazione si segna anche seduto. */
          seatAfter={pickerFor === "seat"}
          onDone={() => {
            setPickerFor(null);
            onChanged();
          }}
        />
      )}
    </article>
  );
}
