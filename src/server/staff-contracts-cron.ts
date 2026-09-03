import type { StaffContractReminderType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  CONTRACT_REMINDER_THRESHOLD_DAYS,
  getContractDaysRemaining,
  staffContractTypeLabel,
} from "@/lib/staff-contracts";
import { createNotification, listContractNotificationRecipients } from "@/server/notifications";
import { sendContractExpiredEmail, sendContractExpiringEmail } from "@/server/emails";

/** Email is sent only for the milestones the brief calls "the most
 * important" (section 17) — the daily notification/bell still fires for
 * every threshold in CONTRACT_REMINDER_THRESHOLD_DAYS. */
const EMAIL_REMINDER_TYPES = new Set<StaffContractReminderType>(["DAYS_30", "DAYS_7", "DUE_TODAY"]);

/**
 * Daily sweep: for every contract with an end date, fire the reminder for
 * whichever threshold today lands on exactly (30/15/7/0 days out), plus a
 * one-time EXPIRED reminder once the end date has passed — each dedup'd by
 * the (contractId, reminderType) unique constraint on StaffContractReminder
 * so re-running this job (or running it twice in a day) never double-sends
 * (brief sections 13/41/42).
 */
export async function runStaffContractExpiryCheck(today: Date = new Date()) {
  const contracts = await db.staffContract.findMany({
    where: { endDate: { not: null } },
    include: { waiter: true, venue: { select: { id: true, name: true } } },
  });

  let notificationsSent = 0;

  for (const contract of contracts) {
    if (!contract.endDate) continue;
    const daysRemaining = getContractDaysRemaining(contract.endDate, today);
    const threshold = CONTRACT_REMINDER_THRESHOLD_DAYS.find((t) => t.days === daysRemaining);
    const reminderType: StaffContractReminderType | null = threshold?.reminderType ?? (daysRemaining < 0 ? "EXPIRED" : null);
    if (!reminderType) continue;

    // Claim the (contractId, reminderType) slot before doing any side effects
    // (notification + email) — the unique constraint makes this the
    // linearization point, so two concurrent runs of this job can't both
    // pass the claim and double-send (brief section 41).
    const claimed = await claimReminderSlot(contract.id, reminderType);
    if (!claimed) continue;

    const waiterName = `${contract.waiter.firstName} ${contract.waiter.lastName}`;
    const isExpired = reminderType === "EXPIRED";
    const title = isExpired ? "Contratto scaduto" : "Contratto in scadenza";
    const body = isExpired
      ? `Il contratto di ${waiterName} è scaduto.`
      : daysRemaining === 0
        ? `Il contratto di ${waiterName} scade oggi.`
        : `Il contratto di ${waiterName} scade tra ${daysRemaining} giorni.`;
    const link = `/waiters?waiterId=${contract.waiterId}`;

    await createNotification(contract.venueId, {
      kind: isExpired ? "STAFF_CONTRACT_EXPIRED" : "STAFF_CONTRACT_EXPIRING",
      title,
      body,
      link,
      meta: {
        waiterId: contract.waiterId,
        contractId: contract.id,
        contractType: staffContractTypeLabel(contract.contractType),
        daysRemaining,
      },
    });

    if (EMAIL_REMINDER_TYPES.has(reminderType) || isExpired) {
      const recipients = await listContractNotificationRecipients(contract.venueId);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      const profileUrl = `${baseUrl}${link}`;
      for (const recipient of recipients) {
        if (!recipient.email) continue;
        if (isExpired) {
          await sendContractExpiredEmail(recipient.email, recipient.name ?? "", waiterName, contract.venue.name, contract.endDate, profileUrl);
        } else {
          await sendContractExpiringEmail(
            recipient.email,
            recipient.name ?? "",
            waiterName,
            contract.venue.name,
            contract.endDate,
            daysRemaining,
            profileUrl,
          );
        }
      }
    }

    notificationsSent++;
  }

  return { contractsChecked: contracts.length, notificationsSent };
}

async function claimReminderSlot(contractId: string, reminderType: StaffContractReminderType) {
  try {
    await db.staffContractReminder.create({ data: { contractId, reminderType } });
    return true;
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") return false;
    throw err;
  }
}
