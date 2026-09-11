"use client";

import { useState } from "react";
import Link from "next/link";
import { ListPlus, Plus, Search, UtensilsCrossed } from "lucide-react";
import { WalkInDialog } from "@/components/bookings/walk-in-dialog";
import { cn } from "@/lib/utils";

/**
 * I gesti della Panoramica, in testata e a riposo ridotti alla sola icona.
 *
 * Erano quattro riquadri larghi in mezzo alla pagina — tre più «Nuova
 * prenotazione» in testata, che è **lo stesso gesto** dieci centimetri più su
 * — e occupavano 268 px nella colonna di destra: lo spazio in cui adesso ci
 * sta il grafico dell'andamento senza far scorrere niente. Un pulsante grande
 * non è più facile da trovare di un'icona in testata, se la testata è il posto
 * dove i comandi stanno in tutte le altre schermate.
 *
 * Perché espandere invece di mostrare un tooltip: il testo esce **dentro** il
 * pulsante, quindi il bersaglio cresce con l'etichetta e il gesto si può
 * completare senza rimettere a fuoco. E non c'è il ritardo di 700 ms del
 * tooltip su una schermata che si usa durante il servizio.
 *
 * Le tre regole che lo rendono usabile e non solo animato:
 *
 * - **il nome accessibile non dipende dall'espansione**: `aria-label` sta sul
 *   comando e vale sempre, anche col testo chiuso (che non è nascosto a
 *   schermo ma tagliato, e comunque non si legge);
 * - **si apre anche col tabulatore**, non solo col puntatore: `focus-visible`
 *   fa lo stesso lavoro di `hover`, quindi chi naviga da tastiera vede la
 *   parola prima di premere invio;
 * - **niente scatti**: cresce `max-width` e il margine del testo, e il gruppo
 *   è ancorato a destra — quindi si allarga verso il saluto, che è troncabile,
 *   invece di spingere fuori schermo i pulsanti accanto. Con
 *   `prefers-reduced-motion` la transizione non c'è e il testo appare secco.
 */
const COMANDO =
  "group/azione tocco-comodo inline-flex h-10 items-center justify-center rounded-full px-2.5 transition-[filter,box-shadow] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Il gesto principale porta il tono delle chiamate all'azione: crema su verde. */
const TONO_PRIMARIO = "bg-cream text-clay-ink shadow-[0_10px_24px_rgba(0,0,0,0.35)]";
const TONO = "finish-sage-tile border border-[#2f5b4a] text-cream";

/*
  `max-w-0` + `overflow-hidden` invece di `hidden`: una larghezza si può
  animare, un `display` no. Il margine entra nella transizione insieme alla
  larghezza, altrimenti a riposo resterebbero 8 px di aria dopo l'icona e i
  pulsanti chiusi non sarebbero tondi.
*/
const ETICHETTA =
  "max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wider opacity-0 transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none group-hover/azione:ml-2 group-hover/azione:max-w-[12rem] group-hover/azione:opacity-100 group-focus-visible/azione:ml-2 group-focus-visible/azione:max-w-[12rem] group-focus-visible/azione:opacity-100";

const ICONA = "h-5 w-5 shrink-0";

const COLLEGAMENTI = [
  { href: "/waitlist", label: "Lista d'attesa", icon: ListPlus },
  { href: "/guests", label: "Cerca ospite", icon: Search },
];

export function QuickActions() {
  const [walkInOpen, setWalkInOpen] = useState(false);

  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5">
      {/* Sotto `md` questo comando non c'è: la barra in basso ha il «+»
          grande, e la sua prima voce è proprio «Nuova prenotazione». Erano due
          bersagli per la stessa cosa. Gli altri tre restano anche sul telefono
          — chiusi sono tre tondi da 40 px, e il saluto accanto tronca. */}
      <Link
        href="/bookings/new"
        aria-label="Nuova prenotazione"
        className={cn(COMANDO, TONO_PRIMARIO, "hidden md:inline-flex")}
      >
        <Plus className={ICONA} aria-hidden="true" />
        <span className={ETICHETTA} aria-hidden="true">
          Prenotazione
        </span>
      </Link>

      {COLLEGAMENTI.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-label={label} className={cn(COMANDO, TONO)}>
          <Icon className={ICONA} aria-hidden="true" />
          <span className={ETICHETTA} aria-hidden="true">
            {label}
          </span>
        </Link>
      ))}

      {/* Il walk-in si apre qui invece di portare in Sala: chi lo usa ha una
          persona in piedi davanti, e un cambio di pagina è un tocco in più. */}
      {/* L'etichetta visibile è corta perché la riga è stretta, ma il nome
          accessibile tiene il verbo: «Walk-in» da solo è un sostantivo, e chi
          naviga a voce sentirebbe una categoria invece di un'azione. */}
      <button
        type="button"
        onClick={() => setWalkInOpen(true)}
        aria-label="Accomoda walk-in"
        className={cn(COMANDO, TONO)}
      >
        <UtensilsCrossed className={ICONA} aria-hidden="true" />
        <span className={ETICHETTA} aria-hidden="true">
          Walk-in
        </span>
      </button>

      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} />
    </div>
  );
}
