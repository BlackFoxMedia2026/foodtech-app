import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { registraEventoChiamata, segnaEventoChiamata } from "@/server/chiamate";
import { db } from "@/lib/db";

/**
 * Far squillare il telefono senza una linea telefonica.
 *
 * ## Perché esiste
 *
 * Perché l'alternativa è costruire l'interfaccia di Voice a occhi chiusi, o —
 * peggio — metterci un pulsante che *finge* una telefonata. Questo non finge
 * niente: scrive una chiamata vera nella tabella vera, che percorre la stessa
 * strada di una chiamata del centralino. Cambia soltanto chi l'ha annunciata.
 *
 * ## Perché non può esistere in produzione
 *
 * Perché scriverebbe chiamate mai avvenute nello storico di un ristorante. E
 * il controllo sta **nel codice**, non in una variabile d'ambiente: una
 * variabile la si accende per provare una cosa e la si dimentica accesa, e
 * allora esiste un indirizzo che inventa telefonate a un cliente vero.
 *
 * In produzione questa rotta risponde **404**, come se non fosse mai stata
 * scritta.
 */

export const dynamic = "force-dynamic";

/** Vero solo dove si sviluppa. Non è configurabile, ed è voluto. */
const SVILUPPO = process.env.NODE_ENV !== "production";

const Corpo = z.object({
  /**
   * Quale situazione mettere in scena.
   *
   * Sono le quattro che l'interfaccia deve saper affrontare, e sono diverse
   * fra loro proprio nei punti in cui il codice può sbagliare.
   */
  scenario: z.enum(["OSPITE_NOTO", "SCONOSCIUTO", "PERSA", "IN_CORSO"]),
  /** Il numero, se si vuole scegliere quale. */
  phone: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  if (!SVILUPPO) {
    return apiError(404, "not_found", "Questo indirizzo non esiste.");
  }

  /* Anche in sviluppo passa dal guardiano: la sessione dice **quale locale**,
     e senza quello questa rotta scriverebbe nel locale che le si indica. */
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    const { scenario, phone } = Corpo.parse(await req.json());

    /* Per «ospite noto» si prende un ospite vero del locale, col suo numero:
       una prova che usa un numero inventato non verifica il riconoscimento,
       verifica che il riconoscimento non trovi niente. */
    let numero = phone ?? null;
    if (!numero && scenario === "OSPITE_NOTO") {
      const ospite = await db.guest.findFirst({
        where: { venueId: ctx.venueId, phone: { not: null }, anonymizedAt: null },
        select: { phone: true },
        orderBy: { lastVisitAt: "desc" },
      });
      if (!ospite?.phone) {
        return apiError(
          409,
          "nessun_ospite_con_numero",
          "Questo locale non ha nessun ospite con un numero: lo scenario «ospite noto» non si può mettere in scena.",
        );
      }
      numero = ospite.phone;
    }
    numero ??= `+3934${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

    const idEsterno = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (scenario === "PERSA") {
      /* Si mette in scena la sequenza intera — squilla, poi nessuno risponde —
         e non solo lo stato finale: è la sequenza che il codice percorre, e
         una prova che salta il primo passo non prova il primo passo. */
      await registraEventoChiamata(ctx.venueId, {
        externalId: idEsterno,
        phone: numero,
        stato: "RINGING",
      });
      const esito = await registraEventoChiamata(ctx.venueId, {
        externalId: idEsterno,
        phone: numero,
        stato: "MISSED",
      });
      await segnaEventoChiamata(esito.id, "CALL_MISSED", { actor: "simulatore" });
      return NextResponse.json({ ...esito, simulata: true, numero });
    }

    const esito = await registraEventoChiamata(ctx.venueId, {
      externalId: idEsterno,
      phone: numero,
      stato: scenario === "IN_CORSO" ? "ANSWERED" : "RINGING",
    });
    await segnaEventoChiamata(esito.id, "CALL_RECEIVED", { actor: "simulatore" });

    return NextResponse.json({ ...esito, simulata: true, numero });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** Dice se il simulatore è disponibile, così l'interfaccia non indovina. */
export async function GET() {
  if (!SVILUPPO) return apiError(404, "not_found", "Questo indirizzo non esiste.");
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  return NextResponse.json({
    disponibile: true,
    scenari: ["OSPITE_NOTO", "SCONOSCIUTO", "PERSA", "IN_CORSO"],
  });
}
