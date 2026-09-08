"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Quando qualcosa va storto, dentro l'applicazione.
 *
 * Prima non c'era: un'eccezione dal server mostrava la schermata grezza di
 * Next — sfondo bianco, testo inglese, nessun modo di tornare indietro se non
 * il pulsante del browser. Nel mezzo di un servizio, con un tablet in mano,
 * quella schermata vuol dire «il programma è morto».
 *
 * Qui restano il tema e la navigazione, c'è un pulsante che **riprova senza
 * ricaricare tutto** (`reset()` rimonta solo la parte caduta) e una via
 * d'uscita verso la Panoramica. Il messaggio tecnico non si mostra: a chi
 * serve è nei registri, a chi legge non dice niente.
 */
export default function ErroreApplicazione({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nei registri del server finisce comunque; questo serve per gli errori
    // che nascono nel browser.
    console.error("[interfaccia] errore non gestito", error);
  }, [error]);

  return (
    <div className="animate-fade-in surface mx-auto max-w-lg riquadro p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
      <h1 className="mt-4 text-display text-2xl">Qui si è rotto qualcosa</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Non è colpa tua e non hai perso niente: quello che avevi salvato è salvato. Riprova, e se succede ancora
        passa da un&apos;altra sezione.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="accent" onClick={reset}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Riprova
        </Button>
        <Button asChild variant="outline">
          <a href="/overview">Torna alla panoramica</a>
        </Button>
      </div>

      {error.digest && (
        // Il codice serve solo per ritrovare l'errore nei registri: si mostra
        // piccolo, senza spiegazioni che non aiutano nessuno.
        <p className="mt-6 text-xs text-tertiary-foreground">Codice: {error.digest}</p>
      )}
    </div>
  );
}
