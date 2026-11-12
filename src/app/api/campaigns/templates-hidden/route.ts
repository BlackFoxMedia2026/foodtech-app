import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVenueApi } from "@/lib/api-auth";
import { getCampaignTemplate } from "@/lib/campaign-templates";
import { nascondiModello } from "@/server/campaigns";

const Body = z.object({ templateId: z.string().min(1), hidden: z.boolean() });

/** Toglie un modello della libreria dalla vista del locale, o ce lo rimette. */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  // Solo id che esistono: il campo non deve raccogliere stringhe a caso.
  if (!getCampaignTemplate(parsed.data.templateId)) {
    return NextResponse.json({ error: "unknown_template" }, { status: 404 });
  }
  const hiddenTemplates = await nascondiModello(ctx.venueId, parsed.data.templateId, parsed.data.hidden);
  return NextResponse.json({ hiddenTemplates });
}
