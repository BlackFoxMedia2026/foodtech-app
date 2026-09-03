import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { StaffContractReminderType, StaffContractType } from "@prisma/client";

/**
 * Pure constants/logic, no `db` import — safe to pull into client components
 * (mirrors src/lib/staff-roles.ts).
 */

export const STAFF_CONTRACT_TYPES: { value: StaffContractType; label: string }[] = [
  { value: "TEMPO_DETERMINATO", label: "Tempo determinato" },
  { value: "TEMPO_INDETERMINATO", label: "Tempo indeterminato" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "FULL_TIME", label: "Full-time" },
  { value: "STAGIONALE", label: "Stagionale" },
  { value: "APPRENDISTATO", label: "Apprendistato" },
  { value: "COLLABORAZIONE", label: "Collaborazione" },
  { value: "A_CHIAMATA", label: "A chiamata" },
  { value: "ALTRO", label: "Altro" },
];

export function staffContractTypeLabel(type: StaffContractType) {
  return STAFF_CONTRACT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export type ContractStatus = "NOT_STARTED" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";

/** Days-remaining window under which an active contract is flagged as
 * "in scadenza" — matches the widest reminder threshold (brief section 11),
 * so a contract never jumps straight from ACTIVE to EXPIRED unannounced. */
export const CONTRACT_EXPIRING_SOON_THRESHOLD_DAYS = 30;

export const CONTRACT_REMINDER_THRESHOLD_DAYS: { days: number; reminderType: StaffContractReminderType }[] = [
  { days: 30, reminderType: "DAYS_30" },
  { days: 15, reminderType: "DAYS_15" },
  { days: 7, reminderType: "DAYS_7" },
  { days: 0, reminderType: "DUE_TODAY" },
];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  NOT_STARTED: "Non iniziato",
  ACTIVE: "Contratto attivo",
  EXPIRING_SOON: "In scadenza",
  EXPIRED: "Scaduto",
  NO_EXPIRY: "Senza scadenza",
};

export const CONTRACT_STATUS_BADGE_TONE: Record<ContractStatus, "neutral" | "success" | "warning" | "danger"> = {
  NOT_STARTED: "neutral",
  ACTIVE: "success",
  EXPIRING_SOON: "warning",
  EXPIRED: "danger",
  NO_EXPIRY: "neutral",
};

/** Calendar-day difference between `endDate` and `today`, both normalized to
 * local midnight first — avoids off-by-one status flips around timezone/DST
 * boundaries (brief section 37). Positive = days remaining, negative = days
 * past due, 0 = due today. */
export function getContractDaysRemaining(endDate: Date, today: Date = new Date()): number {
  return differenceInCalendarDays(startOfDay(endDate), startOfDay(today));
}

export function getContractStatus(
  contract: { startDate: Date; endDate: Date | null },
  today: Date = new Date(),
): ContractStatus {
  const start = startOfDay(contract.startDate);
  const day = startOfDay(today);
  if (day < start) return "NOT_STARTED";
  if (!contract.endDate) return "NO_EXPIRY";
  const daysRemaining = getContractDaysRemaining(contract.endDate, day);
  if (daysRemaining < 0) return "EXPIRED";
  if (daysRemaining <= CONTRACT_EXPIRING_SOON_THRESHOLD_DAYS) return "EXPIRING_SOON";
  return "ACTIVE";
}

/** Short human label for the status badge, e.g. "In scadenza tra 27 giorni",
 * "Scaduto il 12/03/2026" (brief sections 10/24). */
export function getContractStatusDetail(
  contract: { startDate: Date; endDate: Date | null },
  today: Date = new Date(),
): string {
  const status = getContractStatus(contract, today);
  if (status === "NOT_STARTED") {
    return `Inizia il ${contract.startDate.toLocaleDateString("it-IT")}`;
  }
  if (status === "NO_EXPIRY") return CONTRACT_STATUS_LABELS.NO_EXPIRY;
  if (!contract.endDate) return CONTRACT_STATUS_LABELS[status];
  if (status === "ACTIVE") return CONTRACT_STATUS_LABELS.ACTIVE;
  const daysRemaining = getContractDaysRemaining(contract.endDate, today);
  if (status === "EXPIRED") {
    return `Scaduto il ${contract.endDate.toLocaleDateString("it-IT")}`;
  }
  if (daysRemaining === 0) return "Scade oggi";
  if (daysRemaining === 1) return "Scade domani";
  return `In scadenza tra ${daysRemaining} giorni`;
}

/** The "contratto attuale" shown in the profile (brief section 24): the most
 * recently started contract — a renewal always has a later startDate than
 * the row it replaces, so this naturally surfaces the latest one whether
 * it's active, upcoming, or (if nothing newer was created yet) expired. */
export function pickCurrentContract<T extends { startDate: Date }>(contracts: T[]): T | null {
  if (contracts.length === 0) return null;
  return [...contracts].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
}

export function sortContractsByStartDateDesc<T extends { startDate: Date }>(contracts: T[]): T[] {
  return [...contracts].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}
