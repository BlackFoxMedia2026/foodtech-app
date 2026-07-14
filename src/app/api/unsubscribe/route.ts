import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import { PREVIEW_UNSUBSCRIBE_ID, verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

function htmlPage(opts: { title: string; message: string; accent?: string | null; logoUrl?: string | null }) {
  const accent = opts.accent && /^#[0-9a-fA-F]{3,8}$/.test(opts.accent) ? opts.accent : "#F44C12";
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #120C08; color: #F8F6F1; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 420px; text-align: center; }
  img { max-height: 48px; margin-bottom: 16px; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; color: ${accent}; }
  p { color: #B7ADA4; line-height: 1.5; }
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

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const guestId = verifyUnsubscribeToken(token);

  if (!guestId) {
    return htmlPage({
      title: "Link non valido",
      message: "Questo link di disiscrizione non è valido o è scaduto.",
    });
  }

  if (guestId === PREVIEW_UNSUBSCRIBE_ID) {
    return htmlPage({
      title: "Anteprima disiscrizione",
      message: "Questa è un'email di test: nessuna disiscrizione reale è stata effettuata. In un invio vero, questo link disiscrive davvero il destinatario.",
    });
  }

  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest) {
    return htmlPage({
      title: "Richiesta elaborata",
      message: "Non riceverai più email da parte nostra.",
    });
  }

  const venue = await db.venue.findUnique({ where: { id: guest.venueId } });

  if (guest.marketingOptIn) {
    await db.guest.update({ where: { id: guestId }, data: { marketingOptIn: false } });
    await db.consentLog.create({
      data: {
        id: crypto.randomUUID(),
        venueId: guest.venueId,
        guestId,
        channel: "EMAIL",
        granted: false,
        source: "unsubscribe_link",
      },
    });

    const providerLink = await db.guestProviderLink.findUnique({
      where: { guestId_provider: { guestId, provider: "brevo" } },
    });
    if (providerLink) {
      await brevoAdapter.unsubscribeContact(providerLink.providerContactId).catch(() => {});
    }
  }

  return htmlPage({
    title: "Disiscrizione confermata",
    message: `Non riceverai più email di marketing da ${venue?.name ?? "questo locale"}.`,
    accent: venue?.brandAccent,
    logoUrl: venue?.brandLogoUrl,
  });
}
