"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import type { Cambiamento } from "@/server/cambiamenti";

/**
 * «T10 assegnato da Anna», in una riga discreta.
 *
 * Non è un avviso: è la risposta a «perché è cambiato qualcosa mentre
 * guardavo». Due persone sullo stesso servizio da due tablet vedevano la
 * schermata muoversi da sola, e chi la vedeva muoversi non sapeva se il lavoro
 * era già stato fatto o se qualcuno stava sbagliando.
 *
 * Due scelte:
 *
 * - **una riga, non un elenco**: si legge l'ultimo cambiamento, e gli altri
 *   tre stanno dietro un tocco. Un registro aperto in mezzo a un servizio è
 *   una cosa che nessuno legge;
 * - **nessuna animazione, nessun colore d'allarme.** Un movimento vistoso in
 *   sala porta l'occhio via da quello che si sta facendo, e questo non è un
 *   problema: è una cortesia fra colleghi.
 */
export function CambiamentiRecenti({
  cambiamenti,
  ultimo,
}: {
  cambiamenti: Cambiamento[];
  /** L'ora dell'ultimo aggiornamento, per il suggerimento. */
  ultimo: Date | null;
}) {
  const [aperto, setAperto] = useState(false);
  const primo = cambiamenti[0];
  if (!primo) return null;

  const altri = cambiamenti.length - 1;

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        title={
          ultimo
            ? `Aggiornato alle ${ultimo.toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`
            : undefined
        }
        className="flex max-w-[22rem] items-center gap-1.5 t-nota transition-colors hover:text-muted-foreground"
      >
        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <strong className="font-medium">{primo.chi}</strong> {primo.cosa}
        </span>
        {altri > 0 && <span className="shrink-0">+{altri}</span>}
      </button>

      {aperto && altri > 0 && (
        <ul className="surface absolute right-0 top-full z-20 mt-1 w-80 space-y-1 rounded-md border border-border p-2">
          {cambiamenti.map((c) => (
            <li key={c.id} className="text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">{c.chi}</strong> {c.cosa}{" "}
              <span className="text-tertiary-foreground">
                ·{" "}
                {new Date(c.quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
