"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Footprints } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAvvisi } from "@/components/ui/avvisi";
import type { PermessoStaff, ProfiloStaff } from "@/lib/permessi-staff";
import { FoglioWalkIn } from "./foglio-accomoda";
import { vociPer, voceAttiva } from "./voci-nav";

/**
 * La barra in basso: dove sta il pollice.
 *
 * ## Le misure, e perché sono queste
 *
 * - **72 px di altezza per bersaglio**, contro i 56 della barra del back
 *   office. Chi usa questa app cammina: il bersaglio si prende in movimento,
 *   con una mano sola, e spesso senza guardare;
 * - **icone da 24 px dentro una pastiglia da 52 × 32**. Erano 28 px nude:
 *   grandi, ma senza niente attorno l'unica differenza fra la voce attiva e
 *   le altre era il colore del tratto. Ventiquattro dentro una superficie
 *   che si vede si riconoscono da più lontano di ventotto che galleggiano,
 *   e la pastiglia dà al pollice un bersaglio con un contorno;
 * - **il nome a 12 px**, non 11: è la misura sotto la quale il brief dice di
 *   non scendere, e in sala il nome si legge poco ma si legge — sempre dopo
 *   la forma, mai al posto suo;
 * - **l'area sicura in basso** (`env(safe-area-inset-bottom)`) è sommata, non
 *   sostituita: su un iPhone con la barra gestuale, senza, l'ultima riga di
 *   testo finisce sotto la tacca;
 * - **la pastiglia non scivola** da una voce all'altra: compare dov'è
 *   arrivato il pollice. Un indicatore che viaggia per 200 ms, in una barra
 *   che si tocca cinquanta volte a sera, è mezzo minuto di attesa a turno —
 *   e su una navigazione che cambia pagina lo si vedrebbe comunque a
 *   metà strada. La tinta sfuma, la posizione no.
 *
 * ## Il walk-in al centro
 *
 * In mezzo alle voci c'è un **pulsante**, non una destinazione: apre il
 * foglio del walk-in da qualunque schermata. È l'unica azione di questa app
 * che non ha un posto naturale in cui aspettarla — chi entra senza
 * prenotazione arriva mentre stai battendo una comanda, non mentre guardi la
 * sala — e prima stava in cima alla Sala, cioè a due tocchi e uno
 * scorrimento da dove si era.
 *
 * Sta **al centro** perché è il punto della barra che il pollice raggiunge
 * senza spostare la mano, e perché il centro era vuoto: con quattro voci su
 * quattro quinti di schermo restava un buco in mezzo che non faceva niente.
 * Il tondo è crema pieno e non ha etichetta sotto: le voci che portano
 * altrove hanno un nome, l'azione ha una forma — e le **impronte** sono la
 * forma che in sala si cerca senza leggere.
 *
 * Compare solo con `manage_tables`: un commis che non può accomodare non
 * deve trovare in mezzo alla barra un pulsante che gli risponde di no. In
 * cucina non compare per la stessa regola, senza una riga in più.
 *
 * ## Il colore dell'attivo
 *
 * Crema pieno su fondo verde, non terracotta. Il terracotta nel sistema è
 * l'accento di ciò che **avvisa**, e in questa app avvisa qualcosa di preciso
 * — un piatto pronto, un conto chiesto. Usarlo anche per «sei qui» toglierebbe
 * all'avviso la sua unica distinzione.
 *
 * ## La forma dell'attivo: una pastiglia, non un filo
 *
 * Era una riga da due pixel appoggiata sul bordo superiore della voce.
 * Appoggiata è la parola giusta: non toccava l'icona, non toccava il testo,
 * e sul bordo della barra si leggeva come un pezzo del bordo stesso venuto
 * male — §14 del brief la chiama «una linea che sembra casualmente
 * appoggiata sopra il menu», ed è esattamente quello che era.
 *
 * Adesso è una **pastiglia dietro l'icona**: un ovale in verde alzato che
 * contiene il simbolo. Sta *dentro* la voce invece che sopra, si vede senza
 * cercarla anche con lo schermo al sole, e non aggiunge nessun colore nuovo
 * — è la stessa superficie che il sistema usa per i pill inattivi, con
 * sopra il crema pieno.
 */
