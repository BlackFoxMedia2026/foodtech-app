import type { StaffRequestType } from "@prisma/client";

/**
 * I nomi delle richieste del personale, per le schermate.
 *
 * Sta in `lib/` e non nel modulo del server perché li legge un componente
 * client: da un modulo che importa il database, il client non può leggere
 * niente. È il confine che in questo progetto ha già morso quattro volte.
 */

export const TIPI_RICHIESTA = [
  "VACATION",
  "DAY_OFF",
  "LEAVE",
  "SHIFT_CHANGE",
  "UNAVAILABILITY",
] as const satisfies readonly StaffRequestType[];

export const NOME_TIPO_RICHIESTA: Record<StaffRequestType, string> = {
  VACATION: "Ferie",
  DAY_OFF: "Giorno libero",
  LEAVE: "Permesso",
  SHIFT_CHANGE: "Cambio turno",
  UNAVAILABILITY: "Indisponibilità",
};
