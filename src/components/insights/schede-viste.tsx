"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VISTE, vistaDa } from "@/lib/viste-insights";

/**
 * Le quattro viste di Analytics, come **link**.
 *
 * Sono link e non stato per tre ragioni che valgono in tutto il prodotto:
 * funzionano senza JavaScript, si possono mandare a un collega, e il tasto
 * indietro fa quello che ci si aspetta.
 *
 * Stanno in un componente loro — e leggono la vista attiva dall'indirizzo
 * invece di riceverla — perché le rende **anche la schermata di caricamento**.
 * I nomi delle viste stanno in `lib/viste-insights`, perché li legge anche il
 * server e da un modulo client non si può.
 * Prima quella schermata metteva un rettangolo grigio dove stanno queste
 * pillole: cambiando vista sparivano il titolo, il periodo scelto e le viste
 * stesse, e per un secondo non si sapeva più dove si era. Uno scheletro deve
 * riflettere il layout vero (§69), e la parte che **non dipende dai dati** non
 * ha nessun motivo di diventare un rettangolo.
 */
export function SchedeViste() {
  const parametri = useSearchParams();
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [chiesta, setChiesta] = useState<string | null>(null);
  const attiva = vistaDa(parametri.get("vista"));
  const range = parametri.get("range") ?? "last7";

  /*
    Cambiare vista non mostra nessuno scheletro — e non è un difetto del
    caricamento: Next tiene la pagina in piedi finché i dati nuovi non
    arrivano, perché il pezzo di navigazione è lo stesso e cambia solo
    l'indirizzo. Il problema è che **non lo dice**: su una connessione lenta si
    restava a guardare i numeri di prima sotto una vista già cliccata, senza
    sapere se il tocco era arrivato. Misurato con le richieste rallentate:
    otto secondi di dati vecchi e nessun segno.
    
    Quindi il segno lo mette la pillola: resta un `<a href>` — con il tasto
    centrale, con Ctrl, e senza JavaScript funziona come prima — ma al clic
    semplice la navigazione passa da una transizione, e per tutta la sua
    durata quella pillola porta una rotella.
  */
  function vai(e: React.MouseEvent<HTMLAnchorElement>, href: string, id: string) {
    // Un clic con un modificatore vuole aprire altrove: non è nostro.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setChiesta(id);
    avvia(() => router.push(href));
  }

  return (
    // Come il selettore del periodo: una riga che scorre sul telefono, più
    // righe da `sm`. Le quattro viste devono restare tutte raggiungibili
    // senza rubare altezza al contenuto.
    <nav
      aria-label="Viste di Analytics"
      className="fissa -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
    >
      {VISTE.map((v) => {
        const scelta = v.id === attiva;
        const href = `/insights?range=${range}&vista=${v.id}`;
        const aspetta = inCorso && chiesta === v.id;
        return (
          <Link
            key={v.id}
            href={href}
            onClick={(e) => vai(e, href, v.id)}
            aria-current={scelta ? "page" : undefined}
            aria-busy={aspetta || undefined}
            className={
              scelta
                ? "flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-cream bg-cream px-3 py-2 text-sm font-medium text-clay-ink"
                : "flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-cream hover:text-foreground"
            }
          >
            {v.titolo}
            {aspetta && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          </Link>
        );
      })}
    </nav>
  );
}
