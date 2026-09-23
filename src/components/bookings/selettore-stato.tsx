"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { BookingStatus } from "@prisma/client";
import { badgeVariants } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvvisi } from "@/components/ui/avvisi";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { STATI_NEGATIVI, STATI_OPERATIVI, STATUS } from "@/components/bookings/status-badge";

/**
 * Lo stato **è** il comando.
 *
 * Prima per cambiarlo bisognava trovare i tre puntini nella colonna Azioni. I
 * tre puntini dicono «roba secondaria», e cambiare stato è la cosa che si fa
 * cinquanta volte a sera: l'azione più frequente della pagina era anche la più
 * nascosta, e chi arrivava nuovo chiedeva dov'era.
 *
 * Adesso la pillola dello stato è il pulsante che la apre. Un clic sullo stato,
 * un clic sul nuovo stato. Il chevron e il puntatore dicono che si preme, il
 * titolo lo dice a parole, e nella colonna Azioni non resta niente da cercare.
 *
 * Il salvataggio è **lo stesso di prima** — `PATCH /api/bookings/:id` con il
 * solo `status`, che il server sa già trattare senza rifare la verifica di
 * disponibilità (`richiedeVerificaDisponibilita`). Qui non c'è logica nuova:
 * c'è la stessa chiamata dietro un comando che si vede.
 */
