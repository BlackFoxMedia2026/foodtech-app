import { db } from "@/lib/db";

export const MONTHLY_LLM_LIMIT = 200;

function currentYearMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(venueId: string, date = new Date()) {
  const yearMonth = currentYearMonth(date);
  const row = await db.agentUsage.findUnique({ where: { venueId_yearMonth: { venueId, yearMonth } } });
  return { used: row?.llmRequestCount ?? 0, limit: MONTHLY_LLM_LIMIT, yearMonth };
}

/**
 * Atomically checks-and-increments the monthly external-LLM counter in a
 * single UPDATE ... WHERE ... RETURNING statement, so two concurrent
 * requests both sitting at 199/200 can never both be allowed through — the
 * database serializes the two UPDATEs, and only one can see count < 200.
 */
export async function tryConsumeLLMRequest(
  venueId: string,
  date = new Date(),
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const yearMonth = currentYearMonth(date);

  await db.agentUsage.upsert({
    where: { venueId_yearMonth: { venueId, yearMonth } },
    create: { venueId, yearMonth, llmRequestCount: 0 },
    update: {},
  });

  const rows = await db.$queryRaw<{ llmRequestCount: number }[]>`
    UPDATE "AgentUsage"
    SET "llmRequestCount" = "llmRequestCount" + 1, "updatedAt" = now()
    WHERE "venueId" = ${venueId} AND "yearMonth" = ${yearMonth} AND "llmRequestCount" < ${MONTHLY_LLM_LIMIT}
    RETURNING "llmRequestCount"
  `;

  if (rows.length === 0) {
    return { allowed: false, used: MONTHLY_LLM_LIMIT, limit: MONTHLY_LLM_LIMIT };
  }
  return { allowed: true, used: rows[0].llmRequestCount, limit: MONTHLY_LLM_LIMIT };
}
