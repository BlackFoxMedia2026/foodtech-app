import { eseguiCron } from "@/lib/cron";
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
  return eseguiCron("staff-contracts-expiry", req, () => runStaffContractExpiryCheck());
}
