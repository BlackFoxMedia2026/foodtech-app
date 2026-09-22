import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Caparra pagata · Tavolo",
};

/**
 * Dove torna il cliente dopo aver pagato la caparra.
 *
 * ## Perché questa pagina non dice niente di preciso
 *
 * Perché non sa niente: ci si arriva da Stripe, senza un token e senza una
 * sessione. Mostrare «la tua prenotazione di venerdì per 10 persone»
 * richiederebbe un identificativo nell'indirizzo — cioè un dato di una
 * prenotazione leggibile da chiunque provi un numero.
 *
 * Quindi dice la sola cosa vera e utile: **il pagamento è andato**, e il
 * ristorante lo vede. Niente «riceverai una conferma», che è una promessa che
 * dipende da un canale che potrebbe non esserci.
 *
 * ## Perché esiste, invece di riusare la pagina di conferma
 *
 * Perché il link della caparra si manda anche per SMS a chi ha prenotato al
 * telefono: quella persona non ha nessuna pagina di conferma da cui era
 * partita. Senza questa pagina, dopo aver pagato sarebbe finita su un 404 —
 * che dopo aver dato dei soldi è il messaggio peggiore possibile.
 */
export default function CaparraFattaPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="surface riquadro mx-auto max-w-md p-6 text-center">
        <h1 className="text-display text-2xl">Caparra pagata</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Grazie: il pagamento è andato a buon fine e il ristorante lo vede sulla tua prenotazione.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Se qualcosa cambia, chiama il locale: la caparra si restituisce secondo le condizioni che
          ti hanno detto.
        </p>
      </div>
    </div>
  );
}
