"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PARTI, parteDa } from "@/lib/parti-impostazioni";

/**
 * L'indice delle Impostazioni: **link**, non stato.
 *
 * Funziona senza JavaScript, si può mandare a un collega il link a una parte, e
 * il tasto indietro fa quello che ci si aspetta.
 *
 * Legge la parte attiva dall'indirizzo invece di riceverla perché lo rende
 * **anche la schermata di caricamento**: entrando in Impostazioni, l'indice e
 * il titolo non dipendono dai dati e non hanno motivo di diventare due
 * rettangoli grigi (§69).
 *
 * E al clic la parte chiesta porta una rotella: cambiare parte non mostra
 * nessuno scheletro — Next tiene la pagina in piedi finché i dati nuovi non
 * arrivano — ma senza un segno, su una connessione lenta, si resta a guardare
 * la parte di prima senza sapere se il tocco è arrivato.
 */
export function IndiceParti() {
  const parametri = useSearchParams();
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [chiesta, setChiesta] = useState<string | null>(null);
  const attiva = parteDa(parametri.get("parte"));

  function vai(e: React.MouseEvent<HTMLAnchorElement>, href: string, id: string) {
    // Un clic con un modificatore vuole aprire altrove: non è nostro.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setChiesta(id);
    avvia(() => router.push(href));
  }

  return (
    <>
      {/* Sul telefono le quattro pillole andavano a capo su due righe: cento
          pixel di intestazione in una schermata che non scorre. Qui scorrono in
          orizzontale, e da `sm` tornano a disporsi su più righe. */}
      <nav
        aria-label="Parti delle impostazioni"
        className="fissa -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {PARTI.map((p) => {
          const scelta = p.id === attiva;
          const href = `/settings?parte=${p.id}`;
          const aspetta = inCorso && chiesta === p.id;
          return (
            <Link
              key={p.id}
              href={href}
              onClick={(e) => vai(e, href, p.id)}
              aria-current={scelta ? "page" : undefined}
              aria-busy={aspetta || undefined}
              className={
                scelta
                  ? "flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-cream bg-cream px-3 py-2 text-sm font-medium text-clay-ink"
                  : "flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-cream hover:text-foreground"
              }
            >
              {p.titolo}
              {aspetta && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            </Link>
          );
        })}
      </nav>

      {/* Il titolo della parte non si ripete: la pillola accesa lo dice già, e
          in una schermata che non scorre cinquanta pixel di ripetizione sono
          cinquanta pixel di contenuto in meno. Resta la riga che aggiunge
          qualcosa — cosa c'è dentro questa parte. */}
      <p className="fissa border-b border-border pb-2 text-xs text-muted-foreground">
        {PARTI.find((p) => p.id === attiva)!.sottotitolo}
      </p>
    </>
  );
}
