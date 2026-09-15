import { NextResponse } from "next/server";
import { ContoTavoloError } from "@/server/conto-tavolo";

/**
 * Gli errori che la pagina pubblica di pagamento sa raccontare.
 *
 * Sta in un modulo suo e non dentro una route perché lo usano due route, e
 * perché un file `route.ts` di Next può esportare soltanto i verbi HTTP:
 * qualunque altra esportazione da lì è un errore in fase di build.
 *
 * **Nessuna di queste risposte dice se un token esiste.** «Token sconosciuto»
 * e «locale disattivato» tornano entrambi 404: distinguerli permetterebbe di
 * scoprire quali token sono validi provandoli a raffica, che è esattamente
 * ciò da cui un segreto stampato su un adesivo va protetto.
 */
export function rispostaErrore(err: unknown) {
  if (err instanceof ContoTavoloError) {
    switch (err.code) {
      case "token_sconosciuto":
      case "locale_non_attivo":
        return NextResponse.json({ errore: "non_trovato" }, { status: 404 });
      case "qr_disattivato":
        return NextResponse.json({ errore: "qr_disattivato" }, { status: 403 });
      case "nessun_conto":
        return NextResponse.json({ errore: "nessun_conto" }, { status: 409 });
      case "conto_chiuso":
        return NextResponse.json({ errore: "conto_chiuso" }, { status: 409 });
    }
  }
  console.error("[pay] errore inatteso:", err);
  return NextResponse.json({ errore: "errore" }, { status: 500 });
}
