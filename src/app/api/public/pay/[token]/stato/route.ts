import { NextResponse } from "next/server";
import { leggiContoTavolo, segnaScansione, tavoloDaToken } from "@/server/conto-tavolo";
import { rispostaErrore } from "@/lib/pay-errori";

/**
 * Il conto del tavolo, per la pagina che il cliente ha in mano.
 *
 * **Pubblica**, senza sessione: è il punto della funzione — chi si siede non
 * si registra e non installa niente. Quello che protegge questi dati è il
 * token stesso, che è un segreto da 192 bit stampato su un adesivo che sta
 * fisicamente su quel tavolo.
 *
 * Non restituisce **mai** identificativi interni: né del locale, né del conto,
 * né della prenotazione. Le righe hanno un identificativo perché il cliente
 * deve poter dire quali portate sta pagando, e quello è l'unico che esce.
 *
 * È anche l'indirizzo che la pagina richiama ogni pochi secondi per restare
 * viva: quando Mario paga, il telefono di Giulia vede il residuo scendere da
 * qui.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const tavolo = await tavoloDaToken(params.token);
    // Statistica, non attesa: non deve poter rallentare l'apertura del conto.
    void segnaScansione(tavolo.id, tavolo.payQrLastSeenAt);

    const conto = await leggiContoTavolo(params.token);

    return NextResponse.json(
      {
        stato: conto.stato,
        tavolo: conto.tavolo,
        locale: {
          nome: conto.locale.nome,
          logoUrl: conto.locale.logoUrl,
          accento: conto.locale.accento,
        },
        currency: conto.locale.currency,
        mancia: {
          attiva: conto.locale.tipsEnabled,
          percentuali: conto.locale.tipPresets,
        },
        minimoCents: conto.locale.minPaymentCents,
        totaleCents: conto.totaleCents,
        scontiCents: conto.scontiCents,
        daPagareCents: conto.daPagareCents,
        pagatoCents: conto.pagatoCents,
        inCorsoCents: conto.inCorsoCents,
        residuoCents: conto.residuoCents,
        righe: conto.righe.map((r) => ({
          id: r.id,
          nome: r.nome,
          prezzoUnitarioCents: r.prezzoUnitarioCents,
          quantita: r.quantita,
          pagate: r.pagate,
          disponibili: r.disponibili,
        })),
      },
      // La pagina di un conto non si mette in cache da nessuna parte: né dal
      // browser né da una rete intermedia. Il residuo di trenta secondi fa è
      // il modo più semplice di far pagare due volte qualcuno.
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return rispostaErrore(err);
  }
}
