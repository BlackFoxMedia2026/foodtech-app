import { headers } from "next/headers";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { origineFidata } from "@/lib/origine";
import { AccountError, MESSAGGIO_ACCOUNT } from "@/server/staff-account";

/** L'indirizzo pubblico di questa installazione, per i link da consegnare.
 * I link portano un segreto (invito, reimpostazione): vedi `origineFidata`. */
export function baseUrl(): string {
  return origineFidata(headers());
}

const STATUS: Partial<Record<AccountError["code"], number>> = {
  not_found: 404,
  senza_account: 409,
  ha_gia_account: 409,
  email_richiesta: 422,
  email_in_uso: 409,
  non_su_di_te: 409,
  ultimo_manager: 409,
  link_non_valido: 410,
  indirizzo_riservato: 422,
  gestito_altrove: 409,
};

export function erroreAccount(err: unknown) {
  if (err instanceof AccountError) return apiError(STATUS[err.code] ?? 400, err.code, MESSAGGIO_ACCOUNT[err.code]);
  return apiErrorResponse(err);
}
