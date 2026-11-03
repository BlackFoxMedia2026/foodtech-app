"use client";

import { useState } from "react";
import Link from "next/link";
import { ListPlus, Plus, Search, UtensilsCrossed } from "lucide-react";
import { WalkInDialog } from "@/components/bookings/walk-in-dialog";
import { cn } from "@/lib/utils";

/**
 * I gesti della Panoramica, in testata, con il nome scritto accanto all'icona.
 *
 * Erano quattro riquadri larghi in mezzo alla pagina — tre più «Nuova
 * prenotazione» in testata, che è **lo stesso gesto** dieci centimetri più su
 * — e occupavano 268 px nella colonna di destra: lo spazio in cui adesso ci
 * sta il grafico dell'andamento senza far scorrere niente.
 *
 * Per un periodo a riposo erano solo icone e il nome usciva al passaggio:
 * quattro tondi uguali in fila non si distinguono a colpo d'occhio, e durante
 * il servizio nessuno passa il puntatore per leggere. Ora dal `lg` in su il
 * nome è sempre scritto; sotto restano tondi, perché lì la riga è
 * contesa col saluto e la barra in basso ha già i nomi.
 *
 * Il nome accessibile sta in `aria-label` sul comando e vale anche quando
 * l'etichetta non si vede.
 */
const COMANDO =
  "tocco-comodo inline-flex h-10 items-center justify-center rounded-full px-2.5 transition-[filter,box-shadow] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:pl-3 lg:pr-4";

/** Il gesto principale porta il tono delle chiamate all'azione: crema su verde. */
const TONO_PRIMARIO = "pulsante-cta bg-cta text-cta-ink shadow-[shadow:var(--button-accent-shadow)]";
const TONO = "pastiglia finish-sage-tile border border-[#2f5b4a] text-ink";

const ETICHETTA =
  "ml-2 hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wider lg:inline";

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
