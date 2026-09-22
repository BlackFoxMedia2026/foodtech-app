"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

/**
 * Uscire.
 *
 * Un componente client per una riga sola, perché `signOut` vive nel browser.
 * Nessuna conferma: la sessione si riapre con le proprie credenziali, quindi
 * non è un'azione irreversibile — e §37 tiene le conferme per ciò che lo è.
 *
 * `callbackUrl` porta alla schermata d'accesso e non alla home pubblica: chi
 * esce da un dispositivo di sala quasi sempre lo fa perché deve entrare
 * qualcun altro.
 */
export function CartaAccesso() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-lg border border-border px-3 text-left text-sm text-muted-foreground"
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
      Esci da Tavolo
    </button>
  );
}
