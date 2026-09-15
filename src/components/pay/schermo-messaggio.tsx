import { UtensilsCrossed } from "lucide-react";

/**
 * La schermata di chi ha inquadrato il QR e non trova un conto da pagare.
 *
 * Esiste perché il QR è **permanente**: sta sul tavolo anche alle undici del
 * mattino, anche quando il locale ha sospeso la funzione, anche dopo che il
 * conto è stato chiuso in cassa. Tutte situazioni normali, nessuna delle quali
 * merita una pagina d'errore — chi le incontra non ha sbagliato niente.
 *
 * Per lo stesso motivo il tono qui non si scusa e non allarma: dice cos'è
 * successo e cosa si può fare, che quasi sempre è «chiedi al personale».
 */
export function SchermoMessaggio({
  locale,
  logoUrl,
  tavolo,
  titolo,
  testo,
}: {
  locale: string | null;
  logoUrl: string | null;
  tavolo: string | null;
  titolo: string;
  testo: string;
}) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-6 text-center">
        <header className="space-y-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={locale ?? ""} className="mx-auto h-12 w-auto object-contain" />
          ) : (
            <UtensilsCrossed className="mx-auto h-9 w-9 text-accent-strong" aria-hidden="true" />
          )}
          {locale && <p className="text-display text-xl">{locale}</p>}
          {tavolo && (
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Tavolo {tavolo}</p>
          )}
        </header>

        <div className="surface riquadro space-y-2 p-6">
          <h1 className="text-display text-xl">{titolo}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{testo}</p>
        </div>
      </div>
    </main>
  );
}
