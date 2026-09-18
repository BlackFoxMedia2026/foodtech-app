import { z } from "zod";
import type { Ability } from "@/lib/abilities";
import { assignTableToWaiter } from "@/server/waiter-assignments";
import { checkAvailability } from "@/server/availability";
import { createBooking } from "@/server/bookings";
import { addToWaitlist } from "@/server/waitlist";
import { apriRichiamata } from "@/server/voice/richiamate";
import {
  eScontroDiChiave,
  giaFattaConQuestaChiave,
} from "@/server/widget-defenses";
import { telefonoLeggibile } from "@/lib/telefono";
import type { AgentContext, ToolResult } from "./types";

/**
 * Gli esecutori: il punto in cui l'assistente **scrive**.
 *
 * ## Perché gli esecutori hanno un permesso, da adesso
 *
 * Perché non l'avevano, e la rotta che li esegue chiedeva soltanto di essere
 * un membro del locale. Cioè: `POST /api/agent/actions/confirm` con
 * `actionId: "assign_waiter"` scriveva sul database anche per un accesso in
 * **sola lettura** — mentre la schermata che fa la stessa cosa chiede
 * `manage_staff`. Un assistente non deve essere una scorciatoia intorno ai
 * permessi, e ogni esecutore dichiara adesso la capacità della schermata
 * corrispondente.
 *
 * ## Le tre regole degli strumenti di scrittura, qui dentro
 *
 * 1. **il «fatto» lo dice l'esecutore, dopo.** Gli strumenti in `tools/`
 *    costruiscono un'anteprima e non toccano niente; la frase al passato esce
 *    solo da qui, quando la scrittura è riuscita.
 * 2. **la validazione si rifà adesso.** Fra l'anteprima e la conferma passano
 *    secondi, e in quei secondi un altro tavolo può essere preso: si ricontrolla
 *    al momento della scrittura, e sui conflitti **fisici** — il tavolo non
 *    c'è più — non si scrive. Sulle regole morbide (locale chiuso, turno
 *    pieno) si scrive comunque: chi ha confermato le ha lette nell'anteprima,
 *    e un software che gli dice no viene aggirato con una penna.
 * 3. **niente valori inventati.** Gli esecutori parlano zod: quello che manca
 *    fa fallire la conferma, non diventa un valore per difetto.
 */

export type ActionExecutor = {
  /** La capacità che serve, la stessa della schermata che fa questa cosa. */
  ability: Ability | null;
  run: (
    ctx: AgentContext,
    params: Record<string, unknown>,
  ) => Promise<ToolResult>;
};

const AssignWaiterParams = z.object({
  waiterId: z.string().min(1),
  tableIds: z.array(z.string().min(1)).min(1),
  date: z.coerce.date(),
  service: z.string().min(1),
});

const PrenotaParams = z.object({
  nome: z.string().min(1).max(80),
  telefono: z.string().max(40).nullish(),
  persone: z.coerce.number().int().min(1).max(50),
  quando: z.coerce.date(),
  durata: z.coerce.number().int().min(15).max(600),
  chiave: z.string().min(1).max(120),
  /**
   * Gli avvertimenti che chi ha confermato **aveva letto** nell'anteprima.
   *
   * Servono a dire quello che è cambiato in mezzo: se al momento della
   * conferma compare un avvertimento che nell'anteprima non c'era — il turno
   * si è riempito mentre si parlava — la prenotazione si fa comunque e lo si
   * **dice**. Senza questo confronto, l'unico modo di accorgersene sarebbe
   * riaprire la prenotazione.
   */
  avvisati: z.array(z.string()).default([]),
});

const AttesaParams = z.object({
  nome: z.string().min(1).max(80),
  telefono: z.string().max(40).nullish(),
  persone: z.coerce.number().int().min(1).max(50),
  quando: z.coerce.date().nullish(),
});

const RichiamataParams = z.object({
  telefono: z.string().min(3).max(40),
  nota: z.string().max(400).nullish(),
});

/** «ven 19 set alle 20:30», nel fuso del locale: è come lo si ripete a voce. */
function quandoSiLegge(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuso,
  }).format(quando);
}

