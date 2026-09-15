import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ContoTavoloError } from "@/server/conto-tavolo";
import { avviaPagamento, PagamentoError } from "@/server/pagamenti-tavolo";
import { rispostaErrore } from "@/lib/pay-errori";

/**
 * Avvia un pagamento e dice al telefono dove andare.
 *
 * **Quello che arriva da qui non decide quanto si paga.** Il corpo della
 * richiesta porta un'intenzione — «tutto», «un quarto», «queste portate» — e
 * l'importo lo ricalcola il server sul residuo di quell'istante, dentro una
 * transazione che mette in fila chi tocca lo stesso conto. Vedi
 * `server/pagamenti-tavolo.ts`: è lì che sta la difesa, e non qui.
 *
 * Questa route fa tre cose sole: legge il corpo, chiama, e traduce gli errori
 * in frasi che una persona seduta a tavola possa capire.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const corpo = await req.json();
    // L'origine della richiesta e non la variabile d'ambiente: così i link di
    // ritorno da Stripe riportano il cliente sullo stesso indirizzo da cui è
    // partito, anche in anteprima.
    const origine = new URL(req.url).origin;
    const esito = await avviaPagamento(params.token, corpo, { origine });

    return NextResponse.json(
      {
        url: esito.url,
        billCents: esito.billCents,
        tipCents: esito.tipCents,
        totalCents: esito.totalCents,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof PagamentoError) return rispostaPagamento(err);
    if (err instanceof ContoTavoloError) return rispostaErrore(err);
    if (err instanceof ZodError) {
      return NextResponse.json({ errore: "richiesta_non_valida" }, { status: 400 });
    }
    return rispostaErrore(err);
  }
}

/**
 * Ogni errore con la sua frase e il suo stato.
 *
 * `conto_cambiato` e `righe_non_disponibili` tornano **409 con i numeri
 * nuovi**: non sono guasti, sono l'altro commensale che ha pagato per primo, e
 * la pagina deve poter dire «il conto è appena stato aggiornato» e rifare il
 * calcolo invece di mostrare un errore.
 */
function rispostaPagamento(err: PagamentoError) {
  const per: Record<PagamentoError["code"], { stato: number; messaggio: string }> = {
    conto_cambiato: {
      stato: 409,
      messaggio: "Il conto è appena stato aggiornato: qualcun altro ha pagato una parte.",
    },
    righe_non_disponibili: {
      stato: 409,
      messaggio: "Qualcuno ha appena pagato una delle portate che avevi scelto.",
    },
    residuo_esaurito: {
      stato: 409,
      messaggio: "Il conto è già stato saldato per intero.",
    },
    importo_troppo_basso: { stato: 400, messaggio: "L'importo è troppo basso." },
    importo_oltre_residuo: {
      stato: 400,
      messaggio: "L'importo supera quello che resta da pagare.",
    },
    stripe_non_collegato: {
      stato: 503,
      messaggio: "Questo locale non accetta ancora pagamenti dal tavolo. Chiedi il conto al personale.",
    },
    stripe_rifiutato: {
      stato: 502,
      messaggio: "Non siamo riusciti ad aprire il pagamento. Riprova fra un istante.",
    },
  };

  const { stato, messaggio } = per[err.code];
  return NextResponse.json(
    { errore: err.code, messaggio, ...(err.dettaglio ?? {}) },
    { status: stato, headers: { "Cache-Control": "no-store" } },
  );
}
