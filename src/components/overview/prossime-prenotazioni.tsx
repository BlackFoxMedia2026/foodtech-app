import Link from "next/link";
import { CalendarRange, ChevronRight } from "lucide-react";
import type { Booking, Guest, Table } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FINESTRA, VISIBILI } from "@/components/overview/finestra";
import { Binario, Rotazione } from "@/components/overview/rotazione";
import { NON_PIU_RITARDO_MIN } from "@/lib/durata";
import { cn, formatTime } from "@/lib/utils";

type Row = Booking & { guest: Guest | null; table: Table | null };

type Tone = "positive" | "warn" | "negative" | "neutral";

/** Le prenotazioni che hanno già un esito: non sono più da gestire. */
const RISOLTE = new Set(["COMPLETED", "NO_SHOW"]);

function getStatusDisplay(booking: Row, now: Date): { label: string; tone: Tone } {
  const minutesUntil = Math.round((booking.startsAt.getTime() - now.getTime()) / 60000);

  switch (booking.status) {
    case "SEATED":
      return { label: "Seduti", tone: "positive" };
    case "COMPLETED":
      return { label: "Completata", tone: "neutral" };
    case "NO_SHOW":
      return { label: "No-show", tone: "negative" };
    case "ARRIVED":
      return { label: "In attesa", tone: "warn" };
    case "PENDING":
      return { label: "Da confermare", tone: "warn" };
    case "CONFIRMED":
      // Oltre tre ore non è più un ritardo: è una prenotazione a cui nessuno
      // ha dato un esito. Chiamarla «in ritardo» a fine giornata riempiva la
      // lista di rosso su gente che non sarebbe più arrivata.
      if (minutesUntil <= -NON_PIU_RITARDO_MIN) return { label: "Non arrivata", tone: "neutral" };
      if (minutesUntil <= 0) return { label: "In ritardo", tone: "negative" };
      if (minutesUntil <= 60) return { label: `Arrivo tra ${minutesUntil} min`, tone: "warn" };
      return { label: "Confermato", tone: "positive" };
    default:
      return { label: booking.status, tone: "neutral" };
  }
}

const DOT_TONE: Record<Tone, string> = {
  positive: "bg-sage",
  warn: "bg-card-foreground",
  negative: "bg-destructive",
  neutral: "bg-card-foreground/40",
};

const TEXT_TONE: Record<Tone, string> = {
  positive: "text-sage-strong",
  warn: "text-card-foreground",
  negative: "text-destructive-soft",
  neutral: "text-card-foreground/65",
};

/**
 * Le prossime prenotazioni, come linea temporale che scorre.
 *
 * Prima era **tutta** la giornata in una lista alta quanto la schermata: a
 * metà servizio la maggior parte di quelle righe diceva «Completata», cioè il
 * posto migliore della pagina raccontava cose già finite. Qui c'è una finestra
 * su tre righe — la precedente, quella adesso, la successiva — che scorre
 * lungo il binario; per tutte le altre c'è «Calendario», che è sempre stato il
 * modo di vederle tutte.
 *
 * Quali, e perché non le prime della giornata:
 *
 * - fuori quelle con un esito (`COMPLETED`, `NO_SHOW`) — le annullate non
 *   arrivano nemmeno qui, le esclude la query;
 * - fuori anche quelle rimaste senza esito da più di `NON_PIU_RITARDO_MIN`: se
 *   nessuno le ha chiuse stamattina non sono «le prossime», e resterebbero
 *   incollate al centro per tutta la sera;
 * - se non ne resta nessuna — servizio finito — mostra le ultime della
 *   giornata invece di lasciare la card vuota.
 *
 * Con tre prenotazioni o meno **non scorre**: ci stanno tutte nella finestra,
 * e le mostra ferme sullo stesso binario. Muovere una lista che si vede già
 * per intero è solo un'animazione.
 */
