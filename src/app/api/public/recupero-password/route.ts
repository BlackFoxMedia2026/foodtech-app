import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-auth";
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
    const esito = await chiediRecuperoPassword(await req.json(), origine(req));
    return NextResponse.json(esito);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/**
 * L'indirizzo da cui è arrivata la richiesta, che diventa la base del link
 * nell'email. Si legge dalle intestazioni e non da una variabile d'ambiente
 * perché lo stesso codice serve produzione, anteprime di Vercel e sviluppo in
 * locale: un indirizzo scritto a mano nelle impostazioni manderebbe chi prova
 * un'anteprima a reimpostare la password in produzione.
 */
function origine(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