export const actionExecutors: Record<string, ActionExecutor> = {
  /**
   * Executors only run after the user has explicitly confirmed the preview
   * built by the matching tool in tools/*.ts. They re-validate their params
   * with zod, but do NOT need to re-check tenant ownership of the ids
   * themselves — assignTableToWaiter() already scopes every lookup by
   * venueId internally, so a tampered id from a malicious client is rejected
   * there regardless of what this layer does.
   */
  assign_waiter: {
    /* La stessa della rotta che fa questa cosa dall'interfaccia
       (`/api/waiter-assignments/table`): `manage_staff`. Il commento di prima
       diceva «nessuna capacità, come l'interfaccia» ed era **vecchio** — quella
       rotta è stata irrigidita e questa era rimasta aperta. */
    ability: "manage_staff",
    async run(ctx, rawParams) {
      const params = AssignWaiterParams.parse(rawParams);
      for (const tableId of params.tableIds) {
        await assignTableToWaiter(ctx.venueId, {
          tableId,
          waiterId: params.waiterId,
          date: params.date,
          service: params.service,
        });
      }
      return { text: `Fatto: assegnato a ${params.tableIds.length} tavoli.` };
    },
  },

  crea_prenotazione: {
    ability: "manage_bookings",
    async run(ctx, rawParams) {
      const p = PrenotaParams.parse(rawParams);

      /*
        Regola 2: si ricontrolla **adesso**.

        Non per rifiutare — chi ha confermato sta parlando con una persona, e
        un software che gli dice no viene aggirato con una penna — ma perché
        fra l'anteprima e la conferma passano secondi in cui il turno può
        riempirsi. Quello che è cambiato si scrive nella risposta: è l'unica
        differenza fra «l'ho scritta» e «l'ho scritta, e adesso quel turno è
        pieno».
      */
      const esito = await checkAvailability(ctx.venueId, {
        startsAt: p.quando,
        durationMin: p.durata,
        partySize: p.persone,
        canale: "pubblico",
      });
      const nuovi = esito.issues
        .map((i) => i.message)
        .filter((m) => !p.avvisati.includes(m));

      /* Già scritta: la conferma è arrivata due volte. Si guarda **prima**,
         perché costa una lettura su un indice unico e risparmia tutto il
         resto. */
      const gia = await giaFattaConQuestaChiave(ctx.venueId, p.chiave);
      if (gia) {
        return {
          text: `Era già fatta: ${p.nome}, ${p.persone} ${p.persone === 1 ? "persona" : "persone"}, ${quandoSiLegge(p.quando, ctx.venueTimezone)}.`,
        };
      }

      let creata;
      try {
        creata = await createBooking(
          ctx.venueId,
          {
            guest: {
              firstName: p.nome,
              ...(p.telefono ? { phone: p.telefono } : {}),
            },
            partySize: p.persone,
            startsAt: p.quando,
            durationMin: p.durata,
          },
          {
            /* Interno: le regole del locale non bloccano chi sta parlando con un
             cliente. Gli avvertimenti li ha letti chi ha confermato. */
            canale: "interno",
            skipAvailabilityCheck: true,
            /* La chiave viene dall'anteprima: due conferme sullo stesso
             riquadro ritrovano la stessa prenotazione invece di crearne due,
             e lo scopre il database. */
            idempotencyKey: p.chiave,
            source: "PHONE",
            /* L'attore vero, perché questa prenotazione finisce nel registro
             delle azioni e nella storia della prenotazione: «l'ha presa» con
             un nome. Una scrittura dell'assistente senza responsabile sarebbe
             l'unica del prodotto. */
            actor: {
              userId: ctx.userId,
              orgId: ctx.orgId,
              venueId: ctx.venueId,
            },
          },
        );
      } catch (err) {
        /* Due conferme **in parallelo**: fra la lettura qui sopra e questa
           scrittura non si vedono, e l'unicità la garantisce l'indice. La
           seconda perde, e perdere qui vuol dire «esisteva già» — non «è
           andato storto». */
        if (eScontroDiChiave(err)) {
          const esistente = await giaFattaConQuestaChiave(
            ctx.venueId,
            p.chiave,
          );
          if (esistente) {
            return {
              text: `Era già fatta: prenotazione ${esistente.reference} a nome ${p.nome} per ${p.persone}.`,
            };
          }
        }
        throw err;
      }

      /* Il «fatto» esce solo qui, e porta il riferimento: chi ha parlato al
         telefono lo può leggere al cliente. */
      return {
        text: [
          /* Nome, coperti e quando — **non** il riferimento: in questo
             prodotto `Booking.reference` è un identificativo generato, non un
             codice che si legge al telefono, e metterlo qui darebbe a chi
             risponde una stringa da dettare che nessuno userà. */
          `Fatto: ${p.nome}, ${p.persone} ${p.persone === 1 ? "persona" : "persone"}, ${quandoSiLegge(p.quando, ctx.venueTimezone)}.`,
          ...(nuovi.length > 0 ? [`Nel frattempo: ${nuovi.join(" ")}`] : []),
        ].join(" "),
      };
    },
  },

  metti_in_attesa: {
    ability: "manage_bookings",
    async run(ctx, rawParams) {
      const p = AttesaParams.parse(rawParams);
      const creata = await addToWaitlist(ctx.venueId, {
        guestName: p.nome,
        phone: p.telefono ?? null,
        partySize: p.persone,
        desiredAt: p.quando ?? null,
      });
      return {
        text: `Fatto: ${p.nome} è in lista d'attesa, ${p.persone} ${p.persone === 1 ? "persona" : "persone"}${creata.position ? ` (posizione ${creata.position})` : ""}.`,
      };
    },
  },

  crea_richiamata: {
    ability: "use_phone",
    async run(ctx, rawParams) {
      const p = RichiamataParams.parse(rawParams);
      const esito = await apriRichiamata(
        ctx.venueId,
        { numero: p.telefono, nota: p.nota ?? null },
        ctx.userId,
      );
      return {
        text: esito.giaInCoda
          ? `${telefonoLeggibile(p.telefono)} era già fra le persone da richiamare.`
          : `Fatto: ${telefonoLeggibile(p.telefono)} è fra le persone da richiamare.`,
      };
    },
  },
};
