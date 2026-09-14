import { headers } from "next/headers";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { AccountError, MESSAGGIO_ACCOUNT } from "@/server/staff-account";

/** L'indirizzo pubblico di questa installazione, per i link da consegnare. */
export function baseUrl(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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
};

export function erroreAccount(err: unknown) {
  if (err instanceof AccountError) return apiError(STATUS[err.code] ?? 400, err.code, MESSAGGIO_ACCOUNT[err.code]);
  return apiErrorResponse(err);
}
