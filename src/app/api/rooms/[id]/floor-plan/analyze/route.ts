import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVenueApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { analyzeFloorPlan } from "@/server/floorplan-analysis";
import { storeFloorPlanAnalysis } from "@/server/room-layout";
import { analysisToElements, summarizeAnalysis } from "@/lib/floorplan-analysis";

const Body = z
  .object({
    /** Le dimensioni reali, se il ristoratore le conosce. Battono sempre la
     * stima del riconoscitore. */
    widthM: z.coerce.number().min(1).max(500).nullable().optional(),
    depthM: z.coerce.number().min(1).max(500).nullable().optional(),
  })
  .default({});

/**
 * Riconosce la planimetria caricata e ne restituisce la versione
 * modificabile.
 *
 * Salva il risultato grezzo sulla sala ma **non** la piantina: gli elementi
 * tornano al client, che li mostra nell'editor come modifiche non salvate.
 * Diventano la piantina della sala solo quando il ristoratore preme «Salva
 * sala». Un riconoscimento che si autosalva sovrascriverebbe senza chiedere
 * una piantina costruita a mano, che è esattamente il lavoro più costoso che
 * questa schermata contiene.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  const room = await db.room.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!room) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!room.floorPlanUrl) {
    return NextResponse.json({ error: "no_floor_plan" }, { status: 400 });
  }

  const body = Body.parse((await req.json().catch(() => ({}))) ?? {});

  const analysis = await analyzeFloorPlan({
    imageUrl: room.floorPlanUrl,
    roomName: room.name,
    hintWidthM: body.widthM ?? null,
    hintDepthM: body.depthM ?? null,
  });

  await storeFloorPlanAnalysis(room.id, analysis);

  const { elements, width, height } = analysisToElements(analysis);

  return NextResponse.json({
    analysis,
    elements,
    width,
    height,
    summary: summarizeAnalysis(analysis),
  });
}
