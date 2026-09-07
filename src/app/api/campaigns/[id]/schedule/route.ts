import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { z } from "zod";
import { scheduleCampaign } from "@/server/campaigns";

const Body = z.object({ at: z.coerce.date() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const { at } = Body.parse(await req.json());
    const updated = await scheduleCampaign(ctx.venueId, params.id, at);
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
