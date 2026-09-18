"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CapacitaVoice } from "@/lib/voice-capacita";

/**
 * Rispondere al telefono dentro Tavolo.
 *
 * ## Fa una cosa
 *
 * **Risponde.** Non compone, non trasferisce, non mette in attesa, non
 * registra. Non è una versione ridotta da completare: in un ristorante il
 * telefono squilla e qualcuno risponde. Comporre si fa dal telefono che si ha
 * in tasca; code, trasferimenti e risponditori sono il mestiere del
 * centralino, e questo non lo rifà.
 *
 * Quattro pulsanti in croce invece di dodici mezzi funzionanti: chi ha una
 * mano occupata e una persona davanti non cerca.
 *
 * ## Perché sip.js si carica solo quando serve
 *
 * `import()` dentro l'effetto e non in cima al file: la libreria pesa
 * centinaia di kilobyte, e la pagina del Telefono si apre anche solo per
 * guardare chi ha chiamato. Chi non ha il telefono configurato non la scarica
 * affatto.
 *
 * ## I comandi seguono le capacità del fornitore
 *
 * Quello che il fornitore non sa fare **non compare**. Le capacità arrivano da
 * `server/voice/provider.ts`, dove ogni fornitore le dichiara una per una e il
 * valore di partenza è «no». Oggi: si risponde e si chiude, non si trasferisce
 * e non si mette in attesa — il centralino saprebbe farlo, ma non espone
 * niente a Tavolo per farlo, e un pulsante che non funziona è peggio della sua
 * assenza.
 *
 * ## Cosa si dichiara invece di nascondere
 *
 * - **il microfono negato**: il browser chiede il permesso, e se si dice no il
 *   telefono non può funzionare. Si dice, invece di restare in attesa;
 * - **la registrazione caduta**: una rete che salta scollega il telefono, e uno
 *   schermo che continua a dire «pronto» mentre nessuno squilla è la bugia
 *   peggiore che questa pagina possa raccontare;
 * - **l'audio in una direzione sola** non lo sappiamo rilevare, e il centralino
 *   lo dice nella sua configurazione (TURN). Qui non si finge di saperlo.
 */

type Stato =
  | { tipo: "spento" }
  | { tipo: "collego" }
  | { tipo: "pronto" }
  | { tipo: "squilla"; da: string | null }
  | { tipo: "in-chiamata"; da: string | null; da_quando: number }
  | { tipo: "guasto"; perche: string };

/** Il minimo che serve da sip.js, senza tirarci dentro i suoi tipi. */
type Sessione = {
  accept: (opzioni?: unknown) => Promise<void>;
  bye: () => Promise<void>;
  reject: () => Promise<void>;
  sessionDescriptionHandler?: {
    peerConnection?: RTCPeerConnection | null;
  } | null;
  remoteIdentity?: {
    uri?: { user?: string | null } | null;
    displayName?: string | null;
  } | null;
  state?: string;
};

