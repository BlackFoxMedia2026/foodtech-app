import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvanzamentoServizio } from "./avanzamento-servizio";
import type { TurnoDiOggi, TurnoStaff } from "@/server/staff-app/turno";

/**
 * **La striscia del turno** — §1 e §2 del redesign.
 *
 * ## Cos'era, e perché non andava
 *
 * Era una card da circa 210 px: etichetta, orario grande, barra, orari agli
 * estremi, «7h 54m rimanenti», e sotto tre pillole con ruolo, area e numero
 * di tavoli. Su un telefono da 844 px si prendeva **un quarto della prima
 * schermata** per dire una cosa che si guarda una volta a sera.
 *
 * E ripeteva: l'orario di fine compariva due volte (nel titolo e in fondo
 * alla barra), il tempo rimanente era la stessa informazione della barra
 * detta a parole, il ruolo era già implicito nel profilo di chi ha fatto
 * accesso, il numero di tavoli era scritto sotto in forma di tavoli veri.
 *
 * ## Cos'è adesso
 *
 * Due righe, circa 76 px: un badge di stato, e **la barra come elemento
 * principale** con gli estremi agli estremi. Il tempo rimanente resta solo
 * nell'etichetta accessibile della barra, perché a chi legge con uno
 * screen reader la posizione di un pallino non dice niente.
 *
 * Ruolo, area e conteggio tavoli sono **usciti**, e non si sono spostati
 * altrove: il ruolo è chi sei, l'area la dice la Sala, i tavoli sono
 * disegnati cinquanta pixel più in basso. Ripetere ciò che l'interfaccia
 * già mostra è il difetto che questa schermata aveva in tre punti su
 * quattro.
 *
 * ## Tre casi, e nessuno dei tre è un errore
 *
 * 1. **un turno**: badge e barra;
 * 2. **un riposo**: una riga sola, e va detta — «oggi non lavori» è
 *    un'informazione, non un vuoto;
 * 3. **niente**: la settimana non è ancora stata pianificata. Diverso dal
 *    riposo, e si scrive diverso: chi legge «riposo» pianifica la giornata,
 *    chi legge «non ancora pianificato» scrive al responsabile.
 */

const ETICHETTA_ASSENZA: Record<string, string> = {
  REST: "Riposo",
  VACATION: "Ferie",
  LEAVE: "Permesso",
  SICK_LEAVE: "Malattia",
  UNAVAILABLE: "Non disponibile",
};

export function CardTurno({ turno }: { turno: TurnoDiOggi | null }) {
  if (!turno) {
    return (
      <section className="sa-piano border-dashed px-4 py-3">
        <p className="sa-corpo font-medium">Nessun turno per oggi</p>
        <p className="sa-nota mt-0.5">La giornata non è ancora stata pianificata.</p>
      </section>
    );
  }

  if (turno.kind !== "WORK") {
    return (
      <section className="sa-piano flex items-center gap-3 px-4 py-3">
        <CalendarOff className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="sa-corpo font-medium">{ETICHETTA_ASSENZA[turno.kind] ?? "Oggi non lavori"}</p>
          {turno.note && <p className="sa-nota mt-0.5 truncate">{turno.note}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={cn("sa-piano px-4 py-3", turno.inCorso && "border-accent/50")}>
      <div className="flex items-center justify-between gap-3">
        {turno.inCorso ? (
          <Badge acceso>In servizio</Badge>
        ) : (
          <Badge>{turno.minutiAllInizio !== null ? "Turno di oggi" : "Turno concluso"}</Badge>
        )}
        {/* Il servizio del locale — «Cena» — e non il ruolo: dice **quale**
            turno è, che è l'unica qualifica dell'orario che non si ricava
            guardando l'orario. */}
        {turno.servizio && <span className="sa-nota shrink-0">{turno.servizio}</span>}
      </div>

      {turno.inizio && turno.fine && (
        <AvanzamentoServizio
          inizioMinuti={turno.inizioMinuti}
          fineMinuti={turno.fineMinuti}
          oraMinuti={turno.oraMinuti}
          inizio={turno.inizio}
          fine={turno.fine}
        />
      )}
    </section>
  );
}

function Badge({ children, acceso }: { children: React.ReactNode; acceso?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[0.9375rem] font-medium",
        acceso ? "text-accent-strong" : "text-muted-foreground",
      )}
    >
      {/* Un punto, non un lampeggio: `prefers-reduced-motion` è un requisito
          del prodotto, e un pallino che pulsa su una schermata che si guarda
          per un secondo è rumore anche per chi non l'ha attivato. */}
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 rounded-full", acceso ? "bg-accent-strong" : "bg-muted-foreground")}
      />
      {children}
    </span>
  );
}

/** La riga «prossimo turno», per la Home della cucina. */
export function ProssimoTurno({ turno }: { turno: TurnoStaff | null }) {
  return (
    <section className="sa-piano px-4 py-3">
      <p className="sa-etichetta">Prossimo turno</p>
      {turno ? (
        <p className="sa-corpo mt-1">
          <span className="font-medium">{formattaGiorno(turno.giorno)}</span>
          {turno.inizio && (
            <span className="tabular-nums">
              {" · "}
              {turno.inizio} → {turno.fine}
            </span>
          )}
        </p>
      ) : (
        <p className="sa-nota mt-1">Non ancora pianificato.</p>
      )}
    </section>
  );
}

/** «2026-09-21» → «Lunedì 21 settembre». */
export function formattaGiorno(chiave: string): string {
  const d = new Date(`${chiave}T12:00:00.000Z`);
  const testo = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}
