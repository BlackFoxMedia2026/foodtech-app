import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { isAutomationKey } from "@/server/automations/catalogue";
import { updateAutomation } from "@/server/automations/engine";

const Coupon = z
  .object({
    kind: z.enum(["PERCENT", "FIXED", "FREE_ITEM", "MENU_OFFER"]),
    value: z.coerce.number().int().min(0).max(1_000_000).optional(),
    freeItem: z.string().trim().max(120).optional().nullable(),
    giorniValidita: z.coerce.number().int().min(1).max(365),
  })
  .refine((c) => c.kind !== "PERCENT" || (c.value != null && c.value >= 1 && c.value <= 100), {
    message: "Una percentuale sta fra 1 e 100",
    path: ["value"],
  })
  .refine((c) => c.kind !== "FIXED" || (c.value != null && c.value > 0), {
    message: "Uno sconto fisso deve valere qualcosa",
    path: ["value"],
  })
  .refine((c) => (c.kind !== "FREE_ITEM" && c.kind !== "MENU_OFFER") || !!c.freeItem?.trim(), {
    message: "Scrivi cosa si offre",
    path: ["freeItem"],
  });

const Body = z.object({
  active: z.boolean().optional(),
  giorni: z.number().int().min(1).max(365).optional(),
  subject: z.string().min(1).max(120).optional(),
  intro: z.string().min(1).max(600).optional(),
  /** Un oggetto per mettere l'omaggio, `null` per toglierlo. */
  coupon: Coupon.nullable().optional(),
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