export function TelefonoBrowser({
  capacita,
  discreto = false,
}: {
  capacita: CapacitaVoice;
  /**
   * Sta **addosso a chi lavora**, non su una pagina.
   *
   * Da quando il telefono si risponde dentro Tavolo — e miocentralino serve
   * solo a consegnare licenze e collegamenti — questo componente è montato nel
   * guscio: vive su qualunque schermata. Ma un riquadro che dice «pronto» in
   * cima a ogni pagina, tutto il giorno, è la cosa che si impara a non
   * guardare.
   *
   * Con `discreto` il telefono **non si vede finché non serve**: compare
   * quando squilla, mentre si parla, e quando è **guasto** — quest'ultimo
   * perché uno schermo che tace mentre il telefono non è collegato è la bugia
   * peggiore che questa funzione possa raccontare.
   */
  discreto?: boolean;
}) {
  const [stato, setStato] = useState<Stato>({ tipo: "spento" });
  const [muto, setMuto] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uaRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const sessioneRef = useRef<Sessione | null>(null);

  /** Attacca l'audio della chiamata all'elemento nascosto della pagina. */
  const collegaAudio = useCallback((sessione: Sessione) => {
    const pc = sessione.sessionDescriptionHandler?.peerConnection;
    const audio = audioRef.current;
    if (!pc || !audio) return;

    const flusso = new MediaStream();
    for (const r of pc.getReceivers()) {
      if (r.track && r.track.kind === "audio") flusso.addTrack(r.track);
    }
    audio.srcObject = flusso;
    /* `play()` può essere rifiutato se il browser non ha ancora visto un
       gesto dell'utente. Qui il gesto c'è — si è premuto «Rispondi» — ma su
       una risposta automatica non ci sarebbe, e un `catch` muto è meglio di
       un errore non gestito che ferma il resto. */
    void audio.play().catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;

    async function avvia() {
      setStato({ tipo: "collego" });

      const res = await fetch("/api/venue/centralino/sip", {
        cache: "no-store",
      });
      if (!vivo) return;
      if (!res.ok) {
        setStato({
          tipo: "guasto",
          perche:
            res.status === 404
              ? "Il telefono nel browser non è ancora configurato su questo locale."
              : "Non riesco a leggere i dati del telefono.",
        });
        return;
      }
      const cred = (await res.json()) as {
        server: string;
        utente: string;
        password: string;
        uri: string;
      };

      /* Il microfono si chiede **prima** di registrarsi: se si chiedesse alla
         prima chiamata, la finestra del permesso comparirebbe mentre il
         telefono squilla, e la chiamata si perderebbe mentre si legge. */
      try {
        const flusso = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Si chiude subito: serviva solo il permesso. sip.js riaprirà il suo.
        for (const t of flusso.getTracks()) t.stop();
      } catch {
        if (!vivo) return;
        setStato({
          tipo: "guasto",
          perche:
            "Il browser non ha il permesso di usare il microfono. Senza microfono non si può rispondere.",
        });
        return;
      }

      const { UserAgent, Registerer, RegistererState } = await import("sip.js");
      if (!vivo) return;

      const ua = new UserAgent({
        uri: UserAgent.makeURI(cred.uri)!,
        transportOptions: { server: cred.server },
        authorizationUsername: cred.utente,
        authorizationPassword: cred.password,
        /* Nessun video: un ristorante non videochiama, e chiedere la
           telecamera farebbe comparire un permesso che non serve. */
        sessionDescriptionHandlerFactoryOptions: {
          constraints: { audio: true, video: false },
        },
        delegate: {
          onInvite: (invito) => {
            const sessione = invito as unknown as Sessione;
            sessioneRef.current = sessione;
            const da =
              sessione.remoteIdentity?.displayName ||
              sessione.remoteIdentity?.uri?.user ||
              null;
            setStato({ tipo: "squilla", da });
          },
          onDisconnect: () => {
            /* La rete è caduta. Non si resta a dire «pronto»: uno schermo che
               dice pronto mentre nessuno squilla è la bugia peggiore. */
            if (vivo)
              setStato({
                tipo: "guasto",
                perche: "Il telefono si è scollegato.",
              });
          },
        },
      });

      uaRef.current = { stop: () => ua.stop() };
      await ua.start();
      if (!vivo) return;

      const registerer = new Registerer(ua);
      registerer.stateChange.addListener((s) => {
        if (!vivo) return;
        if (s === RegistererState.Registered) {
          setStato((precedente) =>
            precedente.tipo === "squilla" || precedente.tipo === "in-chiamata"
              ? precedente
              : { tipo: "pronto" },
          );
        } else if (s === RegistererState.Unregistered) {
          setStato((precedente) =>
            precedente.tipo === "squilla" || precedente.tipo === "in-chiamata"
              ? precedente
              : {
                  tipo: "guasto",
                  perche: "Il telefono non è registrato sul centralino.",
                },
          );
        }
      });
      await registerer.register();
    }

    void avvia().catch((err: unknown) => {
      if (!vivo) return;
      setStato({
        tipo: "guasto",
        perche:
          err instanceof Error
            ? err.message
            : "Non riesco a collegare il telefono.",
      });
    });

    return () => {
      vivo = false;
      void uaRef.current?.stop().catch(() => {});
      uaRef.current = null;
    };
  }, []);

  async function rispondi() {
    const s = sessioneRef.current;
    if (!s) return;
    await s.accept();
    collegaAudio(s);
    setStato((p) => ({
      tipo: "in-chiamata",
      da: p.tipo === "squilla" ? p.da : null,
      da_quando: Date.now(),
    }));
  }

  async function chiudi() {
    const s = sessioneRef.current;
    if (!s) return;
    /* Rifiutare e chiudere sono due cose diverse per il centralino: la prima
       è «non rispondo» (e la chiamata può andare al risponditore o al
       cellulare), la seconda è «ho finito». Mandare quella sbagliata fa
       finire una chiamata che doveva rimbalzare. */
    if (stato.tipo === "squilla") await s.reject().catch(() => {});
    else await s.bye().catch(() => {});
    sessioneRef.current = null;
    setStato({ tipo: "pronto" });
    setMuto(false);
  }

  function cambiaMuto() {
    const pc = sessioneRef.current?.sessionDescriptionHandler?.peerConnection;
    if (!pc) return;
    const prossimo = !muto;
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === "audio") sender.track.enabled = !prossimo;
    }
    setMuto(prossimo);
  }

  /* Quando non c'è niente da dire, non c'è niente da vedere — ma l'elemento
     audio resta nel DOM: creato al volo in JavaScript viene bloccato più
     spesso dalle politiche di riproduzione automatica, e senza di lui la
     prima chiamata risponde muta. */
  const zitto =
    discreto &&
    (stato.tipo === "spento" ||
      stato.tipo === "collego" ||
      stato.tipo === "pronto");

  if (zitto) return <audio ref={audioRef} className="hidden" />;

  return (
    <div className="riquadro flex flex-wrap items-center gap-3 bg-card p-3 shadow-lg">
      {/* L'audio della chiamata. Nascosto ma nel DOM: un elemento creato al
          volo in JavaScript viene bloccato più spesso dalle politiche di
          riproduzione automatica. */}
      <audio ref={audioRef} className="hidden" />

      <Indicatore stato={stato} />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {stato.tipo === "squilla" && (
          <>
            <Button variant="accent" size="sm" onClick={rispondi}>
              <Phone className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Rispondi
            </Button>
            <Button variant="outline" size="sm" onClick={chiudi}>
              Non rispondo
            </Button>
          </>
        )}

        {stato.tipo === "in-chiamata" && (
          <>
            {/*
              Trasferire e mettere in attesa **non compaiono** se il fornitore
              non li sa fare, e oggi non li sa fare nessuno.

              Non compaiono spenti e non compaiono con «in arrivo»: un pulsante
              «Trasferisci» che non trasferisce lo si premo con una persona in
              linea, e si resta lì ad aspettare. Il giorno in cui il centralino
              espone il trasferimento, si cambia una riga in
              `server/voice/provider.ts` e il pulsante appare qui.
            */}
            {capacita.trasferimento && (
              <Button variant="outline" size="sm" disabled>
                Trasferisci
              </Button>
            )}
            {capacita.attesa && (
              <Button variant="outline" size="sm" disabled>
                Attesa
              </Button>
            )}
            {/* Il muto è **locale**: si spegne il microfono nel browser, e non
                serve niente dal fornitore. Per questo non ha una capacità. */}
            <Button variant="outline" size="sm" onClick={cambiaMuto}>
              {muto ? (
                <MicOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
              ) : (
                <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              {muto ? "Riattiva" : "Muto"}
            </Button>
            <Button variant="destructive" size="sm" onClick={chiudi}>
              <PhoneOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Chiudi
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Indicatore({ stato }: { stato: Stato }) {
  switch (stato.tipo) {
    case "spento":
    case "collego":
      return <span className="t-nota">Collego il telefono…</span>;
    case "pronto":
      return (
        <span className="flex items-center gap-2">
          <Badge tone="success">
            <Phone className="mr-1 h-3 w-3" aria-hidden="true" />
            Pronto
          </Badge>
          <span className="t-nota">Le chiamate squillano qui.</span>
        </span>
      );
    case "squilla":
      return (
        <span className="flex items-center gap-2">
          <Badge tone="warning">Sta squillando</Badge>
          <span className="text-sm font-medium tabular-nums">
            {stato.da ?? "numero riservato"}
          </span>
        </span>
      );
    case "in-chiamata":
      return (
        <span className="flex items-center gap-2">
          <Badge tone="success">Al telefono</Badge>
          <span className="text-sm font-medium tabular-nums">
            {stato.da ?? "in linea"}
          </span>
        </span>
      );
    case "guasto":
      return (
        <span className="flex min-w-0 items-center gap-2">
          <Badge tone="danger" className="gap-1">
            <WifiOff className="h-3 w-3" aria-hidden="true" />
            Non collegato
          </Badge>
          {/* Il motivo, non «errore»: «manca il permesso del microfono» si
              risolve in dieci secondi, «errore» si risolve con una chiamata a
              noi. */}
          <span className="t-nota">{stato.perche}</span>
        </span>
      );
  }
}
