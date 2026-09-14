"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Check,
  CircleUser,
  CreditCard,
  MoreHorizontal,
  Phone,
  Receipt,
  Ticket,
  Timer,
  UserX,
  UtensilsCrossed,
  Unlink,
  X,
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
import { clicSullaCard, GrigliaAzioni, type AzioneCard } from "@/components/service/azioni-card";

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
  const [azioniAperte, setAzioniAperte] = useState(false);
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

  /**
   * Tutto quello che si può fare con questa prenotazione, in un elenco solo.
   *
   * Prima erano due grammatiche diverse sulla stessa card: una o due pillole
   * per le azioni di stato, e una fila di tondini da 36 px senza etichetta per
   * tutto il resto. Le seconde si sbagliavano — due pixel di distanza, sei
   * glifi grigi uguali — e si dimenticavano, perché non c'era scritto cosa
   * fossero.
   *
   * Adesso sono una lista sola, e la differenza fra «quella che fai stasera
   * cinquanta volte» e «quella che fai due volte» la porta `principale`: la
   * prima resta anche sulla card chiusa, le altre si aprono toccando la card.
   */
  const azioni: AzioneCard[] = [];
  if (canManage) {
    if (booking.status === "CONFIRMED" || booking.status === "PENDING") {
      azioni.push({
        chiave: "arrived",
        etichetta: "Segna come arrivato",
        corta: "Arrivato",
        icona: Check,
        principale: true,
        disabilitato: busy !== null,
        onClick: () => {
          setAzioniAperte(false);
          cambiaStato("arrived", "ARRIVED", `Arrivo segnato per ${chiSi}`);
        },
      });
      if (booking.lateBy > 0) {
        azioni.push({
          chiave: "noshow",
          etichetta: "Segna come no-show",
          corta: "No-show",
          icona: UserX,
          disabilitato: busy !== null,
          onClick: () => {
            setAzioniAperte(false);
            cambiaStato("noshow", "NO_SHOW", `Assenza segnata per ${chiSi}`);
          },
        });
      }
    }

    if (booking.status === "ARRIVED") {
      azioni.push({
        chiave: "seat",
        etichetta: "Accomoda al tavolo",
        corta: "Accomoda",
        icona: UtensilsCrossed,
        principale: true,
        disabilitato: busy !== null,
        onClick: () => {
          setAzioniAperte(false);
          accomoda();
        },
      });
    }

    if (booking.status === "SEATED") {
      azioni.push({
        chiave: "done",
        etichetta: "Libera il tavolo",
        corta: "Libera",
        icona: Timer,
        principale: true,
        disabilitato: busy !== null,
        onClick: () => {
          setAzioniAperte(false);
          cambiaStato("done", "COMPLETED", `Tavolo di ${chiSi} liberato`);
        },
      });
    }

    if (booking.tavoliUniti.length > 0 && booking.status !== "COMPLETED") {
      azioni.push({
        chiave: "split",
        etichetta: "Dividi la tavolata: resta il primo tavolo, gli altri tornano liberi",
        corta: "Dividi",
        icona: Unlink,
        disabilitato: busy !== null,
        onClick: () => {
          setAzioniAperte(false);
          void dividi();
        },
      });
    }

    if (booking.tableId && booking.status !== "COMPLETED") {
      azioni.push({
        chiave: "move",
        etichetta: "Cambia tavolo",
        corta: "Tavolo",
        icona: ArrowLeftRight,
        onClick: () => {
          setAzioniAperte(false);
          setPickerFor("move");
        },
      });
    }

    if (booking.status === "SEATED" || booking.status === "ARRIVED") {
      azioni.push({
        chiave: "conto",
        etichetta: `Apri il conto di ${booking.guestName}`,
        corta: "Conto",
        icona: Receipt,
        onClick: () => {
          setAzioniAperte(false);
          setContoAperto(true);
        },
      });
    }

    if (booking.status !== "COMPLETED") {
      azioni.push({
        chiave: "coupon",
        etichetta: `Usa un coupon per ${booking.guestName}`,
        corta: "Coupon",
        icona: Ticket,
        onClick: () => {
          setAzioniAperte(false);
          setCouponAperto(true);
        },
      });
    }

    if (booking.phone) {
      azioni.push({
        chiave: "tel",
        etichetta: `Chiama ${booking.guestName}`,
        corta: "Chiama",
        icona: Phone,
        href: `tel:${booking.phone}`,
      });
    }

    if (booking.guestId) {
      azioni.push({
        chiave: "scheda",
        etichetta: `Apri la scheda di ${booking.guestName}`,
        corta: "Scheda",
        icona: CircleUser,
        href: `/guests/${booking.guestId}`,
      });
    }
  }

  const principale = azioni.find((a) => a.principale);
  const secondarie = azioni.filter((a) => !a.principale);

  return (
    <article
      onClick={(e) => {
        if (!clicSullaCard(e) || secondarie.length === 0) return;
        setAzioniAperte((v) => !v);
      }}
      className={cn(
        "surface rounded-md border p-3",
        secondarie.length > 0 && "cursor-pointer",
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

          {/* Aperte le azioni, i dettagli si tacciono: restano l'ora e il nome
              — che dicono *su chi* si sta per agire — e sotto ci sono i
              bersagli. Tenere tutto vorrebbe dire una card alta il doppio, e
              chi ha appena toccato la card sta guardando i pulsanti. */}
          {!azioniAperte && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {booking.partySize} {booking.partySize === 1 ? "persona" : "persone"}
                {booking.liberoVerso && (
                  <>
                    {" · "}
                    <span
                      className={cn(booking.liberoVerso.minuti <= 0 && "text-accent-strong")}
                      title={frasePrevisione(booking.liberoVerso, timezone).dettaglio}
                    >
                      {frasePrevisione(booking.liberoVerso, timezone).testo}
                    </span>
                  </>
                )}
                {booking.lateBy > 0 && (
                  <>
                    {" · "}
                    <span className="text-accent-strong">in ritardo di {durataUmana(booking.lateBy)}</span>
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
            </>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Chiusa: l'azione di stasera per esteso. Aperta: solo la via
                d'uscita, perché l'azione di stasera è la prima piastrella. */}
            {!azioniAperte && principale && (
              <Button
                size="sm"
                className="tocco-comodo"
                variant={principale.chiave === "done" ? "outline" : "accent"}
                disabled={principale.disabilitato}
                onClick={principale.onClick}
              >
                <principale.icona className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy !== null && busy === principale.chiave ? "…" : principale.corta}
              </Button>
            )}

            {secondarie.length > 0 && (
              <button
                type="button"
                onClick={() => setAzioniAperte((v) => !v)}
                aria-expanded={azioniAperte}
                aria-label={azioniAperte ? "Chiudi le azioni" : `Altre azioni per ${booking.guestName}`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-current/10 hover:text-foreground"
              >
                {azioniAperte ? (
                  <X className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {azioniAperte && <GrigliaAzioni azioni={azioni} />}

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
