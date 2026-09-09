"use client";

import { useState } from "react";
import Link from "next/link";
import { ListPlus, Search, UtensilsCrossed } from "lucide-react";
import { WalkInDialog } from "@/components/bookings/walk-in-dialog";

/**
 * Tre gesti in una riga, non quattro riquadri in due file.
 *
 * Occupavano 268 px in una colonna che ne ha 586 in tutto, e uno dei quattro
 * — «Nuova prenotazione» — è **lo stesso pulsante che sta in testata**, dieci
 * centimetri più su. Prima di comprimere una pagina si cerca il doppione.
 *
 * Restano i tre gesti che la testata non ha, in una riga di bersagli larghi
 * (44 px di altezza, tocco pieno) invece di quattro piastrelle da 84.
 */
const TILE =
  "finish-sage-tile flex min-h-[44px] min-w-[9rem] flex-1 items-center justify-center gap-2 rounded-xl border border-[#2f5b4a] px-2.5 py-2 text-center text-cream transition-colors hover:brightness-110";

const LINKS = [
  { href: "/waitlist", label: "Lista d'attesa", icon: ListPlus },
  { href: "/guests", label: "Cerca ospite", icon: Search },
];

export function QuickActions() {
  const [walkInOpen, setWalkInOpen] = useState(false);

  return (
    // `flex-wrap`: nella colonna stretta del tablet tre bersagli in fila
    // sforavano a destra. Vanno a capo invece di essere tagliati.
    <div className="flex flex-wrap gap-2">
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={TILE}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-sm font-medium">{label}</span>
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
        className={TILE}
        aria-label="Accomoda walk-in"
      >
        <UtensilsCrossed className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-medium">Walk-in</span>
      </button>

      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} />
    </div>
  );
}
