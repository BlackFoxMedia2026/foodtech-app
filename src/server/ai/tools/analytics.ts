import { getAnalytics } from "@/server/analytics";
import type { Tool } from "../types";

/**
 * «Quanto abbiamo incassato?»
 *
 * ## Zero e «non misurato» sono due risposte diverse
 *
 * `getAnalytics` restituisce `ospitiConConti` **proprio** per distinguerle:
 * quel modulo è stato corretto dopo che la Panoramica mostrava «0,00 €»
 * accanto a una freccia di tendenza, cioè un numero inventato presentato come
 * dato. Questo strumento lo ignorava e ripeteva lo zero **a voce**, dove è
 * ancora più credibile — perché sembra una risposta.
 *
 * Quindi: se nessun conto è stato chiuso, si dice che non si può misurare e
 * **quanto manca** per poterlo fare. Una casella vuota è più utile di una
 * cifra falsa; una frase che spiega perché è vuota è più utile di entrambe.
 */
export const getPeriodRevenueTool: Tool = {
  ability: "view_revenue",
  async run(ctx) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    const a = await getAnalytics(ctx.venueId, from, to);

    if (a.ospitiConConti === 0) {
      return {
        text:
          `Negli ultimi 30 giorni: ${a.bookings} prenotazioni e ${a.covers} coperti. ` +
          `La spesa media non si può ancora misurare: nessun conto è stato chiuso in Tavolo ` +
          `in questo periodo, e senza conti non c'è niente da dividere.`,
        structured: {
          type: "metric",
          label: "Coperti (30gg)",
          value: String(a.covers),
          hint: `${a.bookings} prenotazioni · spesa media non misurabile`,
        },
      };
    }

    const media = (a.avgSpendCents / 100).toFixed(2);
    return {
      text:
        `Negli ultimi 30 giorni: ${a.bookings} prenotazioni, ${a.covers} coperti, ` +
        `spesa media per ospite ${media}€ — calcolata su ${a.ospitiConConti} ` +
        `${a.ospitiConConti === 1 ? "ospite" : "ospiti"} con almeno un conto chiuso.`,
      structured: {
        type: "metric",
        label: "Spesa media (30gg)",
        value: `${media}€`,
        /* Su quanti è calcolata: una media su tre ospiti e una su trecento
           sono due numeri diversi, e chi decide deve poterlo sapere. */
        hint: `${a.bookings} prenotazioni · su ${a.ospitiConConti} ospiti con conti`,
      },
    };
  },
};
