import type { StaffDepartment, StaffPrimaryRole, WorkShiftKind } from "@prisma/client";

/** Le forme che attraversano il calendario. Stanno in un file loro perché le
 * usano sei componenti, e importarle dal più grosso creerebbe cicli. */

export type PersonaTurni = {
  id: string;
  firstName: string;
  lastName: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment | null;
  /** La foto del profilo, quando c'è. Le card del calendario la mostrano e
   * ripiegano sulle iniziali: è quello che rende riconoscibile una colonna
   * senza leggerla. */
  photoUrl: string | null;
};

export type Turno = {
  id: string;
  waiterId: string;
  dateKey: string;
  kind: WorkShiftKind;
  startMinute: number | null;
  endMinute: number | null;
  breakMinutes: number | null;
  department: StaffDepartment | null;
  service: string | null;
  notes: string | null;
};

/** Un turno già accoppiato alla sua persona: la griglia non deve andarsela a
 * cercare in un indice a ogni card. */
export type TurnoConPersona = Turno & { persona: PersonaTurni };

/** Un turno di lavoro, cioè con gli orari garantiti non nulli. */
export type TurnoOrario = TurnoConPersona & { startMinute: number; endMinute: number };

export type Vista = "giorno" | "settimana" | "mese";

export function iniziali(persona: { firstName: string; lastName: string }): string {
  return `${persona.firstName.charAt(0)}${persona.lastName.charAt(0)}`.toUpperCase();
}

export function nomeCompleto(persona: { firstName: string; lastName: string }): string {
  return `${persona.firstName} ${persona.lastName}`;
}
