import { NextResponse } from "next/server";
import { runStaffContractExpiryCheck } from "@/server/staff-contracts-cron";

/**
 * Triggered once a day by Vercel Cron (see vercel.json) — one run/day is
 * enough, contract expiry doesn't need finer granularity (brief section 15).
 * Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on its own
 * cron invocations once CRON_SECRET is set in the project's env vars; this
 * route rejects anything else so the endpoint can't be triggered by a
 * stranger who finds the URL.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not configured — refusing to run staff-contracts-expiry");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runStaffContractExpiryCheck();
  return NextResponse.json(result);
}
