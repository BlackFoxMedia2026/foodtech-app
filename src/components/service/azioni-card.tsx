"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un'azione di una card del servizio.
 *
 * Due nomi e non uno: `etichetta` è la frase intera — quella che sente un
 * lettore di schermo e quella che si legge nel suggerimento — e `corta` è
 * quello che ci sta sotto l'icona in una piastrella da ottanta pixel.
 * «Cambia tavolo» diventa «Tavolo», e nessuna delle due è un riassunto
 * dell'altra: sono la stessa cosa detta nello spazio che c'è.
 */
export type AzioneCard = {
  chiave: string;
  etichetta: string;
  corta: string;
  icona: LucideIcon;
  /** L'azione che si fa di solito: piastrella crema, e prima nella griglia. */
  principale?: boolean;
  /** Per chiamare (`tel:`) o aprire una scheda (`/guests/…`). */
  href?: string;
  onClick?: () => void;
  disabilitato?: boolean;
};

/**
 * Le azioni di una card, in piastrelle invece che in icone.
 *
 * ## Il problema misurato
 *
 * In fondo a ogni card c'erano fino a sei pulsanti tondi da 36 px, senza
 * etichetta, distanti 2 px l'uno dall'altro. Tre cose non andavano, e la
 * terza è la peggiore:
 *
 * - **36 px non è un bersaglio.** La soglia sotto le dita è 44, e qui si
 *   lavora su un tablet con una mano occupata da un menù;
 * - **2 px di distanza** vuol dire che sbagliare bersaglio non è raro: è il
 *   caso normale. E fra «apri il conto» e «usa un coupon» ci sono due px;
 * - **non si capisce cosa fanno.** Sei glifi grigi tutti uguali di peso
 *   chiedono di ricordarsi a memoria quale è quale, e chi usa il programma
 *   due sere a settimana non se lo ricorda.
 *
 * ## Cosa fa questa griglia
 *
 * Quattro colonne di piastrelle da **80 px con il nome scritto sotto
 * l'icona**. Il bersaglio raddoppia in area e smette di essere un indovinello.
 *
 * Il costo è che ci vuole un tocco in più per arrivarci — si apre la card —
 * ed è un costo accettabile perché **queste azioni non sono quelle di ogni
 * sera**: arrivato, accomoda e libera tavolo restano sulla card chiusa, dove
 * erano. Qui sotto ci sono cambia tavolo, conto, coupon, telefono: cose che
 * si fanno qualche volta a servizio, e per le quali un tocco in più costa
 * meno di un tocco sbagliato.
 */
export function GrigliaAzioni({ azioni }: { azioni: AzioneCard[] }) {
  return (
    // `auto-fit` e non un numero fisso di colonne: le card ne hanno da due
    // a otto, e quattro colonne fisse lasciavano buchi in fondo alla riga.
    // Con le tracce che si autoadattano, tre azioni riempiono tre colonne
    // larghe e otto ne fanno due file da quattro.
    <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-1.5">
      {azioni.map((a) => {
        const Icona = a.icona;
        const dentro = (
          <>
            <Icona className="h-5 w-5" aria-hidden="true" />
            <span className="w-full truncate text-[11px] font-medium leading-tight">{a.corta}</span>
          </>
        );
        const classe = cn(
          "flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-md border px-1 text-center transition-colors",
          a.principale
            ? "border-transparent bg-cream text-clay-ink"
            : "border-border text-foreground hover:bg-current/10",
          a.disabilitato && "pointer-events-none opacity-50",
        );

        // Un link interno va con `Link`, un `tel:` con l'ancora nuda: il
        // router di Next non deve provare a navigare verso un numero.
        if (a.href) {
          return a.href.startsWith("/") ? (
            <Link key={a.chiave} href={a.href} aria-label={a.etichetta} title={a.etichetta} className={classe}>
              {dentro}
            </Link>
          ) : (
            <a key={a.chiave} href={a.href} aria-label={a.etichetta} title={a.etichetta} className={classe}>
              {dentro}
            </a>
          );
        }

        return (
          <button
            key={a.chiave}
            type="button"
            onClick={a.onClick}
            disabled={a.disabilitato}
            aria-label={a.etichetta}
            title={a.etichetta}
            className={classe}
          >
            {dentro}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Decide se un clic sulla card deve aprire (o chiudere) le azioni.
 *
 * Un clic finito su un pulsante, un link o un `<details>` è **suo**: la card
 * non ci mette bocca. Tutto il resto della card — l'ora, il nome, le
 * pillole, lo spazio vuoto — è la maniglia. Così non serve fermare la
 * propagazione su ogni figlio interattivo, che è la cosa che si dimentica
 * quando se ne aggiunge uno nuovo sei mesi dopo.
 */
export function clicSullaCard(e: React.MouseEvent) {
  return !(e.target as HTMLElement).closest("button, a, input, select, textarea, details, summary");
}
