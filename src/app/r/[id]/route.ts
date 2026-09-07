import { NextResponse } from "next/server";
import { recordReviewLinkClick } from "@/server/reviews";

export const dynamic = "force-dynamic";

/**
 * La porta verso la recensione pubblica.
 *
 * Sta qui, e non è un collegamento diretto alla piattaforma, per una ragione
 * sola: contare quanti promotori fanno il passo successivo. Chi arriva viene
 * registrato e rimandato subito — il rinvio è la cosa che deve funzionare
 * sempre, la misura è quella che può fallire in silenzio.
 *
 * L'indirizzo è breve di proposito: finisce dentro un messaggio e, un giorno,
 * su un cartoncino al tavolo.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const destinazione = await recordReviewLinkClick(params.id, {
    surveyToken: url.searchParams.get("s"),
  });

  if (!destinazione) {
    // Il collegamento non esiste più: meglio la porta di casa che un errore.
    return NextResponse.redirect(new URL("/", url.origin), 302);
  }

  return NextResponse.redirect(destinazione, 302);
}
