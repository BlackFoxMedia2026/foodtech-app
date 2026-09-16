import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { put, del } from "@vercel/blob";
import { db } from "@/lib/db";
import { setRoomFloorPlan } from "@/server/rooms";

const MAX_BYTES = 10 * 1024 * 1024;
// Il PDF si carica e si conserva come riferimento, ma il riconoscimento
// automatico legge solo immagini: vedi `tipoImmagine` in
// `server/floorplan-analysis.ts`, che in quel caso ripiega sul perimetro e
// lo dice al ristoratore invece di spendere una chiamata per un rifiuto.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  const room = await db.room.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "not_an_image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const pathname = `floor-plans/${ctx.venueId}/${params.id}/${crypto.randomUUID()}.${extension}`;

  /*
    Senza archivio file non si carica niente, e va detto così.

    In locale `BLOB_READ_WRITE_TOKEN` è spesso vuoto: `put` lanciava, la rotta
    restituiva un 500 senza corpo e la schermata diceva «Caricamento non
    riuscito. Riprova» — cioè invitava a rifare, per sempre, un gesto che non
    può riuscire. Un messaggio che nomina la causa fa perdere un minuto invece
    di un pomeriggio.
  */
  let blob: { url: string };
  try {
    blob = await put(pathname, file, { access: "public" });
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "";
    if (/credential|token/i.test(messaggio)) {
      return NextResponse.json(
        {
          error: "blob_non_configurato",
          message:
            "L'archivio file non è configurato su questo ambiente: la piantina non può essere caricata. Puoi comunque disegnare la sala a mano.",
        },
        { status: 503 },
      );
    }
    throw err;
  }

  const previousUrl = room.floorPlanUrl;
  const updated = await setRoomFloorPlan(ctx.venueId, params.id, blob.url);

  if (previousUrl) {
    await del(previousUrl).catch(() => {});
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  const room = await db.room.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await setRoomFloorPlan(ctx.venueId, params.id, null);
  if (room.floorPlanUrl) {
    await del(room.floorPlanUrl).catch(() => {});
  }

  return NextResponse.json(updated);
}
