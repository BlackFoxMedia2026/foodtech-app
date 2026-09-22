import { NextResponse } from "next/server";
import { createBooking } from "@/server/bookings";
import { CaparraError, chiediCaparra } from "@/server/caparre";
import { bookingWriteErrorResponse } from "@/server/booking-errors";
import { db } from "@/lib/db";
import {
  annotaTrappola,
  chiaveIdempotenza,
  eScontroDiChiave,
  giaFattaConQuestaChiave,
  giaPrenotatoUgualeIdentico,
  trappolaScattata,
} from "@/server/widget-defenses";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const venueId = typeof body?.venueId === "string" ? body.venueId : undefined;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const venue = await db.venue.findFirst({ where: { id: venueId, active: true } });
    if (!venue) {
      return NextResponse.json({ error: "venue not found" }, { status: 404 });
    }

    /**
     * La campagna arriva dal link cliccato, quindi dal mondo esterno: si
     * accetta solo se esiste e appartiene a **questo** locale. Se non torna,
     * la prenotazione si fa comunque senza attribuzione: un link storto non
     * deve impedire a un cliente di prenotare.
     */
    const campagnaRichiesta = typeof body?.campaignId === "string" ? body.campaignId : null;
    const campaignId = campagnaRichiesta
      ? (
          await db.campaign.findFirst({
            where: { id: campagnaRichiesta, venueId },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    /**
     * Il campo trappola.
     *
     * Chi lo compila riceve un rifiuto generico: **non gli si racconta una
     * finta conferma**. Far credere di avere un tavolo che non esiste è una
     * bugia anche verso un programma — e se un giorno scattasse per errore su
     * una persona vera, la conferma falsa sarebbe il danno peggiore.
     */
    if (trappolaScattata(body)) {
      annotaTrappola(venueId);
      return NextResponse.json(
        { error: "richiesta_non_valida", message: "Controlla i dati e riprova." },
        { status: 422 },
      );
    }

    const payload = {
      guest: body?.guest,
      partySize: body?.partySize,
      startsAt: body?.startsAt,
      durationMin: body?.durationMin,
      occasion: body?.occasion,
      notes: body?.notes,
      source: "WIDGET" as const,
    };

    const chiave = chiaveIdempotenza(body);

    /**
     * Le due strade per non prenotare due volte la stessa cosa.
     *
     * La prima è precisa: la chiave la genera il modulo una volta per
     * tentativo, quindi due richieste con la stessa chiave sono lo stesso
     * tocco arrivato due volte — succede su una rete lenta, e succede spesso.
     */
    const giaFatta = await giaFattaConQuestaChiave(venueId, chiave);
    if (giaFatta) {
      // 200 e non 201: non è stato creato niente adesso, ed è la verità.
      return NextResponse.json(giaFatta, { status: 200 });
    }

    /**
     * La seconda copre il modulo ricaricato e ricompilato, dove la chiave è
     * cambiata: stessa persona, stesso orario, stessi coperti. Confronto
     * esatto, perché due amici che prenotano lo stesso tavolo a orari diversi
     * devono ottenere due prenotazioni.
     */
    const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
    if (startsAt && !Number.isNaN(startsAt.getTime()) && body?.partySize) {
      const doppione = await giaPrenotatoUgualeIdentico(venueId, {
        email: body?.guest?.email,
        phone: body?.guest?.phone,
        startsAt,
        partySize: Number(body.partySize),
      });
      if (doppione) return NextResponse.json(doppione, { status: 200 });
    }

    try {
      const booking = await createBooking(venueId, payload, {
        campaignId,
        canale: "pubblico",
        idempotencyKey: chiave,
      });

      /*
        La caparra, quando il locale la chiede.

        Si chiede **dopo** aver creato la prenotazione e non prima: il tavolo
        resta tenuto mentre il cliente paga, e se non paga il locale vede una
        riga «chiesta, non pagata» — che e un'informazione, mentre un tavolo
        libero e una prenotazione sparita non lo sono.

        Se qualcosa va storto qui, la prenotazione **resta**: una caparra non
        richiesta si chiede dopo con un clic, una prenotazione persa perche il
        pagamento non e partito non si recupera. Per questo l'errore si scrive
        e non si propaga.
      */
      const caparra = await caparraPerIlWidget(venueId, booking.id, req);

      return NextResponse.json({ ...booking, caparra }, { status: 201 });
    } catch (err) {
      /**
       * Due richieste in parallelo con la stessa chiave: fra la lettura e la
       * scrittura non si vedono, e l'unicità la garantisce l'indice. La
       * seconda perde, e perdere qui vuol dire «esisteva già» — non «è
       * andato storto».
       */
      if (eScontroDiChiave(err)) {
        const esistente = await giaFattaConQuestaChiave(venueId, chiave);
        if (esistente) return NextResponse.json(esistente, { status: 200 });
      }
      throw err;
    }
  } catch (err) {
    return bookingWriteErrorResponse(err);
  }
}

/**
 * Il link della caparra da dare a chi ha appena prenotato dal sito.
 *
 * `null` quando non c'e niente da pagare — nessuna regola, sotto la soglia — e
 * **anche quando non si e potuto chiedere**: i pagamenti non collegati, Stripe
 * che non risponde. In quel caso resta una prenotazione senza caparra, che il
 * locale vede e puo chiedere con un clic; il contrario — rifiutare la
 * prenotazione perche il pagamento non parte — vorrebbe dire perdere un
 * coperto per un problema nostro.
 *
 * Il ritorno e la **pagina di conferma della sua prenotazione**: chi prenota
 * dal sito sta dentro un percorso, e chiuderlo dove era cominciato e l'unico
 * modo perche veda che la caparra risulta pagata.
 */
async function caparraPerIlWidget(
  venueId: string,
  bookingId: string,
  req: Request,
): Promise<{ url: string; importoCents: number } | null> {
  try {
    const origine = new URL(req.url).origin;
    const conferma = `${origine}/book/confirmation?bookingId=${bookingId}`;
    const esito = await chiediCaparra(venueId, bookingId, {
      origine,
      ritorno: { successo: conferma, annullato: `${conferma}&caparra=annullata` },
      /* Nessun messaggio: sta pagando adesso, davanti allo schermo. Un SMS
         con lo stesso link, nello stesso minuto, e la cosa che fa pensare a
         una truffa. */
      senzaMessaggio: true,
    });
    return { url: esito.url, importoCents: esito.importoCents };
  } catch (err) {
    /* `nessuna_caparra` e il caso normale e non si scrive: sarebbe una riga
       nei registri per ogni prenotazione di ogni locale che non usa le
       caparre. Tutto il resto si scrive, perche e una configurazione da
       sistemare o un guasto. */
    const codice = err instanceof CaparraError ? err.code : "errore_sconosciuto";
    if (codice !== "nessuna_caparra") {
      console.warn(`[caparra] non chiesta sulla prenotazione ${bookingId}: ${codice}`);
    }
    return null;
  }
}
