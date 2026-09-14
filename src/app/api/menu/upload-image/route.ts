import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireVenueApi } from "@/lib/api-auth";

/**
 * La foto di un piatto.
 *
 * Stesso deposito e stesse regole delle altre immagini del prodotto (logo del
 * locale, foto dello staff, piantina della sala): il file va su Blob e qui
 * torna solo il suo indirizzo. Chi ha caricato non ha ancora salvato niente —
 * l'indirizzo entra nel piatto quando si salva la scheda, non prima.
 */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file", message: "Nessun file da caricare." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "not_an_image", message: "Questo file non è un'immagine." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", message: "L'immagine supera i 5 MB: usane una più leggera." },
      { status: 400 },
    );
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const pathname = `menu/${ctx.venueId}/${crypto.randomUUID()}.${extension}`;

  const blob = await put(pathname, file, { access: "public" });
  return NextResponse.json({ url: blob.url });
}
