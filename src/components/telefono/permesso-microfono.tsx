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
    try {
      const flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
      /* Si chiude subito: serviva il permesso, non l'audio. Tenere aperto il
         microfono accenderebbe il pallino di registrazione del sistema su una
         pagina di impostazioni, che è il modo più veloce di far chiudere la
         pagina. */
      for (const t of flusso.getTracks()) t.stop();
      setStato("granted");
    } catch {
      setStato("denied");
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
        <Button variant="accent" size="sm" onClick={chiedi} disabled={inCorso}>
          {inCorso ? "Chiedo…" : "Consenti il microfono"}
        </Button>
      </div>
      <p className="t-nota">
        {stato === "denied"
          ? "Questo browser l'ha già bloccato: clicca l'icona a sinistra dell'indirizzo → Microfono → Consenti, poi premi di nuovo il pulsante."
          : "Serve una volta per browser. Concederlo adesso evita di trovarsi la richiesta mentre il telefono squilla."}
      </p>
    </div>
  );
}
