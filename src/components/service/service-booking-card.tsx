"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CircleUser,
  CreditCard,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Receipt,
  Sparkles,
  Ticket,
  Timer,
  UserX,
  Users,
  UtensilsCrossed,
  Unlink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
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
  compatta = false,
}: {
  booking: ServiceBooking;
  timezone: string;
  currency: string;
  canManage: boolean;
  onChanged: () => void;
  /** Una riga sola: per chi è seduto e non chiede niente. */
  compatta?: boolean;
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

  const seduto = booking.status === "SEATED";
  const inChiusura = seduto && (booking.minutesToFree ?? 1) <= 0;
  // Una tavolata si legge per intero: «4 + 5», non «4».
  const tavolo = booking.tableLabel
    ? [booking.tableLabel, ...booking.tavoliUniti].join(" + ")
    : null;
  const previsione = booking.liberoVerso
    ? frasePrevisione(booking.liberoVerso, timezone)
    : null;

  /*
    Il tavolo è una pastiglia neutra con l'etichetta e basta («T12», non
    «Tavolo T12»): accanto alle persone si capisce da sé. Diventa oro pieno
    solo quando il tavolo è oltre l'ora di fine: è l'unico momento in cui il
    tavolo, e non la persona, è la notizia.
  */
  const capsulaTavolo = tavolo && (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center rounded-lg px-2 text-sm font-bold tabular-nums",
        inChiusura ? "tavolo-in-chiusura" : "segnale-pastiglia",
      )}
    >
      {tavolo}
    </span>
  );

  /*
    Il piede della scheda: le cose da sapere, la nota, la caparra, in una
    fascia color carta sotto un filo. Prima erano pastiglie grandi, poi un
    filo, poi la nota per esteso: tre grammatiche in fondo a ogni scheda, ed
    era quella la confusione. Adesso è una riga di testo a 14 px separata da
    puntini; l'icona resta solo dove porta un tono (l'attenzione, la cosa
    bella), perché colore **e** icona è la regola di `CosaSapere`.
  */
  const voci: { chiave: string; contenuto: React.ReactNode; titolo?: string }[] = [
    ...booking.daSapere.map((r) => ({
      chiave: `${r.tono}-${r.testo}`,
      titolo: r.fonte,
      contenuto:
        r.tono === "attenzione" ? (
          <span className="inline-flex items-center gap-1.5 text-accent-strong">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {r.testo}
          </span>
        ) : r.tono === "bello" ? (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" />
            {r.testo}
          </span>
        ) : (
          r.testo
        ),
    })),
    ...(booking.notes
      ? [
          {
            chiave: "nota",
            titolo: booking.notes,
            contenuto: (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{booking.notes}</span>
              </span>
            ),
          },
        ]
      : []),
    ...(booking.depositCents > 0
      ? [
          {
            chiave: "caparra",
            contenuto: (
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                Caparra {(booking.depositCents / 100).toFixed(0)} €
              </span>
            ),
          },
        ]
      : []),
  ];

  /** Il tempo: il ritardo, quando si libera, fra quanto arriva. */
  const tempo =
    booking.lateBy > 0 ? (
      <span className="font-semibold text-accent-strong">
        {durataUmana(booking.lateBy)} di ritardo
      </span>
    ) : previsione && booking.liberoVerso ? (
      <span
        className={cn(booking.liberoVerso.minuti <= 0 && "font-semibold text-accent-strong")}
        title={previsione.dettaglio}
      >
        {previsione.testo}
      </span>
    ) : !seduto && booking.minutesToArrival > 0 ? (
      <span>fra {booking.minutesToArrival} min</span>
    ) : null;

  const altre = secondarie.length > 0 && (
    <button
      type="button"
      onClick={() => setAzioniAperte((v) => !v)}
      aria-expanded={azioniAperte}
      aria-label={azioniAperte ? "Chiudi le azioni" : `Altre azioni per ${booking.guestName}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-current/10 hover:text-foreground"
    >
      {azioniAperte ? (
        <X className="h-4 w-4" aria-hidden="true" />
      ) : (
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );

  /*
    La riga compatta: chi è seduto e non chiede niente. Tavolo, nome, quanti
    e quando si libera, su una riga sola. Toccata, si apre come le altre.
  */
  const rigaCompatta = compatta && !azioniAperte;

  return (
    <article
      onClick={(e) => {
        if (!clicSullaCard(e) || secondarie.length === 0) return;
        setAzioniAperte((v) => !v);
      }}
      className={cn(
        "surface overflow-hidden border",
        rigaCompatta ? "rounded-xl" : "rounded-2xl",
        secondarie.length > 0 && "cursor-pointer",
        booking.lateBy > 0 ? "border-accent/60" : inChiusura ? "border-border-strong" : "border-border",
      )}
    >
      {rigaCompatta ? (
        <div className="flex min-h-12 items-center gap-3 py-1.5 pl-3.5 pr-1.5 text-[15px]">
          {capsulaTavolo || <span className="font-semibold tabular-nums">{ora}</span>}
          <span className="min-w-0 flex-1 truncate font-semibold">{booking.guestName}</span>
          <span className="shrink-0 tabular-nums text-foreground/75">
            {booking.partySize}
            {previsione && <> · {previsione.testo}</>}
          </span>
          {canManage && altre}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 pl-4 pr-2 pt-3.5">
            {/* Chi è seduto si cerca per tavolo, chi deve arrivare per ora. */}
            {seduto && capsulaTavolo ? (
              capsulaTavolo
            ) : (
              <span className={cn("text-lg font-bold tabular-nums", booking.lateBy > 0 && "text-accent-strong")}>
                {ora}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em]">
              {booking.guestName}
              {booking.isVip && (
                <span className="ml-2 align-[2px] text-[11px] font-bold tracking-[0.1em] text-accent-strong">VIP</span>
              )}
            </span>

            {canManage && (
              <div className="flex shrink-0 items-center gap-1">
                {/* Chiusa: l'azione di stasera per esteso. Aperta: solo la via
                    d'uscita, perché l'azione di stasera è la prima piastrella. */}
                {!azioniAperte && principale && (
                  <Button
                    size="sm"
                    // Un verde più chiaro della testata del passo: la capsula
                    // dice dove sei, il pulsante cosa fare.
                    className={cn("tocco-comodo", principale.chiave !== "done" && "azione-servizio")}
                    variant={principale.chiave === "done" ? "outline" : "accent"}
                    disabled={principale.disabilitato}
                    onClick={principale.onClick}
                  >
                    {busy !== null && busy === principale.chiave ? "…" : principale.corta}
                  </Button>
                )}
                {altre}
              </div>
            )}
          </div>

          {/* Aperte le azioni, i dettagli si tacciono: restano l'ora e il nome
              — che dicono *su chi* si sta per agire — e sotto i bersagli. */}
          {!azioniAperte && (
            <>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pb-3.5 pt-2 text-[15px] text-foreground/80">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {booking.partySize}
                  <span className="sr-only">{booking.partySize === 1 ? "persona" : "persone"}</span>
                </span>
                {!seduto &&
                  (capsulaTavolo || (
                    <span className="inline-flex h-[26px] items-center rounded-lg border border-dashed border-border px-2 text-sm text-muted-foreground">
                      senza tavolo
                    </span>
                  ))}
                {tempo}
              </div>

              {voci.length > 0 && (
                <div className="piede-scheda flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm font-medium">
                  {voci.map((v, i) => (
                    <Fragment key={v.chiave}>
                      {i > 0 && (
                        <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-30" aria-hidden="true" />
                      )}
                      <span className="min-w-0 max-w-full" title={v.titolo}>
                        {v.contenuto}
                      </span>
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {azioniAperte && (
        <div className="px-4 pb-4">
          <GrigliaAzioni azioni={azioni} />
        </div>
      )}

      {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}

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
