import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireVenueApi } from "@/lib/api-auth";
import { logErrore } from "@/lib/observability";

/**
 * Il logo da mettere sul codice.
 *
 * Esiste accanto a quello del marchio (`api/venue/brand/upload-image`) e non al
 * suo posto, per una differenza di permessi: cambiare il logo **del locale** è
 * una decisione che tocca ogni superficie pubblica e chiede `manage_venue`;
 * mettere un'immagine su un cartoncino è lavoro di marketing. Chi prepara i
 * QR non deve poter riscrivere il marchio per farlo.
 *
 * Ci si arriva **al salvataggio** e non alla scelta del file: il logo si vede
 * nell'anteprima appena scelto, letto nel browser, e qui passa solo quando
 * serve un indirizzo che sopravviva alla sessione. Il perché sta in
 * `lib/qr-logo.ts`.
 *
 * Quello che va storto qui esce come una frase, mai come un `throw`: un
 * errore non gestito in una route diventa una risposta senza corpo, e a chi
 * ha premuto «Salva» arriva il messaggio che il browser dà a una richiesta
 * fallita — «Failed to fetch», che non dice niente e sembra un guasto della
 * rete anche quando è una configurazione che manca.
 */

const MASSIMO = 5 * 1024 * 1024;

/** Quello che poi sapranno disegnare l'anteprima, il PNG, l'SVG e il PDF. */
const TIPI = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/**
 * Lo spazio immagini è configurato?
 *
 * `BLOB_READ_WRITE_TOKEN` è documentato come facoltativo, e la regola del
 * prodotto è che una funzione senza la sua chiave **lo dica** invece di
 * rompersi (vedi `docs/PASSAGGIO-DI-CONSEGNE.md`). Senza questo controllo la
 * libreria solleva un errore in inglese che parla di credenziali, e finiva
 * dritto addosso a un ristoratore.
 */
function spazioImmaginiPronto(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file", message: "Scegli un file." }, { status: 400 });
  }
  if (!TIPI.has(file.type)) {
    return NextResponse.json(
      { error: "not_an_image", message: "Serve un'immagine: PNG, JPG, WEBP o SVG." },
      { status: 400 },
    );
  }
  if (file.size > MASSIMO) {
    return NextResponse.json(
      { error: "file_too_large", message: "L'immagine supera i 5 MB." },
      { status: 400 },
    );
  }

  if (!spazioImmaginiPronto()) {
    return NextResponse.json(
      {
        error: "storage_non_configurato",
        message:
          "Lo spazio immagini non è configurato su questo ambiente, quindi il logo non si può conservare. Salva il QR senza logo, oppure chiedi di attivarlo.",
      },
      { status: 503 },
    );
  }

  const estensione = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const percorso = `qr/${ctx.venueId}/${crypto.randomUUID()}.${estensione}`;
  try {
    const blob = await put(percorso, file, { access: "public" });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    logErrore("qr_upload_logo", err);
    return NextResponse.json(
      { error: "upload_fallito", message: "Non siamo riusciti a caricare il logo. Riprova." },
      { status: 502 },
    );
  }
}
