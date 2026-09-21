"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAvvisi } from "@/components/ui/avvisi";
import type { TavoloStaff } from "@/server/staff-app/sala";
import { GrigliaTavoli } from "./griglia-tavoli";
import { FoglioTavoloLibero } from "./foglio-accomoda";
import { NessunTavolo, Sezione } from "./sezioni-home";

/**
 * **I tavoli in Home**, e il tocco che porta alle scelte.
 *
 * ## Il difetto che questo componente esiste per togliere
 *
 * In Home i tavoli disponibili erano collegamenti alla schermata del tavolo.
 * Toccare il sei posti libero apriva una pagina che diceva che su quel tavolo
 * non c'è nessuno: per accomodare qualcuno bisognava tornare indietro, andare
 * in Sala e ritoccarlo. Quattro tocchi per il gesto più frequente della
 * serata, e i primi tre non facevano niente.
 *
 * Adesso il tasto apre **le scelte**: accomoda chi aspetta, walk-in, vedi il
 * tavolo. Il foglio è lo stesso della Sala — `FoglioTavoloLibero` — perché
 * due fogli identici in due schermate sono due fogli che dopo un mese non si
 * somigliano più.
 *
 * I tavoli **occupati** restano collegamenti, e non è un'incoerenza: su un
 * tavolo con gente seduta la cosa che serve *è* aprirlo — comanda, note,
 * conto — e passare per un menu aggiungerebbe un tocco a un gesto che si fa
 * cinquanta volte a sera.
 *
 * ## Come si aggiorna, dopo
 *
 * `router.refresh()`: la Home è una pagina del server, e ricalcolarla è il
 * modo di vedere il tavolo appena occupato uscire da «disponibili» ed entrare
 * nei propri. Non serve nessuno stato locale da tenere allineato a mano.
 */
export function TavoliHome({
  miei,
  liberi,
  scala,
  inAttesa,
  puoAccomodare,
}: {
  miei: TavoloStaff[];
  liberi: TavoloStaff[];
  scala: number;
  /** Quanti ospiti aspettano: serve al foglio per dirlo sull'azione. */
  inAttesa: number;
  puoAccomodare: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [tavolo, setTavolo] = useState<TavoloStaff | null>(null);

  /** Le scelte solo sui liberi, e solo a chi può accomodare. */
  const apri = (t: TavoloStaff) => {
    if (puoAccomodare && t.stato === "LIBERO") setTavolo(t);
    else router.push(`/staff-app/tavolo/${t.tableId}`);
  };

  return (
    <>
      <Sezione titolo="I miei tavoli" azione={{ testo: "Sala", href: "/staff-app/sala" }}>
        {miei.length === 0 ? (
          <NessunTavolo />
        ) : (
          <GrigliaTavoli tavoli={miei} scala={scala} onTocca={apri} />
        )}
      </Sezione>

      {liberi.length > 0 && (
        /* Nessuna azione «Tutti i 12»: ci sono tutti, e un collegamento che
           promette il resto quando il resto è già sullo schermo è un
           collegamento che insegna a diffidare delle schermate. */
        <Sezione titolo="Tavoli disponibili">
          <GrigliaTavoli tavoli={liberi} scala={scala} onTocca={apri} />
        </Sezione>
      )}

      {tavolo && (
        <FoglioTavoloLibero
          tavolo={tavolo}
          inAttesa={inAttesa}
          aperto
          onChiudi={() => setTavolo(null)}
          onFatto={(messaggio) => {
            setTavolo(null);
            avvisi.mostra(messaggio);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
