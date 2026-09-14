import type { WaiterStatus } from "@prisma/client";

/**
 * Lo stato di una persona, e come si chiama davanti a chi lo legge.
 *
 * Erano due valori (in servizio / a riposo) e un interruttore. Il problema è
 * che «a riposo» copriva tre cose diverse — è il suo giorno libero, è in ferie
 * per due settimane, si è dato malato stamattina — e chi guardava l'elenco non
 * poteva distinguerle. Sono tre decisioni diverse quando manca qualcuno in
 * sala.
 *
 * `tone` è il tono del Badge, `assignable` risponde alla sola domanda che il
 * codice fa davvero a questo campo: posso metterlo in squadra adesso?
 */
export const STAFF_STATUSES: {
  value: WaiterStatus;
  label: string;
  tone: "success" | "neutral" | "warning" | "danger";
  assignable: boolean;
}[] = [
  { value: "ACTIVE", label: "In servizio", tone: "success", assignable: true },
  { value: "RESTING", label: "A riposo", tone: "neutral", assignable: false },
  { value: "VACATION", label: "In ferie", tone: "warning", assignable: false },
  { value: "SICK_LEAVE", label: "In malattia", tone: "danger", assignable: false },
  { value: "UNAVAILABLE", label: "Non disponibile", tone: "neutral", assignable: false },
];

const BY_VALUE = new Map(STAFF_STATUSES.map((s) => [s.value, s]));

export function staffStatusLabel(status: WaiterStatus): string {
  return BY_VALUE.get(status)?.label ?? status;
}

export function staffStatusTone(status: WaiterStatus) {
  return BY_VALUE.get(status)?.tone ?? "neutral";
}

/** Se questa persona può ricevere un'assegnazione oggi. Unico posto in cui si
 * decide: prima era `status === "RESTING"` scritto in quattro componenti, e
 * ognuno avrebbe dovuto imparare i tre stati nuovi per conto suo. */
export function isAssignable(status: WaiterStatus): boolean {
  return BY_VALUE.get(status)?.assignable ?? false;
}
