import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { isAutomationKey } from "@/server/automations/catalogue";
import { updateAutomation } from "@/server/automations/engine";

const Body = z.object({
  active: z.boolean().optional(),
  giorni: z.number().int().min(1).max(365).optional(),
  subject: z.string().min(1).max(120).optional(),
  intro: z.string().min(1).max(600).optional(),
});

export async function PATCH(req: Request, { params }: { params: { key: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    if (!isAutomationKey(params.key)) throw new Error("not_found");
    const body = Body.parse(await req.json());
    const wf = await updateAutomation(ctx.venueId, params.key, body);
    return NextResponse.json({ key: params.key, active: wf.active });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
