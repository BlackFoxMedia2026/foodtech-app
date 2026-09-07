import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getMenu } from "@/server/menu";

/**
 * Il menu, per chi deve batterlo sul conto.
 *
 * Torna anche i piatti finiti: la schermata li mostra spenti invece di
 * nasconderli, così chi cerca «tagliatelle» capisce che ci sono ma sono
 * terminate, e non pensa che manchino dal menu.
 */
export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await getMenu(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
