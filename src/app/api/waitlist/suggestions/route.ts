import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { suggestEntriesForTable } from "@/server/waitlist";

/** «Si è liberato questo tavolo: chi ci sta?» */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const tableId = new URL(req.url).searchParams.get("tableId");
  if (!tableId) return apiError(422, "missing_table", "Indica il tavolo che si è liberato.");
  try {
    return NextResponse.json(await suggestEntriesForTable(ctx.venueId, tableId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
