"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, Check, MapPin, Phone, StickyNote, Star, Timer, UtensilsCrossed, X } from "lucide-react";
import { readApiError } from "@/lib/api-client";
import { SeatFromWaitlistDialog } from "@/components/waitlist/seat-from-waitlist-dialog";
import { cn } from "@/lib/utils";
import { durataUmana } from "@/lib/durata";

export type WaitlistRowEntry = {
  id: string;
  guestName: string;
  phone: string | null;
  partySize: number;
  status: string;
  notes: string | null;
  waitingMin: number;
  overdue: boolean;
  /** Di quanto abbiamo sforato la promessa: è il numero che dà la precedenza. */
  ritardoSullaPromessa: number;
  expectedWaitMin: number;
  desiredAt: string | null;
  offerExpiresAt: string | null;
  isVip: boolean;
  allergies: string | null;
  preferredRoomName: string | null;
  /**
   * Vero quando la precedenza sul primo tavolo che si libera è sua, e **non**
   * è già la prima della fila: si segnala solo quando l'ordine di arrivo e la
   * precedenza non coincidono.
   */
  tocca: boolean;
};

/*
  Lo stato è una pillola come quelle del riquadro Prenotazioni: pallino +
  parola, il colore non lavora mai da solo. Grigio chi aspetta, oro chi è
  stato avvisato (ha un tavolo tenuto che scade), verde chi sta arrivando.
*/
const STATO: Record<string, { testo: string; tono: string }> = {
  WAITING: { testo: "In attesa", tono: "neutro" },
  NOTIFIED: { testo: "Avvisato", tono: "da-confermare" },
  CONFIRMED: { testo: "Sta arrivando", tono: "gia-confermata" },
};

