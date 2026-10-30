import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-auth";
import { origineFidata } from "@/lib/origine";
import { chiediRecuperoPassword } from "@/server/recupero-password";

/**
 * «Ho dimenticato la password». Pubblica per necessità: chi la chiede non
 * riesce a entrare, quindi non può esserci nessun controllo d'accesso davanti.
 *
 * Le due difese sono altrove e sono quelle giuste: il limite di frequenza nel
 * middleware (`recupero`, cinque tentativi ogni dieci minuti per indirizzo di
 * rete) e la risposta che **non dice** se quell'email ha un account — vedi
 * `server/recupero-password.ts`.
 */
export async function POST(req: Request) {
  try {
    const esito = await chiediRecuperoPassword(await req.json(), origineFidata(req.headers));
    return NextResponse.json(esito);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
