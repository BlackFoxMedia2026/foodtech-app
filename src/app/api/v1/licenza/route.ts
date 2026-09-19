import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { logEvento } from "@/lib/observability";
import { dividiLicenza } from "@/lib/licenza-centralino";
import { LicenzaError, applicaRevoca, attivaCentralino } from "@/server/licenza-centralino";

/**
 * `POST /api/v1/licenza`
 *
 * Accendere e spegnere il telefono di un locale **da remoto**, da
 * ilmiocentralino.
 *
 * ## Perché non chiede un token
 *
 * Perché la prova è **la firma**. Dentro la chiave c'è di quale locale è, e
 * solo chi ha la chiave privata può fabbricarne una: un token, per quanto
 * segreto, è una cosa che si può rubare a un server; una firma Ed25519 non si
 * fabbrica. Chiedere anche un token legherebbe l'accensione alla rotazione di
 * un segreto, e un giorno il telefono non si accenderebbe per un motivo che
 * non c'entra niente.
 *
 * Il limite di frequenza resta, e serve: senza, questo sarebbe il posto da cui
 * provare chiavi a caso.
 *
 * ## Una rotta sola per due comandi
 *
 * È il contenuto firmato a dire cosa vuole: una chiave accende, una revoca
 * spegne. Due rotte vorrebbero dire due indirizzi da tenere allineati
 * dall'altra parte, e la possibilità di mandare il comando giusto a quello
 * sbagliato — che è esattamente l'errore che le due verifiche incrociate di
 * `verificaLicenza` e `applicaRevoca` rifiutano.
 *
 * ## Cosa non fa
 *
 * Non cancella niente di quello che il telefono ha prodotto. Spegnere toglie
 * le funzioni, non la storia: le prenotazioni prese al telefono sono
 * prenotazioni, e restano.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  /** La chiave firmata: accende, oppure — se è una revoca — spegne. */
  chiave: z.string().min(10).max(4000),
});

export async function POST(req: Request) {
  try {
    const { chiave } = Corpo.parse(await req.json());

    /* Si guarda **prima** cosa dice, per mandarla alla funzione giusta. La
       lettura non si fida di niente: la firma la verificano le due funzioni
       sotto, ognuna a modo suo. */
    const divisa = dividiLicenza(chiave);
    if (!divisa) {
      return apiError(400, "malformata", "Questo non è un comando del centralino.");
    }

    if (divisa.contenuto.r) {
      const esito = await applicaRevoca(chiave);
      if (!esito.ok) {
        logEvento("licenza.revoca_rifiutata", {
          locale: divisa.contenuto.l,
          motivo: esito.motivo,
        });
        return apiError(esito.motivo === "vecchia" ? 409 : 400, esito.motivo, esito.messaggio);
      }
      logEvento("licenza.revocata", { locale: divisa.contenuto.l, spento: esito.spento });
      return NextResponse.json({ ok: true, azione: "spento", giaSpento: !esito.spento });
    }

    const stato = await attivaCentralino(divisa.contenuto.l, chiave);
    logEvento("licenza.accesa", {
      locale: divisa.contenuto.l,
      funzioni: stato.funzioni.join(","),
      scadeIl: stato.scadeIl?.toISOString() ?? null,
    });
    return NextResponse.json({
      ok: true,
      azione: "acceso",
      funzioni: stato.funzioni,
      scadeIl: stato.scadeIl,
    });
  } catch (err) {
    if (err instanceof LicenzaError) {
      /* Il messaggio della licenza arriva **intero** a chi ha chiamato: non è
         un ristoratore, è il centralino, e quello che c'è scritto dice quale
         chiave rifare. */
      return apiError(400, err.motivo, err.message);
    }
    return apiErrorResponse(err);
  }
}
