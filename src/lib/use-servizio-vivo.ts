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
 * Tre cose che questo gancio fa e che vanno tenute:
 *
 * - **Non chiede niente a scheda nascosta.** Un tablet nel cassetto non deve
 *   interrogare il server: si riparte, con un aggiornamento immediato, quando
 *   la scheda torna visibile — perché il servizio è andato avanti senza di noi.
 * - **Una richiesta alla volta.** Se il caricamento è lento, il controllo
 *   successivo non parte: due fotografie in volo tornano in ordine casuale, e
 *   la più vecchia può sovrascrivere la più nuova.
 * - **Se la rete salta, la fotografia resta.** Non si svuota la schermata: si
 *   tiene l'ultima buona con l'ora a cui è stata presa, e si riprova più
 *   piano.
 */
export function useServizioVivo(scarica: () => Promise<void>) {
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const [aggiornando, setAggiornando] = useState(false);

  const versione = useRef<string | null>(null);
  const inCorso = useRef(false);
  const attesa = useRef(ATTESA_MINIMA_MS);
  // `scarica` cambia a ogni rendering nei componenti che la costruiscono con
  // useCallback su uno stato: tenerla in un riferimento evita di riavviare il
  // temporizzatore a ogni battito.
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
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    async function controlla() {
      if (!vivo) return;
      if (document.visibilityState !== "visible") {
        timer = setTimeout(controlla, CONTROLLO_MS);
        return;
      }
      try {
        const res = await fetch("/api/servizio-versione", { cache: "no-store" });
        if (res.ok) {
          const { v } = (await res.json()) as { v: string };
          attesa.current = ATTESA_MINIMA_MS;
          // Il primo giro registra solo la versione: la fotografia è quella
          // che il server ha già reso, e riscaricarla subito sarebbe una
          // richiesta buttata.
          if (versione.current === null) versione.current = v;
          else if (v !== versione.current) {
            versione.current = v;
            await aggiornaOra();
          }
        } else {
          attesa.current = Math.min(ATTESA_MASSIMA_MS, attesa.current * 2);
        }
      } catch {
        attesa.current = Math.min(ATTESA_MASSIMA_MS, attesa.current * 2);
      }
      if (vivo) timer = setTimeout(controlla, attesa.current);
    }

    timer = setTimeout(controlla, CONTROLLO_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [aggiornaOra]);

  // Tornando sulla scheda dopo una pausa non si aspetta il prossimo controllo:
  // si ricarica subito, e si riparte da quella versione.
  useEffect(() => {
    async function onVisible() {
      if (document.visibilityState !== "visible") return;
      versione.current = null;
      await aggiornaOra();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [aggiornaOra]);

  return { ultimo, aggiornando, aggiornaOra };
}