export function NavBasso({
  profilo,
  permessi,
  /** Quante notifiche non lette: il pallino sulla voce Comande. */
  daVedere = 0,
}: {
  profilo: ProfiloStaff;
  permessi: PermessoStaff[];
  daVedere?: number;
}) {
  const percorso = usePathname();
  const router = useRouter();
  const avvisi = useAvvisi();
  const [walkIn, setWalkIn] = useState(false);
  const voci = vociPer(profilo, permessi);

  const puoAccomodare = permessi.includes("manage_tables");
  /* Il centro fra le voci: con quattro, fra la seconda e la terza. */
  const meta = Math.floor(voci.length / 2);

  return (
    <nav
      aria-label="Navigazione"
      className="fissa sticky bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex items-stretch">
        {voci.map((voce, indice) => {
          const Icon = voce.icon;
          const attiva = voceAttiva(percorso, voce);
          const conBollino = voce.href === "/staff-app/comande" && daVedere > 0;

          return (
            /* Il frammento porta la chiave perché è la radice dell'elemento
               mappato: senza, React non sa distinguere le voci fra loro. */
            <Fragment key={voce.href}>
              {puoAccomodare && indice === meta && <TastoWalkIn onClick={() => setWalkIn(true)} />}

              <li className="flex-1">
              <Link
                href={voce.href}
                aria-current={attiva ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[72px] flex-col items-center justify-center gap-1 px-1 pb-2 pt-1.5 text-[0.75rem] leading-tight transition-colors",
                  attiva ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-[3.25rem] items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
                    attiva && "bg-secondary",
                  )}
                >
                  <Icon className="h-6 w-6 shrink-0" strokeWidth={attiva ? 2 : 1.75} aria-hidden="true" />
                  {conBollino && (
                    <span
                      className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground"
                      aria-label={`${daVedere} da vedere`}
                    >
                      {daVedere > 9 ? "9+" : daVedere}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center">{voce.label}</span>
              </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>

      {/*
        Il foglio sta qui e non nelle pagine: da qui è raggiungibile da tutte,
        e una copia per schermata sarebbe la solita copia che dopo un mese non
        si somiglia più.

        Dopo un walk-in, `router.refresh()` ricalcola la pagina del server
        sotto. La Sala, che tiene la sua fotografia in stato, la riprende con
        il giro successivo della sonda — al massimo cinque secondi, esattamente
        come vedrebbe il walk-in fatto da un collega su un altro telefono.
      */}
      <FoglioWalkIn
        aperto={walkIn}
        onChiudi={() => setWalkIn(false)}
        onFatto={(messaggio) => {
          setWalkIn(false);
          avvisi.mostra(messaggio);
          router.refresh();
        }}
      />
    </nav>
  );
}

/**
 * Il tondo centrale.
 *
 * Senza etichetta e con `aria-label`: l'icona è distintiva e il testo sotto
 * avrebbe costretto a rimpicciolire il tondo — cioè a rendere più piccolo il
 * bersaglio proprio dell'unica **azione** della barra. Il mezzo pixel di
 * traslazione lo solleva appena dalla riga delle voci: quanto basta a dire
 * che non è una di loro, non tanto da sembrare appiccicato sopra.
 */
function TastoWalkIn({ onClick }: { onClick: () => void }) {
  return (
    <li className="flex-1">
      <button
        type="button"
        onClick={onClick}
        aria-label="Registra un walk-in"
        className="sa-tocco flex min-h-[72px] w-full items-center justify-center px-1"
      >
        <span className="flex h-[3.25rem] w-[3.25rem] -translate-y-0.5 items-center justify-center rounded-full bg-cream text-clay-ink shadow-lg">
          <Footprints className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}
