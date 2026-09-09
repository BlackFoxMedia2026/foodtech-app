"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Ogni quanto si chiede «è cambiato qualcosa?». */
const CONTROLLO_MS = 5_000;

/**
 * Rete che salta: si aspetta un po' di più prima di riprovare, invece di
 * bombardare un server che non risponde. Raddoppia fino a un minuto.
 */
const ATTESA_MINIMA_MS = 5_000;
const ATTESA_MASSIMA_MS = 60_000;

/* -------------------------------------------------------------------------- */
/*  La sonda condivisa                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Una sola sonda per pagina, non una per componente.
 *
 * Da quando la lista d'attesa e la sala viva stanno affiancate sullo stesso
 * schermo, due componenti chiedono la stessa cosa: due richieste ogni cinque
 * secondi per una risposta identica. Il registro qui sotto tiene una sola
 * interrogazione e la distribuisce a chi si è iscritto — così affiancare due
 * viste costa quanto tenerne una.
 *
 * Sta a livello di modulo e non in un contesto React di proposito: non
 * richiede di avvolgere niente, e un componente che finisce in una pagina
 * dove non c'è nessun altro funziona esattamente allo stesso modo.
 */
type Iscritto = () => void | Promise<void>;

const iscritti = new Set<Iscritto>();
let versione: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let attesa = ATTESA_MINIMA_MS;
let inVolo = false;

async function controlla() {
  timer = null;
  if (iscritti.size === 0) return;

  if (document.visibilityState !== "visible") {
    // Un tablet nel cassetto non interroga il server.
    programma(CONTROLLO_MS);
    return;
  }
  if (inVolo) {
    programma(CONTROLLO_MS);
    return;
  }

  inVolo = true;
  try {
    const res = await fetch("/api/servizio-versione", { cache: "no-store" });
    if (res.ok) {
      const { v } = (await res.json()) as { v: string };
      attesa = ATTESA_MINIMA_MS;
      // Il primo giro registra solo la versione: la fotografia è quella che il
      // server ha già reso, e riscaricarla subito sarebbe una richiesta
      // buttata.
      if (versione === null) versione = v;
      else if (v !== versione) {
        versione = v;
        await Promise.all([...iscritti].map((f) => f()));
      }
    } else {
      attesa = Math.min(ATTESA_MASSIMA_MS, attesa * 2);
    }
  } catch {
    attesa = Math.min(ATTESA_MASSIMA_MS, attesa * 2);
  } finally {
    inVolo = false;
  }

  programma(attesa);
}

function programma(ms: number) {
  if (timer !== null || iscritti.size === 0) return;
  timer = setTimeout(controlla, ms);
}

function fermaSeNessuno() {
  if (iscritti.size === 0 && timer !== null) {
    clearTimeout(timer);
    timer = null;
    // La versione si azzera: alla prossima iscrizione si riparte da quella del
    // server, senza scaricare una fotografia che è già sullo schermo.
    versione = null;
    attesa = ATTESA_MINIMA_MS;
  }
}

/* -------------------------------------------------------------------------- */
/*  Il gancio                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Tiene una schermata di servizio aggiornata, chiedendo poco e spesso.
 *
 * Prima ogni schermata riscaricava la propria fotografia intera ogni trenta
 * secondi. Trenta secondi in sala sono lunghi: chi accomoda un tavolo e chi
 * guarda la mappa dall'altra parte della sala vedono due cose diverse per
 * mezzo minuto, e in mezzo minuto si porta una persona a un tavolo già
 * occupato.
 *
 * Qui si fa il contrario: si chiede **ogni cinque secondi** una cosa piccola
 * — un segnale che dice solo se qualcosa si è mosso — e si scarica la
 * fotografia **solo quando quel segnale cambia**. In un servizio tranquillo
 * sono cinque secondi di ritardo invece di trenta, e complessivamente meno
 * lavoro di prima.
 *
 * Quattro cose che questo gancio fa e che vanno tenute:
 *
 * - **Una sonda per pagina.** Due componenti affiancati non fanno due
 *   richieste: vedi il registro qui sopra.
 * - **Non chiede niente a scheda nascosta.** Si riparte, con un aggiornamento
 *   immediato, quando la scheda torna visibile — perché il servizio è andato
 *   avanti senza di noi.
 * - **Una richiesta alla volta per componente.** Se il caricamento è lento, il
 *   successivo non parte: due fotografie in volo tornano in ordine casuale, e
 *   la più vecchia può sovrascrivere la più nuova.
 * - **Se la rete salta, la fotografia resta.** Non si svuota la schermata: si
 *   tiene l'ultima buona con l'ora a cui è stata presa, e si riprova più
 *   piano.
 */
export function useServizioVivo(scarica: () => Promise<void>) {
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const [aggiornando, setAggiornando] = useState(false);

  const inCorso = useRef(false);
  // `scarica` cambia a ogni rendering nei componenti che la costruiscono con
  // useCallback su uno stato: tenerla in un riferimento evita di riscrivere
  // l'iscrizione a ogni battito.
  const scaricaRef = useRef(scarica);
  scaricaRef.current = scarica;

  const aggiornaOra = useCallback(async () => {
    if (inCorso.current) return;
    inCorso.current = true;
    setAggiornando(true);
    try {
      await scaricaRef.current();
      setUltimo(new Date());
    } finally {
      inCorso.current = false;
      setAggiornando(false);
    }
  }, []);

  useEffect(() => {
    const mio = () => aggiornaOra();
    iscritti.add(mio);
    programma(CONTROLLO_MS);
    return () => {
      iscritti.delete(mio);
      fermaSeNessuno();
    };
  }, [aggiornaOra]);

  // Tornando sulla scheda dopo una pausa non si aspetta il prossimo controllo:
  // si ricarica subito, e si riparte da quella versione.
  useEffect(() => {
    async function onVisible() {
      if (document.visibilityState !== "visible") return;
      versione = null;
      await aggiornaOra();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [aggiornaOra]);

  return { ultimo, aggiornando, aggiornaOra };
}