export function WaitlistRow({
  entry,
  suggerito,
  position,
  canManage,
  onChanged,
}: {
  entry: WaitlistRowEntry;
  /**
   * Il tavolo che potrebbe accoglierlo adesso — il più piccolo che basta, e
   * proposto a una persona sola. Assente quando non ce n'è nessuno: la riga
   * non scrive «nessun tavolo», perché l'assenza si vede già.
   */
  suggerito?: { tableId: string; label: string; seats: number };
  position: number;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seatOpen, setSeatOpen] = useState(false);

  async function azione(nome: string, url: string, body?: unknown) {
    setBusy(nome);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a completare l'operazione. Riprova."));
      return;
    }
    onChanged();
  }

  const stato = STATO[entry.status] ?? { testo: entry.status, tono: "neutro" };

  /*
    La riga ha la forma delle schede «Nuova prenotazione» della Panoramica
    (3 novembre 2026): chi e quanti in grande a sinistra, i gesti grandi a
    destra. Prima il nome era in corpo 14, il tempo d'attesa in 12 e i gesti
    erano pulsanti piccoli: si leggeva da vicino, mentre questa schermata si
    guarda dal banco con una persona davanti.
  */
  return (
    <li className="vi-notifica vetro-ios-scheda" data-ritardo={entry.overdue || undefined}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span
            className="posto-ios"
            data-tocca={entry.tocca || undefined}
            aria-label={`Posizione ${position}`}
          >
            {position}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <p className="vi-nome min-w-0 !text-[21px]">{entry.guestName}</p>
              <span className="pillola-ios" data-tono={stato.tono}>
                {stato.testo}
              </span>
              {/*
                «Tocca a lei» compare solo quando la precedenza non coincide
                con l'ordine di arrivo: è la decisione del motore detta in due
                parole, con accanto il perché — quanto abbiamo sforato la
                promessa — nella riga sotto.
              */}
              {entry.tocca && (
                <span className="pillola-ios" data-tono="gia-confermata">
                  Tocca a lei
                </span>
              )}
              {entry.isVip && (
                <span className="pillola-ios" data-tono="da-confermare">
                  <Star className="-ml-1 h-3.5 w-3.5" aria-hidden="true" /> VIP
                </span>
              )}
            </div>

            <p className="vi-dettaglio mt-1">
              <strong>{entry.partySize}</strong> {entry.partySize === 1 ? "persona" : "persone"}
              {" · "}
              {/*
                In ore, non in minuti: «in attesa da 937 min» era esatto e
                illeggibile, e nessuno converte a mente mentre ha una persona
                davanti.
              */}
              <span className={cn(entry.overdue && "font-semibold text-[#7d5510]")}>
                <Timer className="mb-0.5 mr-1 inline h-4 w-4" aria-hidden="true" />
                {entry.waitingMin === 0 ? (
                  "appena entrato"
                ) : (
                  <>
                    in attesa da <strong className={cn(entry.overdue && "!text-[#7d5510]")}>{durataUmana(entry.waitingMin)}</strong>
                  </>
                )}
                {/*
                  Non «oltre la stima di venti minuti» ma «quindici minuti oltre
                  la stima»: il numero che serve è di quanto abbiamo sforato. È
                  lo stesso che decide la precedenza (`confrontaPerPrecedenza`).
                */}
                {entry.overdue &&
                  entry.ritardoSullaPromessa > 0 &&
                  ` · ${durataUmana(entry.ritardoSullaPromessa)} oltre la stima`}
              </span>
            </p>

            {/* Le informazioni che servono a decidere, in capsule leggibili
                invece che in righe da 12 px una sotto l'altra. */}
            <div className="mt-2.5 flex flex-wrap gap-2">
              {entry.phone && (
                <a href={`tel:${entry.phone.replace(/\s+/g, "")}`} className="chip-ios hover:underline">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {entry.phone}
                </a>
              )}
              {entry.status === "NOTIFIED" && entry.offerExpiresAt && (
                <span className="chip-ios" data-tono="oro">
                  <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                  Tavolo tenuto fino alle <strong>{ora(entry.offerExpiresAt)}</strong>
                </span>
              )}
              {/*
                Il tavolo da proporre, **nella riga**. È un suggerimento, non
                una promessa: premendo «Accomoda» la verifica si rifà, e se il
                tavolo è stato preso nel frattempo lo dice. Per questo
                «potrebbe stare», non «è suo».
              */}
              {suggerito && (
                <span className="chip-ios" data-tono="verde">
                  <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden="true" />
                  Potrebbe stare al <strong>{suggerito.label}</strong> · {suggerito.seats}{" "}
                  {suggerito.seats === 1 ? "posto" : "posti"}
                </span>
              )}
              {entry.preferredRoomName && (
                <span className="chip-ios">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {entry.preferredRoomName}
                </span>
              )}
              {entry.allergies && (
                <span className="chip-ios" data-tono="oro">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {entry.allergies}
                </span>
              )}
              {entry.notes && (
                <span className="chip-ios">
                  <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                  {entry.notes}
                </span>
              )}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 sm:gap-2.5 sm:pl-[60px] lg:shrink-0 lg:justify-end lg:pl-0">
            {entry.status === "WAITING" && (
              <button
                type="button"
                className="azione-ios azione-ios-vetro flex-1 sm:flex-none"
                disabled={busy !== null}
                aria-label={`Avvisa ${entry.guestName}`}
                onClick={() => azione("notify", `/api/waitlist/${entry.id}/notify`, { via: "manuale" })}
              >
                <BellRing className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
                {busy === "notify" ? "Avviso…" : "Avvisa"}
              </button>
            )}

            {entry.status === "NOTIFIED" && (
              <button
                type="button"
                className="azione-ios azione-ios-vetro flex-1 sm:flex-none"
                disabled={busy !== null}
                aria-label={`${entry.guestName} ha confermato`}
                onClick={() => azione("confirm", `/api/waitlist/${entry.id}/confirm`)}
              >
                <Check className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
                {busy === "confirm" ? "Salvo…" : "Ha confermato"}
              </button>
            )}

            {/*
              Il pulsante nomina il tavolo quando ce n'è uno da proporre: chi
              lo preme sa dove sta mandando la persona. La finestra si apre
              comunque, **con quello già scelto**. Il nome accessibile porta
              **chi**, non solo il verbo: dieci «Accomoda» identici non si
              distinguono a voce.
            */}
            <button
              type="button"
              className="azione-ios azione-ios-pieno flex-1 sm:flex-none"
              disabled={busy !== null}
              aria-label={`Accomoda ${entry.guestName}${suggerito ? ` al tavolo ${suggerito.label}` : ""}`}
              onClick={() => setSeatOpen(true)}
            >
              <UtensilsCrossed className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
              {suggerito ? `Accomoda al ${suggerito.label}` : "Accomoda"}
            </button>

            <button
              type="button"
              className="azione-ios azione-ios-tonda azione-ios-vetro"
              disabled={busy !== null}
              aria-label={`Togli ${entry.guestName} dalla lista`}
              title="Togli dalla lista"
              onClick={() => azione("close", `/api/waitlist/${entry.id}/close`, { status: "LEFT" })}
            >
              <X className="h-5 w-5" style={{ color: "var(--vi-rosso)" }} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {seatOpen && (
        <SeatFromWaitlistDialog
          entryId={entry.id}
          guestName={entry.guestName}
          partySize={entry.partySize}
          open={seatOpen}
          onOpenChange={setSeatOpen}
          onSeated={onChanged}
        />
      )}
    </li>
  );
}

function ora(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
