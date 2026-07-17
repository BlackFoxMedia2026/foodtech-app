import { NextResponse } from "next/server";
import { recordWebhookEvent } from "@/server/campaigns";

export async function POST(req: Request) {
  const expectedToken = process.env.BREVO_WEBHOOK_TOKEN;
  const token = new URL(req.url).searchParams.get("token");

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    await recordWebhookEvent(payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[BREVO webhook] failed to process payload:", err);
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
