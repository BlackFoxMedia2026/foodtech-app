"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  /** Il permesso del microfono è bloccato: si dice, e si dà da premere. */
  | { tipo: "microfono" }
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
  /**
   * Com'è il permesso del microfono, **senza chiederlo**.
   *
   * `navigator.permissions` risponde senza far comparire niente: serve a
   * distinguere «bloccato» — che va detto, perché solo l'utente può
   * sbloccarlo dalle impostazioni del browser — da «non ancora chiesto», che
   * non è un problema: si chiede rispondendo.
   */
  const [permesso, setPermesso] = useState<
    "granted" | "denied" | "prompt" | "sconosciuto"
  >("sconosciuto");

  /**
   * Cosa ha risposto il browser all'ultimo tentativo sul microfono.
   *
   * Serve perche **un secondo rifiuto non cambia niente sullo schermo**: lo
   * stato era «bloccato» e resta «bloccato», e premere il pulsante sembrava
   * non fare nulla. Era esattamente cosi: questa riga non c'era, e
   * l'indicatore mostrava «Microfono spento» **coprendo** il guasto che il
   * tentativo aveva scritto.
   */
  const [rispostaMicrofono, setRispostaMicrofono] = useState<string | null>(null);

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
    let stato: PermissionStatus | null = null;

    void navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (!vivo) return;
        stato = p;
        setPermesso(p.state);
        /* Cambia mentre la pagina è aperta: uno che concede il permesso dalle
           impostazioni del browser non deve ricaricare per vederlo. */
        p.onchange = () => setPermesso(p.state);
      })
      .catch(() => {
        /* Firefox non espone «microphone» a `permissions.query`: non è un
           guasto, è un'informazione che non abbiamo — e allora non si dice
           niente e si chiede al momento di rispondere. */
      });

    return () => {
      vivo = false;
      if (stato) stato.onchange = null;
    };
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

      /*
        **Il microfono non si chiede qui**, e la prima versione lo faceva.

        Chiedeva `getUserMedia` al caricamento, per non far comparire la
        finestra del permesso mentre il telefono squilla. Il ragionamento era
        giusto quando questo riquadro viveva sulla pagina del Telefono — una
        pagina che si apre di proposito. Da quando sta nel guscio, quella
        richiesta parte a **ogni caricamento di ogni pagina**, senza che
        nessuno abbia toccato niente: Chrome tratta male le richieste che non
        seguono un gesto, e dopo uno scarto — o una richiesta partita mentre la
        scheda non era a fuoco — blocca in silenzio e non chiede più. Il
        risultato è quello che ha visto Luca: «Non collegato, manca il
        permesso» e **nessuna finestra** da cui concederlo. Su miocentralino
        funzionava perché lì il softphone sta su una pagina sua.

        Adesso: la registrazione non ha bisogno del microfono e parte senza
        toccarlo. Il permesso si chiede **quando si premono «Rispondi»** — un
        gesto vero, e la finestra compare — oppure in anticipo dal passo 4
        della procedura, con un pulsante. Chi segue la procedura non incontra
        la finestra durante una telefonata.
      */
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

  /**
   * Chiede il microfono. Restituisce `false` se non l'abbiamo.
   *
   * Si chiama da un gesto — «Rispondi», o il pulsante della procedura — perché
   * è l'unico modo in cui la finestra del permesso compare in modo
   * affidabile. Il flusso si chiude subito: serviva il permesso, e sip.js
   * aprirà il suo.
   */
  const chiediMicrofono = useCallback(async (): Promise<boolean> => {
    setRispostaMicrofono(null);
    try {
      const flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of flusso.getTracks()) t.stop();
      setPermesso("granted");
      return true;
    } catch (err) {
      /*
        **Il nome dell'errore dice cosa fare**, e sono tre cose diverse.

        Prima erano una sola: `catch {}` senza guardare, `permesso = "denied"`
        e un messaggio sul permesso. Un computer **senza microfono** veniva
        quindi mandato nelle impostazioni del browser a concedere un permesso
        che era già concesso — e il microfono continuava a non esserci.
      */
      const nome = err instanceof DOMException ? err.name : "";
      const senzaMicrofono = nome === "NotFoundError" || nome === "DevicesNotFoundError";
      const occupato = nome === "NotReadableError" || nome === "TrackStartError";

      setRispostaMicrofono(
        senzaMicrofono
          ? "Questo computer non ha un microfono: il browser non ne trova nessuno. Serve una cuffia o un microfono collegato."
          : occupato
            ? "Il microfono c'è ma è occupato da un'altra applicazione, o bloccato dal sistema. Su Mac: Impostazioni di Sistema → Privacy e sicurezza → Microfono."
            : "Il browser ha detto no senza chiedere niente. I posti da controllare sono due, in quest'ordine: 1) questo sito — l'icona a sinistra dell'indirizzo → Microfono → Consenti, poi ricarica; 2) su Mac, se lì era già «Consenti», Impostazioni di Sistema → Privacy e sicurezza → Microfono → Chrome acceso.",
      );

      /* «Bloccato» solo quando lo è davvero: un microfono che non c'è non è un
         permesso negato, e segnarlo tale manderebbe a cercare nel posto
         sbagliato. */
      if (!senzaMicrofono && !occupato) setPermesso("denied");

      setStato((p) =>
        p.tipo === "squilla" || p.tipo === "in-chiamata"
          ? p
          : { tipo: "guasto", perche: "Senza microfono non si può rispondere." },
      );
      return false;
    }
  }, []);

  async function rispondi() {
    const s = sessioneRef.current;
    if (!s) return;
    /* Il permesso si chiede **adesso**, con il dito ancora sul pulsante: è
       quello che fa comparire la finestra. Se si dice no, la chiamata resta
       che squilla — non si rifiuta per conto di nessuno. */
    if (permesso !== "granted" && !(await chiediMicrofono())) return;
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
  /* Il microfono bloccato si vede **anche da fermi**: è l'unico guasto che
     rompe la risposta prima che il telefono squilli, e scoprirlo con una
     persona in linea è troppo tardi. Sparisce nel momento in cui si concede
     il permesso. */
  /*
    Il microfono bloccato si dice **una volta per schermata**.

    Nella procedura di collegamento c'è già il suo controllo, con la spiegazione
    accanto: mostrare anche questo pannello vorrebbe dire due pulsanti per la
    stessa cosa a mezzo centimetro l'uno dall'altro — e chi ne vede due si
    chiede quale sia quello giusto. Su tutte le altre schermate il pannello è
    l'unico posto dove possa comparire, e allora compare.

    Trovato da una prova end-to-end che si è rotta con «due elementi»: è il
    genere di doppione che a occhio non si nota, perché i due pulsanti hanno
    parole diverse.
  */
  const percorso = usePathname();
  const nellaProcedura = percorso === "/settings/telefono/collega";
  const microfonoBloccato = permesso === "denied" && !nellaProcedura;
  const zitto =
    discreto &&
    !microfonoBloccato &&
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

      <Indicatore stato={microfonoBloccato ? { tipo: "microfono" } : stato} />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* Il permesso si concede **da qui**, con un clic.
        
            Prima la riga diceva soltanto «manca il permesso», e chi la leggeva
            non aveva niente da premere: la richiesta del browser era già stata
            bloccata in silenzio, e l'unica strada era le impostazioni di
            Chrome. Un cliente non ci va, e ha ragione. Questo pulsante è un
            gesto, ed è l'unica cosa che fa ricomparire la finestra. */}
        {/*
          Qui **non c'è nessun pulsante**, ed è la correzione.

          C'era «Attiva il microfono», e non poteva funzionare: quando il
          browser ha già bloccato un sito, `getUserMedia` rifiuta senza
          chiedere niente — nessuna finestra, nessun modo di farla ricomparire
          da dentro la pagina. Premerlo non cambiava nemmeno una parola sullo
          schermo, perché lo stato era già «bloccato» e l'indicatore copriva la
          risposta del tentativo. Luca l'ha premuto tre volte in due giorni.

          Un pulsante che non può riuscire è peggio della sua assenza: fa
          credere che il problema sia altrove e nasconde l'unica strada che
          c'è. Quindi si dice **dove** si sblocca, con i clic esatti — e il
          pulsante resta solo dove serve davvero: nella procedura di
          collegamento, quando il permesso è ancora da chiedere
          (`PermessoMicrofono`).
        */}
        {(microfonoBloccato || stato.tipo === "guasto") && (
          <>
            {/*
              **«Controlla», non «Attiva»**, e la parola è la correzione.

              «Attiva il microfono» promette una finestra che non arriverà: se
              il browser ha già bloccato il sito, `getUserMedia` rifiuta senza
              chiedere niente e da dentro la pagina non c'è modo di riaprirla.
              Premerlo non cambiava nemmeno una parola sullo schermo — lo stato
              era già «bloccato» e l'indicatore copriva la risposta del
              tentativo. Luca l'ha premuto tre volte in due giorni.

              Ma il pulsante **non va togliuto**, e la ragione l'ha detta un
              test: `permissions.query` risponde «bloccato» anche dove **manca
              il microfono**, e le due cose portano a gesti opposti. Un clic le
              distingue — è l'unico modo — e allora il pulsante serve: non a
              sbloccare, a *sapere*. Quello che cambia è che adesso una
              risposta arriva sempre.
            */}
            <Button variant="accent" size="sm" onClick={chiediMicrofono}>
              <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Controlla il microfono
            </Button>
            {microfonoBloccato && (
              <span className="t-nota max-w-[22rem]">
                {/* Due posti e non uno, ed e la correzione: su Mac il permesso
                    del sito e quello di sistema sono **due** interruttori, e
                    mandare a girare solo il primo lascia chi ha il secondo
                    spento a girarlo per niente — poi ci chiama. */}
                Da controllare in quest&apos;ordine: <strong>1)</strong> questo sito —
                l&apos;icona a sinistra dell&apos;indirizzo (il lucchetto o i due cursori) →{" "}
                <strong>Microfono</strong> → <strong>Consenti</strong>, poi ricarica;{" "}
                <strong>2)</strong> su Mac, se lì era già «Consenti», Impostazioni di
                Sistema → Privacy e sicurezza → Microfono → Chrome acceso.
              </span>
            )}
          </>
        )}

        {/* Cosa ha risposto il browser: è la riga che prima non c'era, e la
            sua assenza è il motivo per cui il clic sembrava non fare niente. */}
        {rispostaMicrofono && (
          <span className="t-nota max-w-[22rem] text-destructive-soft">
            {rispostaMicrofono}
          </span>
        )}
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
    case "microfono":
      return (
        <span className="flex min-w-0 items-center gap-2">
          <Badge tone="warning" className="gap-1">
            <MicOff className="h-3 w-3" aria-hidden="true" />
            Microfono spento
          </Badge>
          <span className="t-nota">Senza microfono non si può rispondere.</span>
        </span>
      );
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
