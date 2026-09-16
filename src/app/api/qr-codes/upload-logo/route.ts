import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireVenueApi } from "@/lib/api-auth";

/**
 * Il logo da mettere sul codice.
 *
 * Esiste accanto a quello del marchio (`api/venue/brand/upload-image`) e non al
 * suo posto, per una differenza di permessi: cambiare il logo **del locale** è
 * una decisione che tocca ogni superficie pubblica e chiede `manage_venue`;
 * mettere un'immagine su un cartoncino è lavoro di marketing. Chi prepara i
 * QR non deve poter riscrivere il marchio per farlo.
 */

const MASSIMO = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file", message: "Scegli un file." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "not_an_image", message: "Serve un'immagine: PNG, JPG o SVG." },
      { status: 400 },
    );
  }
  if (file.size > MASSIMO) {
    return NextResponse.json(
      { error: "file_too_large", message: "L'immagine supera i 5 MB." },
      { status: 400 },
    );
  }

  const estensione = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const percorso = `qr/${ctx.venueId}/${crypto.randomUUID()}.${estensione}`;
  const blob = await put(percorso, file, { access: "public" });
  return NextResponse.json({ url: blob.url });
}
