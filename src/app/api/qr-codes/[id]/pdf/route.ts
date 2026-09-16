import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireVenueApi } from "@/lib/api-auth";
import { origineDa } from "@/lib/origine";
import { indirizzoEsternoAmmesso } from "@/lib/indirizzo-esterno";
import { componiQr, livelloCorrezione, matriceDa } from "@/lib/qr-disegno";
import { foglioQr, type LogoPerStampa } from "@/lib/qr-pdf-stampa";
import { getQrCode } from "@/server/qr-codes";

/**
 * Il foglio da stampare.
 *
 * Il PNG e l'SVG li fa il browser, che ha già il disegno sotto gli occhi; il
 * PDF no, e per una ragione precisa: dentro c'è il **logo**, e comporre
 * un'immagine dentro un PDF richiede di aprirla (vedi `lib/immagine-pdf.ts`).
 * Farlo qui significa anche che il file che esce è identico per chiunque lo
 * scarichi, da qualunque browser.
 */

export const dynamic = "force-dynamic";

/** Quanto può pesare un logo che andiamo a prendere. */
const LOGO_MASSIMO = 4 * 1024 * 1024;

async function prendiLogo(url: string): Promise<LogoPerStampa | null> {
  if (!indirizzoEsternoAmmesso(url)) return null;
  try {
    const risposta = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "follow" });
    if (!risposta.ok) return null;
    const byte = Buffer.from(await risposta.arrayBuffer());
    if (byte.length > LOGO_MASSIMO) return null;
    return { url, byte };
  } catch {
    /* Un logo che non arriva non deve far fallire la stampa: il codice esce
       senza, ed è comunque un codice che funziona. */
    return null;
  }
}

function nomeFile(nome: string): string {
  const pulito =
    nome
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "qr-code";
  return `foodtech-qr-${pulito}.pdf`;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const origine = origineDa(req.headers);
  const qr = await getQrCode(ctx.venueId, params.id, origine);
  if (!qr) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!qr.contenuto) {
    return NextResponse.json({ error: "destinazione_mancante" }, { status: 409 });
  }

  const codice = QRCode.create(qr.contenuto, { errorCorrectionLevel: livelloCorrezione(qr.design) });
  const disegno = componiQr({ matrice: matriceDa(codice.modules as never), design: qr.design });

  const logo = qr.design.logoUrl ? await prendiLogo(qr.design.logoUrl) : null;

  const pdf = foglioQr({
    disegno,
    nome: qr.name,
    sfondo: qr.design.coloreSfondo,
    loghi: logo ? [logo] : [],
  });

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeFile(qr.name)}"`,
      /* Il QR di un tavolo porta dentro un segreto: non finisce in nessuna
         cache condivisa, come già fa l'immagine del cartoncino. */
      "Cache-Control": "private, no-store",
    },
  });
}
