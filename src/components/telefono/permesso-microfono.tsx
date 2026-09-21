"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Il permesso del microfono, **chiesto quando c'è un dito sul pulsante**.
 *
 * ## Il difetto che questo corregge
 *
 * Il telefono nel browser chiedeva il microfono al caricamento della pagina.
 * Da quando sta nel guscio — cioè su ogni schermata — quella richiesta parte
 * senza che nessuno abbia toccato niente: Chrome tratta male le richieste che
 * non seguono un gesto e, dopo uno scarto o una richiesta partita mentre la
 * scheda non era a fuoco, **blocca in silenzio**. Il risultato è la riga «manca
 * il permesso» e nessuna finestra da cui concederlo — e la strada che resta
 * sono le impostazioni di Chrome, dove un ristoratore non va (e ha ragione).
 *
 * Qui il permesso si concede durante la **configurazione**, con un pulsante:
 * un gesto, quindi la finestra compare. Chi segue la procedura non incontra
 * quella finestra mentre il telefono squilla.
 *
 * ## Legge lo stato senza chiederlo
 *
 * `navigator.permissions.query` risponde senza far comparire niente, e serve a
 * distinguere tre cose che vanno dette in tre modi diversi: **consentito** (non
 * c'è niente da fare), **da consentire** (un pulsante), **bloccato** (il
 * pulsante non basta più: va detto dove si sblocca). Firefox non risponde per
 * il microfono: in quel caso si mostra il pulsante e basta — chiedere è
 * l'unico modo di sapere.
 */
export function PermessoMicrofono() {
  const [stato, setStato] = useState<
    "granted" | "denied" | "prompt" | "sconosciuto"
  >("sconosciuto");
  const [inCorso, setInCorso] = useState(false);
  /**
   * Cosa ha risposto il browser all'ultimo tentativo.
   *
   * Serve perché **un secondo rifiuto non cambia niente sullo schermo**: lo
   * stato era «bloccato» e resta «bloccato», quindi premere il pulsante
   * sembra non fare nulla — ed è esattamente quello che è successo a Luca.
   * Adesso la risposta del browser si legge, e ogni rifiuto è un fatto nuovo
   * scritto in una riga nuova.
   */
  const [risposta, setRisposta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let permesso: PermissionStatus | null = null;
    void navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (!vivo) return;
        permesso = p;
        setStato(p.state);
        p.onchange = () => setStato(p.state);
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (permesso) permesso.onchange = null;
    };
  }, []);

  async function chiedi() {
    setInCorso(true);
    setRisposta(null);
    try {
      const flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
      /* Si chiude subito: serviva il permesso, non l'audio. Tenere aperto il
         microfono accenderebbe il pallino di registrazione del sistema su una
         pagina di impostazioni, che è il modo più veloce di far chiudere la
         pagina. */
      for (const t of flusso.getTracks()) t.stop();
      setStato("granted");
      setRisposta(null);
    } catch (err) {
      /*
        **Il nome dell'errore dice cosa fare**, e sono tre cose diverse.

        Un «non è stato possibile» generico manda a chiamare noi per una cosa
        che si risolve in dieci secondi, o fa cercare il difetto nel posto
        sbagliato: il microfono che non c'è e il microfono bloccato si
        assomigliano soltanto sullo schermo.
      */
      const nome = err instanceof DOMException ? err.name : "";
      setRisposta(
        nome === "NotFoundError" || nome === "DevicesNotFoundError"
          ? "Questo computer non ha un microfono: il browser non ne trova nessuno. Serve una cuffia o un microfono collegato."
          : nome === "NotReadableError" || nome === "TrackStartError"
            ? "Il microfono c'è ma è occupato o bloccato dal sistema: chiudi le altre applicazioni che lo usano, e su Mac controlla Impostazioni di Sistema → Privacy e sicurezza → Microfono."
            : "Il browser ha detto no senza chiedere niente. I posti da controllare sono due, in quest'ordine: 1) questo sito — l'icona a sinistra dell'indirizzo → Microfono → Consenti, poi ricarica; 2) su Mac, se lì era già «Consenti», Impostazioni di Sistema → Privacy e sicurezza → Microfono → Chrome acceso.",
      );
      setStato(
        nome === "NotFoundError" || nome === "DevicesNotFoundError"
          ? "sconosciuto"
          : "denied",
      );
    } finally {
      setInCorso(false);
    }
  }

  if (stato === "granted") {
    return (
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone="success">
          <Mic className="mr-1 h-3 w-3" aria-hidden="true" />
          Microfono consentito
        </Badge>
        <span className="t-nota">
          Questo browser può rispondere alle chiamate.
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={stato === "denied" ? "warning" : "neutral"}>
          <MicOff className="mr-1 h-3 w-3" aria-hidden="true" />
          {stato === "denied"
            ? "Microfono bloccato"
            : "Microfono da consentire"}
        </Badge>
        {/*
          La parola sul pulsante **cambia con quello che può fare**.

          Quando il permesso è ancora da chiedere, premerlo fa comparire la
          finestra del browser: «Consenti» è esatto. Quando il sito è già
          bloccato non comparirà niente — `getUserMedia` rifiuta senza chiedere
          — e «Consenti» sarebbe una promessa. Ma il pulsante resta, perché
          `permissions.query` risponde «bloccato» anche dove **manca il
          microfono**: un clic distingue le due cose, che portano a gesti
          opposti, e la riga sotto dice quale delle due è.
        */}
        <Button variant="accent" size="sm" onClick={chiedi} disabled={inCorso}>
          {inCorso
            ? "Chiedo…"
            : stato === "denied"
              ? "Controlla il microfono"
              : "Consenti il microfono"}
        </Button>
      </div>
      {/* La risposta del browser, quando ha risposto: è la riga che cambia
          dopo un clic che «non fa niente». */}
      {risposta && <p className="text-xs text-destructive-soft">{risposta}</p>}

      <p className="t-nota">
        {stato === "denied"
          ? "Si sblocca dal browser, in un posto solo: clicca l'icona a sinistra dell'indirizzo (lucchetto o cursori) → Microfono → Consenti → ricarica la pagina. Su Chrome, in alternativa: chrome://settings/content/microphone, e togli questo sito dall'elenco dei bloccati."
          : "Serve una volta per browser. Concederlo adesso evita di trovarsi la richiesta mentre il telefono squilla."}
      </p>
    </div>
  );
}