export function SelettoreStato({
  bookingId,
  stato,
  nome,
  /** Chi non può scrivere vede la pillola e basta: un comando che risponde
   *  «non puoi» è peggio di un comando che non c'è. */
  modificabile = true,
  /** Su telefono la pillola sta stretta: l'etichetta resta, il resto si stringe. */
  className,
}: {
  bookingId: string;
  stato: BookingStatus;
  /** Serve nell'etichetta accessibile: su tredici righe uguali dice quale. */
  nome: string;
  modificabile?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [inCorso, setInCorso] = useState(false);
  /*
    Lo stato mostrato mentre il server risponde.

    La pillola deve cambiare nell'istante del clic: `router.refresh()` rifà la
    pagina sul server, e nei duecento millisecondi in mezzo la riga diceva
    ancora quella vecchia — che in sala si risolve premendo una seconda volta.
    Quando i dati veri arrivano, `stato` cambia e questo si azzera da solo.
  */
  const [ottimistico, setOttimistico] = useState<BookingStatus | null>(null);
  useEffect(() => setOttimistico(null), [stato]);

  const mostrato = ottimistico ?? stato;
  const meta = STATUS[mostrato];

  async function salva(nuovo: BookingStatus): Promise<boolean> {
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nuovo }),
    });
    if (!res.ok) {
      avvisi.problema(await readApiError(res, "Non è stato possibile cambiare lo stato. Riprova."));
      return false;
    }
    return true;
  }

  /**
   * Cambia lo stato, e offre di tornare indietro.
   *
   * È la via già scelta dal prodotto per i gesti del servizio (vedi
   * `ui/avvisi.tsx`): si agisce subito e per sette secondi si annulla, invece
   * di chiedere una conferma prima di ogni gesto giusto. Qui serviva più che
   * altrove, perché prima il cambio stato non dava **nessun** segno di essere
   * avvenuto — né in lista né sulla scheda.
   */
  async function cambia(nuovo: BookingStatus) {
    if (nuovo === stato || inCorso) return;
    const precedente = stato;
    setInCorso(true);
    const fatto = await salva(nuovo);
    setInCorso(false);
    if (!fatto) return;
    setOttimistico(nuovo);
    router.refresh();
    avvisi.mostra(`${nome}: ${STATUS[nuovo].label.toLowerCase()}`, async () => {
      setOttimistico(precedente);
      if (await salva(precedente)) router.refresh();
      else setOttimistico(nuovo);
    });
  }

  const pillola = cn(
    badgeVariants({ tone: meta.tone }),
    meta.conclusa ? "badge-dot badge-dot-anello" : "badge-dot",
    // Più grande della pillola di sola lettura: qui è un comando, e un comando
    // di dodici pixel in una riga alta quaranta non si vede e non si prende.
    "h-8 px-2.5 text-[0.8125rem] sm:px-3 sm:text-sm",
    className,
  );

  if (!modificabile) {
    return <span className={pillola}>{meta.label}</span>;
  }

  /* A che punto del servizio siamo: serve al menu per dire quali passi sono
     già stati fatti e qual è il prossimo. -1 se la prenotazione è uscita dal
     flusso (cancellata o no-show). */
  const passo = STATI_OPERATIVI.indexOf(mostrato);
  const prossimo = passo >= 0 && passo < STATI_OPERATIVI.length - 1 ? STATI_OPERATIVI[passo + 1] : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={inCorso}
          title="Cambia stato"
          aria-label={`Stato di ${nome}: ${meta.label}. Cambia stato`}
          className={cn(
            pillola,
            "tocco-comodo gap-1.5 cursor-pointer select-none",
            // Hover evidente ma senza bagliori: il bordo si accende di crema e
            // il chevron finisce di comparire. Niente ombre, niente scatti.
            "hover:border-line-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "data-[state=open]:border-line-60",
            inCorso && "opacity-70",
          )}
        >
          <span className="whitespace-nowrap">{meta.label}</span>
          {inCorso ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[232px]">
        <DropdownMenuLabel className="t-etichetta px-2.5 pb-1.5 pt-1">Stato prenotazione</DropdownMenuLabel>

        {/*
          I cinque operativi sono un **percorso**, non un elenco: il pallino a
          sinistra è pieno per i passi già fatti e vuoto per quelli davanti, e
          il prossimo lo dice a parole. È la gerarchia minima che fa capire
          l'avanzamento senza mettere uno stepper dentro ogni riga della
          tabella — la tabella resta pulita, il percorso vive qui dentro.
        */}
        {STATI_OPERATIVI.map((k, i) => (
          <VoceStato
            key={k}
            stato={k}
            corrente={k === mostrato}
            fatto={passo >= 0 && i <= passo}
            prossimo={k === prossimo}
            onScegli={() => cambia(k)}
          />
        ))}

        <DropdownMenuSeparator />

        {/* Cancellata e no-show non sono un avanzamento: sono l'uscita. Stanno
            sotto la riga, in tono minore, e restano riconoscibili dal pallino
            ad anello — lo stesso segno che portano nella pillola. */}
        {STATI_NEGATIVI.map((k) => (
          <VoceStato key={k} stato={k} corrente={k === mostrato} onScegli={() => cambia(k)} uscita />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VoceStato({
  stato,
  corrente,
  fatto = false,
  prossimo = false,
  uscita = false,
  onScegli,
}: {
  stato: BookingStatus;
  corrente: boolean;
  fatto?: boolean;
  prossimo?: boolean;
  uscita?: boolean;
  onScegli: () => void;
}) {
  const meta = STATUS[stato];
  return (
    <DropdownMenuItem
      onSelect={onScegli}
      className={cn(
        "px-2.5 py-2",
        corrente && "bg-accent/15 text-popover-foreground",
        uscita && !corrente && "text-popover-foreground/70",
      )}
    >
      {/*
        Un solo pallino, non sette colori. Gli stati qui si distinguono per
        testo, posizione, peso e pieno/vuoto: un arcobaleno dentro un menu di
        sette voci si legge meno di un elenco ordinato.
      */}
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          corrente
            ? "bg-accent-strong"
            : fatto
              ? "bg-cream/45"
              : uscita
                ? "ring-1 ring-inset ring-destructive/50"
                : "ring-1 ring-inset ring-line-30",
        )}
      />
      <span className={cn("flex-1", corrente && "font-medium")}>{meta.label}</span>
      {corrente ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" />
      ) : prossimo ? (
        <span className="t-nota shrink-0">prossimo</span>
      ) : null}
    </DropdownMenuItem>
  );
}

/**
 * «Approva», dove la decisione c'è davvero.
 *
 * Il menu degli stati basta a tutto il resto, ma approvare una prenotazione in
 * sospeso è il gesto singolo più frequente della pagina e merita di restare a
 * un clic. «Rifiuta» invece è finito dentro il menu, come «Cancellata»: era un
 * secondo pulsante su ogni riga in attesa per un gesto che si fa di rado.
 */
export function ApprovaPrenotazione({
  bookingId,
  nome,
  className,
}: {
  bookingId: string;
  nome: string;
  className?: string;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [inCorso, setInCorso] = useState(false);

  async function approva() {
    setInCorso(true);
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CONFIRMED" }),
    });
    setInCorso(false);
    if (!res.ok) {
      avvisi.problema(await readApiError(res, "Non è stato possibile approvare. Riprova."));
      return;
    }
    router.refresh();
    avvisi.mostra(`${nome}: confermata`);
  }

  return (
    <button
      type="button"
      onClick={approva}
      disabled={inCorso}
      className={cn(
        // Il verde del prodotto, non un verde qualunque: sage al 20% col crema
        // sopra fa 6,50 : 1 (vedi la tabella delle pillole in DESIGN.md).
        "tocco-comodo inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-sage/50 bg-sage/20 px-3 text-xs font-medium text-foreground transition-colors",
        "hover:bg-sage/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60",
        className,
      )}
    >
      {inCorso ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Approva
    </button>
  );
}
