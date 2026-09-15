"use client";

import { useEffect, useState } from "react";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * «Stiamo confermando il pagamento.»
 *
 * Il rimando del browser da Stripe e l'evento firmato che conferma l'incasso
 * viaggiano su due strade diverse, e ogni tanto il browser arriva primo. Per
 * quel secondo il pagamento risulta ancora in corso — e dire «non risulta
 * pagato» a chi ha appena visto l'addebito sul telefono è il modo più rapido
 * di far chiamare il ristorante da un cliente spaventato.
 *
 * Quindi si aspetta, ricontrollando ogni due secondi. Dopo venti secondi si
 * smette: a quel punto qualcosa è andato storto davvero, e la frase giusta non
 * è più «aspetta» ma «mostra questa schermata al personale» — con l'avvertenza
 * che conta, cioè che il denaro **non** è perso.
 */

const OGNI_MS = 2_000;
const RINUNCIA_MS = 20_000;

export function AttesaConferma({
  token,
  paymentId,
  locale,
  logoUrl,
  tavolo,
}: {
  token: string;
  paymentId: string;
  locale: string;
  logoUrl: string | null;
  tavolo: string;
}) {
  const router = useRouter();
  const [scaduto, setScaduto] = useState(false);

  useEffect(() => {
    if (scaduto) return;
    // `router.refresh()` rilegge la pagina dal server: lo stato lo ha scritto
    // il webhook, quindi basta richiedere la stessa schermata.
    const tic = setInterval(() => router.refresh(), OGNI_MS);
    const fine = setTimeout(() => setScaduto(true), RINUNCIA_MS);
    return () => {
      clearInterval(tic);
      clearTimeout(fine);
    };
  }, [router, scaduto]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-5 text-center">
        <header className="space-y-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={locale} className="mx-auto h-11 w-auto object-contain" />
          ) : (
            <UtensilsCrossed className="mx-auto h-8 w-8 text-accent-strong" aria-hidden="true" />
          )}
          <p className="text-display text-xl">{locale}</p>
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Tavolo {tavolo}</p>
        </header>

        <div className="surface riquadro space-y-3 p-6">
          {!scaduto ? (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent-strong" aria-hidden="true" />
              <h1 className="text-display text-xl">Stiamo confermando</h1>
              <p className="text-sm text-muted-foreground">
                Ci vuole qualche secondo. Non chiudere questa pagina.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-display text-xl">Conferma più lenta del solito</h1>
              <p className="text-sm text-muted-foreground">
                Se ti è stato addebitato l&apos;importo, il pagamento arriverà comunque: i soldi non
                sono persi. Mostra questa schermata al personale.
              </p>
              <p className="text-xs text-muted-foreground">
                Riferimento: <code className="select-all">{paymentId.slice(-8)}</code>
              </p>
              <a
                href={`/pay/${token}`}
                className="bg-cream text-clay-ink shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:brightness-105 mt-2 inline-block rounded-full px-5 py-3 text-sm font-semibold"
              >
                Torna al conto
              </a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
