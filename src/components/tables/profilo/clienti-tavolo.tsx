"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";
import { Gruppo } from "./sezione";

/**
 * Chi è a questo tavolo, fra quelli che il locale già conosce.
 *
 * ## Perché spesso è una persona sola
 *
 * Una prenotazione ha **un** ospite nel CRM: chi ha prenotato. Le altre
 * persone sedute non esistono come righe, e inventarne — una per coperto, con
 * un nome vuoto — significherebbe riempire il CRM di contatti che nessuno ha
 * lasciato e che poi qualcuno proverebbe a unire con i doppioni veri. Quando
 * il tavolo è unito ad altri gli ospiti sono davvero più d'uno, perché una
 * tavolata è più prenotazioni, e allora si vedono tutti.
 *
 * Chi è nel CRM è un collegamento: la scheda dell'ospite risponde a domande
 * che qui non ci stanno — quante volte è venuto, cosa ha speso, cosa non
 * mangia.
 */
export function ClientiTavolo({ profilo }: { profilo: ProfiloTavolo }) {
  if (profilo.clienti.length === 0) return null;

  return (
    <Gruppo titolo={profilo.clienti.length === 1 ? "Cliente" : "Clienti"}>
      <ul className="space-y-1">
        {profilo.clienti.map((c) => {
          const dentro = (
            <>
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials(c.nome)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.nome}</span>
                <span className="block t-nota">
                  {[
                    c.affezionato ? "cliente affezionato" : null,
                    c.visite != null && c.visite > 0
                      ? `${c.visite} ${c.visite === 1 ? "visita" : "visite"}`
                      : c.affezionato
                        ? null
                        : "prima volta",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </>
          );

          return (
            <li key={c.guestId ?? c.nome}>
              {c.guestId ? (
                <Link
                  href={`/guests/${c.guestId}`}
                  className="group flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 -mx-2 transition-colors hover:bg-white/5"
                >
                  {dentro}
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-tertiary-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 px-2 -mx-2">{dentro}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Gruppo>
  );
}
