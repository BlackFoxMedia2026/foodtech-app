import { apiError } from "@/lib/api-auth";
import type { WorkShiftError } from "@/server/work-shifts";

/**
 * Gli errori dei turni tradotti in HTTP, in un posto solo.
 *
 * Sta qui e non dentro una delle due rotte perché un file `route.ts` può
 * esportare **soltanto** i gestori dei metodi: qualunque altra esportazione
 * fa fallire il build di Next con un errore sui tipi della rotta.
 */
export function rispostaErroreTurno(err: WorkShiftError) {
  if (err.code === "not_found") return apiError(404, err.code, "Questo turno non esiste più.");
  if (err.code === "staff_not_found") {
    return apiError(404, err.code, "Questa persona non è in organico in questo locale.");
  }
  return apiError(409, err.code, "C'è già un turno per questa persona in questo giorno.");
}
