import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { retryJob } from "@/server/jobs/queue";

/** Rimette in coda un lavoro non riuscito. Solo per chi gestisce il locale. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const job = await retryJob(ctx.venueId, params.id);
    return NextResponse.json({ id: job.id, status: job.status });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
