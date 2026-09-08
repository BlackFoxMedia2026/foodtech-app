import { NextResponse } from "next/server";
import { TeamError, accettaInvito } from "@/server/team";

/**
 * Accettare un invito, dal lato di chi lo riceve.
 *
 * Pubblica per necessità — chi accetta non ha ancora un accesso — e protetta
 * dal segreto del link, che è casuale, imprevedibile e **vale una volta**. Il
 * limite di frequenza sta nel middleware, come per gli altri endpoint
 * pubblici: è l'altro posto da cui si potrebbero provare token a caso.
 */
export async function POST(req: Request) {
  try {
    const esito = await accettaInvito(await req.json());
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof TeamError) {
      const messaggi: Record<string, string> = {
        invito_non_valido: "Questo invito non è valido.",
        invito_scaduto: "Questo invito è scaduto: chiedine un altro al locale.",
        invito_usato: "Questo invito è già stato usato.",
        password_richiesta: "Scegli una password per il tuo accesso.",
      };
      return NextResponse.json(
        { error: err.code, message: messaggi[err.code] ?? "Non siamo riusciti ad accettare l'invito." },
        { status: err.code === "password_richiesta" ? 422 : 410 },
      );
    }
    // Uno schema non rispettato non deve raccontare com'è fatto lo schema.
    return NextResponse.json(
      { error: "richiesta_non_valida", message: "Controlla i dati e riprova." },
      { status: 422 },
    );
  }
}
