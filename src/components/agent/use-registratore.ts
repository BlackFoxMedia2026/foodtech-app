"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Oltre questo il vocale si ferma da solo: la soglia del server è più larga. */
const DURATA_MASSIMA_MS = 120_000;

export type StatoRegistratore = "fermo" | "registra" | "trascrive";

/**
 * Registra dal microfono e trascrive sul server (`/api/agent/trascrivi`).
 *
 * Non usa il riconoscimento vocale del browser: nella finestra dell'app
 * Android (WebView) non esiste, e l'app è il posto dove serve di più.
 * `MediaRecorder` invece c'è ovunque, e la trascrizione è la stessa per tutti.
 *
 * `livelli` sono le ultime barre del volume (0–1), per disegnare l'onda mentre
 * si parla: senza, chi registra non sa se il telefono lo sente.
 */
export function useRegistratore() {
  const [stato, setStato] = useState<StatoRegistratore>("fermo");
  const [livelli, setLivelli] = useState<number[]>(() => Array(24).fill(0));
  const [secondi, setSecondi] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const pezzi = useRef<Blob[]>([]);
  const flusso = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const inizio = useRef(0);
  /** Chi aspetta il testo: si risolve allo stop, con `null` se annullato. */
  const attesa = useRef<((b: Blob | null) => void) | null>(null);

  const pulisci = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    if (timer.current) window.clearTimeout(timer.current);
    frame.current = null;
    timer.current = null;
    flusso.current?.getTracks().forEach((t) => t.stop());
    flusso.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLivelli(Array(24).fill(0));
  }, []);

  useEffect(() => pulisci, [pulisci]);

  const avvia = useCallback(async () => {
    setErrore(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      // Su http (il gestionale aperto dall'indirizzo del computer, in
      // sviluppo) il browser non dà il microfono a nessuno.
      setErrore(
        window.isSecureContext
          ? "Questo dispositivo non permette di registrare."
          : "Il microfono funziona solo su una connessione sicura (https).",
      );
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      flusso.current = stream;

      const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pezzi.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pezzi.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(pezzi.current, { type: rec.mimeType || "audio/webm" });
        attesa.current?.(blob);
        attesa.current = null;
      };
      rec.start(250);
      recorder.current = rec;

      // Il volume, per l'onda: un analizzatore sul flusso, letto a ogni frame.
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analizzatore = ctx.createAnalyser();
      analizzatore.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analizzatore);
      const dati = new Uint8Array(analizzatore.frequencyBinCount);
      let ultimo = 0;
      const leggi = (t: number) => {
        if (t - ultimo > 70) {
          ultimo = t;
          analizzatore.getByteTimeDomainData(dati);
          let somma = 0;
          for (const v of dati) somma += ((v - 128) / 128) ** 2;
          const rms = Math.min(1, Math.sqrt(somma / dati.length) * 4);
          setLivelli((prev) => [...prev.slice(1), rms]);
          setSecondi(Math.floor((performance.now() - inizio.current) / 1000));
        }
        frame.current = requestAnimationFrame(leggi);
      };
      inizio.current = performance.now();
      setSecondi(0);
      frame.current = requestAnimationFrame(leggi);

      timer.current = window.setTimeout(() => {
        if (recorder.current?.state === "recording") recorder.current.stop();
      }, DURATA_MASSIMA_MS);

      setStato("registra");
      return true;
    } catch {
      pulisci();
      setErrore("Non ho accesso al microfono. Controlla i permessi e riprova.");
      return false;
    }
  }, [pulisci]);

  /** Ferma e trascrive. Torna il testo, o `null` se non c'è niente da usare. */
  const conferma = useCallback(async (): Promise<string | null> => {
    const rec = recorder.current;
    if (!rec) return null;

    const blob = await new Promise<Blob | null>((resolve) => {
      if (rec.state === "inactive") {
        resolve(new Blob(pezzi.current, { type: rec.mimeType || "audio/webm" }));
        return;
      }
      attesa.current = resolve;
      rec.stop();
    });
    recorder.current = null;
    pulisci();
    if (!blob || blob.size === 0) {
      setStato("fermo");
      return null;
    }

    setStato("trascrive");
    try {
      const estensione = blob.type.includes("mp4") ? "m4a" : "webm";
      const form = new FormData();
      form.append("audio", new File([blob], `vocale.${estensione}`, { type: blob.type }));
      const res = await fetch("/api/agent/trascrivi", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrore(data.message ?? "Non sono riuscito a trascrivere. Riprova.");
        return null;
      }
      return (data.testo as string) || null;
    } catch {
      setErrore("Non sono riuscito a trascrivere. Riprova.");
      return null;
    } finally {
      setStato("fermo");
    }
  }, [pulisci]);

  /** Butta via la registrazione, senza trascrivere. */
  const annulla = useCallback(() => {
    attesa.current = null;
    const rec = recorder.current;
    recorder.current = null;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    pulisci();
    setStato("fermo");
  }, [pulisci]);

  return { stato, livelli, secondi, errore, setErrore, avvia, conferma, annulla };
}
