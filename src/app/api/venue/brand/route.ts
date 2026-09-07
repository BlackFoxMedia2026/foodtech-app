import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { updateBrandSettings } from "@/server/venue-brand";

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const { action, ...fields } = body as { action?: "complete" | "skip"; [key: string]: unknown };
    const updated = await updateBrandSettings(ctx.venueId, fields, action);
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
