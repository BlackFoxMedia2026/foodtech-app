import { NextResponse } from "next/server";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { AccountError, MESSAGGIO_ACCOUNT, completaReset } from "@/server/staff-account";

/**
 * Chi ha ricevuto un link di reimpostazione sceglie la password. Pubblica,
 * come l'accettazione dell'invito: il token nel link è la prova.
 */
export async function POST(req: Request) {
  try {
    const esito = await completaReset(await req.json());
    return NextResponse.json({ email: esito.email });
  } catch (err) {
    if (err instanceof AccountError) return apiError(410, err.code, MESSAGGIO_ACCOUNT[err.code]);
    return apiErrorResponse(err);
  }
}
