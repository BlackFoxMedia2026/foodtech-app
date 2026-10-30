import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import { PREVIEW_UNSUBSCRIBE_ID, verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { disiscriviDaLink } from "@/server/dem/disiscrizione";

function htmlPage(opts: { title: string; message: string; accent?: string | null; logoUrl?: string | null }) {
  const accent = opts.accent && /^#[0-9a-fA-F]{3,8}$/.test(opts.accent) ? opts.accent : "#FFD400";
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #1A1A1A; color: #FFFFFF; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 420px; text-align: center; }
  img { max-height: 48px; margin-bottom: 16px; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; color: ${accent}; }
  p { color: #B6B6B6; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    ${opts.logoUrl ? `<img src="${opts.logoUrl}" alt="" />` : ""}
    <h1>${opts.title}</h1>
    <p>${opts.message}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * La disiscrizione vera, uguale per le due strade.
 *
 * `null` quando il token non vale; `"anteprima"` per le email di prova;
 * altrimenti la scheda toccata (o `undefined` se non esiste più e non c'è
 * un'unione da seguire).
 */
async function disiscrivi(token: string) {
  const guestId = verifyUnsubscribeToken(token);
  if (!guestId) return null;
  if (guestId === PREVIEW_UNSUBSCRIBE_ID) return "anteprima" as const;

  /*
    La disiscrizione tocca tre posti, e sono tre cose diverse.

    1. **La scheda cliente** smette di avere il consenso, e si annota
       quando: il CRM continua a mostrare Mario Rossi, con scritto accanto
       che non riceve più campagne. Cancellare il contatto sarebbe perdere
       la sua storia di cliente per una scelta che riguarda solo le email.
    2. **Il registro dei consensi** conserva il fatto, con la data e da dove
       è arrivato: è la prova, e una casella spuntata non lo è.
    3. **La soppressione** vale per l'**indirizzo**, non per la scheda. Lo
       stesso indirizzo può stare su due schede doppione, e la seconda
       riceverebbe lo stesso la prossima campagna.

    Se la scheda del link è stata unita a un'altra, si segue l'unione:
    rispondere «non riceverai più email» senza aver fatto niente era il
    difetto peggiore che una pagina così possa avere.
  */
  const scheda = await disiscriviDaLink(guestId, "unsubscribe_link");
  if (!scheda) return undefined;

  const providerLink = await db.guestProviderLink.findUnique({
    where: { guestId_provider: { guestId: scheda.id, provider: "brevo" } },
  });
  if (providerLink) {
    await brevoAdapter.unsubscribeContact(providerLink.providerContactId).catch(() => {});
  }
  return scheda;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const esito = await disiscrivi(token);

  if (esito === null) {
    return htmlPage({
      title: "Link non valido",
      message: "Questo link di disiscrizione non è valido o è scaduto.",
    });
  }

  if (esito === "anteprima") {
    return htmlPage({
      title: "Anteprima disiscrizione",
      message: "Questa è un'email di test: nessuna disiscrizione reale è stata effettuata. In un invio vero, questo link disiscrive davvero il destinatario.",
    });
  }

  if (!esito) {
    return htmlPage({
      title: "Richiesta elaborata",
      message: "Non riceverai più email da parte nostra.",
    });
  }

  const venue = await db.venue.findUnique({ where: { id: esito.venueId } });
  return htmlPage({
    title: "Disiscrizione confermata",
    message: `Non riceverai più email di marketing da ${venue?.name ?? "questo locale"}.`,
    accent: venue?.brandAccent,
    logoUrl: venue?.brandLogoUrl,
  });
}

/**
 * La disiscrizione con un clic, fatta dal programma di posta (RFC 8058).
 *
 * Le email escono con `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, e
 * Gmail e Apple Mail, quando la persona preme «Annulla iscrizione», fanno una
 * POST all'indirizzo del link con quel corpo. Senza questa funzione
 * ricevevano 405: la persona credeva di essersi disiscritta e continuava a
 * ricevere campagne — la strada più corta verso il pulsante «spam».
 *
 * Nessuna pagina in risposta: chi chiama è un programma, non una persona. Il
 * token sta nell'indirizzo, come per il GET; il corpo si legge solo per
 * riconoscere la richiesta, e una POST senza corpo vale lo stesso — rifiutarla
 * vorrebbe dire tenere iscritto qualcuno che ha chiesto di uscire.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const esito = await disiscrivi(token);
  if (esito === null) return new NextResponse(null, { status: 400 });
  return new NextResponse(null, { status: 200 });
}