export function ProssimePrenotazioni({
  bookings,
  picco,
}: {
  /** Le prenotazioni di oggi, già ordinate per orario. */
  bookings: Row[];
  /**
   * Il momento più affollato della giornata, quando c'è.
   *
   * Sta qui e non in cima alla pagina: «alle 22:00 ne arrivano 16 insieme» è
   * una cosa sulle prenotazioni, e nel briefing era una frase staccata da
   * quelle di cui parlava.
   */
  picco?: { ora: string; coperti: number } | null;
}) {
  const now = new Date();
  const daGestire = bookings.filter(
    (b) => !RISOLTE.has(b.status) && b.startsAt.getTime() > now.getTime() - NON_PIU_RITARDO_MIN * 60_000,
  );
  // Con qualcosa da gestire si guarda avanti; a servizio finito si mostra la
  // coda della giornata — e le due cose non si chiamano allo stesso modo, che
  // era il secondo difetto: la card diceva «Le prossime» su prenotazioni già
  // passate.
  const guardaAvanti = daGestire.length > 0;
  const scelte = (guardaAvanti ? daGestire : bookings.slice(-FINESTRA)).slice(0, FINESTRA);

  const righe = scelte.map((b) => {
    const nome = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
    const stato = getStatusDisplay(b, now);
    return (
      /*
        L'anatomia della riga è quella della vecchia lista — ora, pallino,
        contenuto — ma il contenuto è una card che si alza dal pozzo. Le
        larghezze qui (`w-14` e `gap-3`) sono quelle su cui è calcolata la
        posizione del binario: cambiarle vuol dire aggiornare `Binario`.

        `py-1` è lo stacco fra una riga e l'altra: sta dentro lo scalino,
        così l'altezza dello scalino resta una sola misura.
      */
      <div key={b.id} className="flex h-full items-center gap-3 py-1">
        <p className="w-14 shrink-0 text-right font-mono text-sm font-medium text-card-foreground">
          {formatTime(b.startsAt)}
        </p>
        <span
          className={cn("relative z-10 h-2.5 w-2.5 shrink-0 rounded-full", DOT_TONE[stato.tone])}
          aria-hidden="true"
        />
        <Card className="card-notch h-full min-w-0 flex-1 overflow-hidden">
          <Link
            href={`/bookings/${b.id}`}
            className="flex h-full items-center gap-3 rounded-[inherit] p-3 transition-colors hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-card-foreground">{nome}</p>
              {/* Questa riga va a capo: dice «Tavolo da assegnare», cioè la
                  cosa su cui si agisce, e tagliata sul telefono ne perdeva la
                  fine. È lei che rende lo scalino più alto sul telefono. */}
              <p className="text-xs text-card-foreground/65">
                {b.partySize} {b.partySize === 1 ? "persona" : "persone"} ·{" "}
                {b.table ? `Tavolo ${b.table.label}` : "Tavolo da assegnare"}
              </p>
            </div>

            {/* Sul telefono la parola dello stato prendeva un terzo della riga
                e il nome dell'ospite finiva a undici caratteri: «Alessia
                Co…». Il pallino lo stato lo dice già. */}
            <span className={cn("hidden shrink-0 text-right text-xs font-medium sm:inline", TEXT_TONE[stato.tone])}>
              {stato.label}
            </span>
            <span className="sr-only">{stato.label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-card-foreground/65" />
          </Link>
        </Card>
      </div>
    );
  });

  return (
    <Card className="card-notch recessed md:flex md:min-h-0 md:flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-3 py-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Prenotazioni di oggi</CardTitle>
          <CardDescription>
            {/* «Le prossime 0 di 11» era quello che si leggeva quando la lista
                usciva vuota per il difetto qui sopra: una frase che non vuol
                dire niente. Il conteggio esce solo se c'è qualcosa da
                contare. */}
            {scelte.length === 0 || bookings.length <= scelte.length
              ? "Aggiornate in tempo reale"
              : `${guardaAvanti ? "Le prossime" : "Le ultime"} ${scelte.length} di ${bookings.length}`}
            {picco && (
              <>
                {" · "}
                {/* L'accento che si **legge**: `accent` pieno su questo verde
                    sta sotto soglia, `accent-strong` no. */}
                <span className="text-accent-strong">
                  picco alle <strong className="font-medium">{picco.ora}</strong>,{" "}
                  <span className="font-mono">{picco.coperti}</span> coperti insieme
                </span>
              </>
            )}
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/bookings">
            <CalendarRange className="h-4 w-4" />
            Calendario
          </Link>
        </Button>
      </CardHeader>

      {/* Il pozzo prende l'altezza che avanza nella card, e la card si stira
          fino in fondo alla schermata: `justify-center` è per quando la
          finestra ha già raggiunto il suo passo massimo — quel che resta si
          divide sopra e sotto invece di cadere tutto in fondo. */}
      <div className="px-5 pb-4 md:flex md:min-h-0 md:flex-1 md:flex-col md:justify-center">
        {righe.length === 0 ? (
          <p className="riquadro tratteggiato border-cream/20 bg-white/5 p-8 text-center text-sm text-card-foreground/65">
            Nessuna prenotazione per oggi.
          </p>
        ) : righe.length > VISIBILI ? (
          <Rotazione righe={righe} etichetta="Prenotazioni di oggi" />
        ) : (
          <div className="relative">
            <Binario />
            {righe}
          </div>
        )}
      </div>
    </Card>
  );
}
