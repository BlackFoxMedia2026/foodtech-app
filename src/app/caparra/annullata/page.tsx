import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Pagamento annullato · Tavolo",
};

/**
 * Dove torna il cliente se chiude la pagina di pagamento senza pagare.
 *
 * Dice due cose e nessuna promessa: **non è stato addebitato niente** — la
 * prima domanda di chi ha chiuso una pagina di pagamento a metà — e che il
 * link resta valido, così non deve chiedere di rifarlo.
 *
 * Non dice «la tua prenotazione è stata annullata», perché non è vero: la
 * prenotazione resta, e il ristorante la vede con la caparra ancora da pagare.
 */
export default function CaparraAnnullataPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="surface riquadro mx-auto max-w-md p-6 text-center">
        <h1 className="text-display text-2xl">Pagamento annullato</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Non ti abbiamo addebitato niente. La tua prenotazione è ancora lì: il link che ti abbiamo
          mandato resta valido, puoi pagare quando vuoi.
        </p>
      </div>
    </div>
  );
}
