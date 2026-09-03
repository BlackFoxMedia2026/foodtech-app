import type { StaffContractType } from "@prisma/client";

/** Client-safe form state shared by the "Nuovo cameriere" and "Profilo
 * cameriere" contract sections — mirrors the StaffContractInput zod schema
 * in src/server/staff-contracts.ts but as plain strings, since inputs are
 * uncontrolled/string-based like the rest of these forms. */
export type ContractFormValues = {
  contractType: StaffContractType | null;
  startDate: string;
  endDate: string;
  noExpiry: boolean;
  weeklyHours: string;
  contractualRole: string;
  notes: string;
};

export const EMPTY_CONTRACT_FORM: ContractFormValues = {
  contractType: null,
  startDate: "",
  endDate: "",
  noExpiry: false,
  weeklyHours: "",
  contractualRole: "",
  notes: "",
};

export type ContractFormErrors = Partial<Record<"contractType" | "startDate" | "endDate" | "weeklyHours", string>>;

export function validateContractForm(v: ContractFormValues): ContractFormErrors {
  const errors: ContractFormErrors = {};
  if (!v.contractType) errors.contractType = "Seleziona una tipologia di contratto.";
  if (!v.startDate) errors.startDate = "Inserisci la data di inizio.";
  if (!v.noExpiry && !v.endDate) {
    errors.endDate = "Inserisci la data di scadenza o seleziona “Nessuna scadenza”.";
  } else if (!v.noExpiry && v.startDate && v.endDate && v.endDate < v.startDate) {
    errors.endDate = "La data di scadenza non può precedere la data di inizio.";
  }
  if (v.weeklyHours && Number(v.weeklyHours) < 0) {
    errors.weeklyHours = "Le ore settimanali non possono essere negative.";
  }
  return errors;
}

export function contractFormToPayload(v: ContractFormValues) {
  return {
    contractType: v.contractType,
    startDate: v.startDate,
    endDate: v.noExpiry ? null : v.endDate || null,
    weeklyHours: v.weeklyHours.trim() ? Number(v.weeklyHours) : null,
    contractualRole: v.contractualRole.trim() || null,
    notes: v.notes.trim() || null,
  };
}

export function contractToFormValues(contract: {
  contractType: StaffContractType;
  startDate: Date;
  endDate: Date | null;
  weeklyHours: number | null;
  contractualRole: string | null;
  notes: string | null;
}): ContractFormValues {
  return {
    contractType: contract.contractType,
    startDate: contract.startDate.toISOString().slice(0, 10),
    endDate: contract.endDate ? contract.endDate.toISOString().slice(0, 10) : "",
    noExpiry: !contract.endDate,
    weeklyHours: contract.weeklyHours != null ? String(contract.weeklyHours) : "",
    contractualRole: contract.contractualRole ?? "",
    notes: contract.notes ?? "",
  };
}

/** Whether the user touched any contract field — used by the "Nuovo
 * cameriere" dialog to decide whether to create a contract at all (the
 * section is optional there, brief section 4). */
export function isContractFormDirty(v: ContractFormValues) {
  return (
    v.contractType !== null ||
    v.startDate !== "" ||
    v.endDate !== "" ||
    v.noExpiry ||
    v.weeklyHours !== "" ||
    v.contractualRole !== "" ||
    v.notes !== ""
  );
}
