"use client";

import { useEffect } from "react";

/**
 * Quando va storto qualcosa fuori dall'applicazione: widget pubblico, link
 * dell'ospite, pagina di accesso.
 *
 * Qui non c'è la navigazione e chi legge spesso non è un cliente di Tavolo ma
 * un cliente del ristorante: il tono cambia, e l'unica via d'uscita sensata è
 * riprovare o chiamare il locale.
 */
export default function ErroreGenerale({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[pubblico] errore non gestito", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="surface w-full max-w-md rounded-md border border-border p-8 text-center">
        <h1 className="text-display text-2xl">Qualcosa non ha funzionato</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Riprova fra un momento. Se stavi prenotando, il posto non è stato preso: nessuna prenotazione è stata
          registrata.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-[44px] rounded-full bg-cream px-5 text-sm font-medium text-clay-ink"
        >
          Riprova
        </button>
      </div>
    </div>
  );
}
