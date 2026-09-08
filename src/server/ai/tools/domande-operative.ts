import { db } from "@/lib/db";
import { endOfDay, startOfDay } from "@/lib/utils";
import { durataUmana } from "@/lib/durata";
import { frasePrevisione } from "@/lib/liberazione";
import { getFloorLive } from "@/server/floor-live";
import { NO_SHOW_RISK_MIN } from "@/server/service-intelligence";
import { getFoodCost } from "@/server/food-cost";
import { menuEngineering } from "@/server/menu-engineering";
import { getOccupancyByWeekday } from "@/server/forecast";
import { previewSegment } from "@/server/campaigns";
import { TAG_RULES } from "@/server/guest-intelligence";
import type { Tool } from "../types";

/**
 * Le cinque domande operative, dentro l'agente.
 *
 * L'agente sapeva rispondere a «quanti coperti abbiamo» e «quali tavoli sono
 * liberi»: numeri che stanno già scritti sulla schermata che chi chiede ha
 * davanti. Le domande che un ristoratore fa davvero sono altre cinque — chi
 * rischia di non presentarsi, quali tavoli stanno andando lunghi, chi non
 * torna, quali piatti rendono meno, qual è il giorno peggiore — e a quelle
 * non rispondeva nessuno.
 *
 * Tutte e cinque si rispondono con dati che **esistono già**: nessuna
 * colonna nuova, nessun modello, nessuna chiamata a un servizio esterno.
 * Sono gli stessi conti delle schermate, chiesti a parole.
 *
 * Due regole valgono per tutte:
 *
 * - **niente si stima.** Dove la misura non basta, la risposta è che non
 *   basta, con quanto manca: «servono almeno quattro piatti col costo
 *   dichiarato, qui ce ne sono due» è una risposta utile, un numero inventato
 *   no;
 * - **la risposta dice sempre su cosa poggia.** Un agente che dà un numero
 *   senza la sua base insegna a fidarsi di lui invece che dei fatti, e il
 *   giorno che sbaglia nessuno se ne accorge.
 */

/* -------------------------------------------------------------------------- */
/*  1. Chi rischia di non presentarsi                                        */
/* -------------------------------------------------------------------------- */

export const chiRischiaAssenzaTool: Tool = {
  ability: null,
  async run(ctx) {
    const now = new Date();
    const prenotazioni = await db.booking.findMany({
      where: {
        venueId: ctx.venueId,
        deletedAt: null,
        startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      include: { guest: { select: { firstName: true, lastName: true, noShowCount: true, totalVisits: true } } },
      orderBy: { startsAt: "asc" },
    });

    const nome = (b: (typeof prenotazioni)[number]) =>
      b.guest ? `${b.guest.firstName}${b.guest.lastName ? ` ${b.guest.lastName}` : ""}` : "Senza nome";

    // Due cose diverse, e vanno dette separate: chi è **già** in ritardo (su
    // cui una telefonata funziona ancora) e chi ha una storia di assenze (su
    // cui la telefonata si fa prima).
    const inRitardo = prenotazioni
      .map((b) => ({ b, ritardo: Math.round((now.getTime() - b.startsAt.getTime()) / 60_000) }))
      .filter((x) => x.ritardo >= NO_SHOW_RISK_MIN)
      .sort((a, b) => a.ritardo - b.ritardo);

    const conStoria = prenotazioni.filter(
      (b) => (b.guest?.noShowCount ?? 0) > 0 && b.startsAt.getTime() > now.getTime(),
    );

    if (inRitardo.length === 0 && conStoria.length === 0) {
      return {
        text: "Nessuno rischia di mancare, per quello che si può misurare: nessun ritardo oltre i venticinque minuti, e nessuno di chi deve ancora arrivare ha assenze sulla scheda.",
      };
    }

    const righe = [
      ...inRitardo.map(({ b, ritardo }) => ({
        title: `${nome(b)} — in ritardo di ${durataUmana(ritardo)}`,
        subtitle: `${b.partySize} ${b.partySize === 1 ? "persona" : "persone"}${
          (b.guest?.noShowCount ?? 0) > 0 ? `, e ha già ${b.guest!.noShowCount} assenze` : ""
        }`,
      })),
      ...conStoria.map((b) => ({
        title: `${nome(b)} — ${b.guest!.noShowCount} ${
          b.guest!.noShowCount === 1 ? "assenza" : "assenze"
        } sulla scheda`,
        subtitle: `Arriva più tardi, in ${b.partySize}. Visite fatte: ${b.guest!.totalVisits}`,
      })),
    ];

    const pezzi: string[] = [];
    if (inRitardo.length > 0) {
      pezzi.push(
        `${inRitardo.length} ${
          inRitardo.length === 1 ? "prenotazione è" : "prenotazioni sono"
        } in ritardo di oltre ${durataUmana(NO_SHOW_RISK_MIN)}`,
      );
    }
    if (conStoria.length > 0) {
      pezzi.push(
        `${conStoria.length} di chi deve ancora arrivare ha assenze sulla scheda`,
      );
    }

    return {
      text: `${pezzi.join(", e ")}. È tutto quello che si può dire: il rischio non è un punteggio, sono i ritardi di adesso e le assenze già registrate.`,
      structured: { type: "list", title: "Chi rischia di mancare", items: righe.slice(0, 8) },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  2. Quali tavoli stanno andando lunghi                                    */
/* -------------------------------------------------------------------------- */

export const tavoliLunghiTool: Tool = {
  ability: null,
  async run(ctx) {
    const now = new Date();
    const live = await getFloorLive(ctx.venueId, { now });
    const tavoli = await db.table.findMany({
      where: { venueId: ctx.venueId },
      select: { id: true, label: true },
    });
    const etichetta = new Map(tavoli.map((t) => [t.id, t.label]));

    const oltre = Object.values(live.byTableId)
      .filter((t) => t.current?.liberoVerso && t.current.liberoVerso.minuti < 0)
      .sort((a, b) => a.current!.liberoVerso!.minuti - b.current!.liberoVerso!.minuti);

    if (oltre.length === 0) {
      return {
        text: live.durata
          ? `Nessun tavolo è oltre la durata prevista. La previsione usa la durata misurata qui: ${durataUmana(
              live.durata.medianaMin,
            )}, su ${live.durata.misurate} cene chiuse.`
          : "Nessun tavolo è oltre la durata prevista. La previsione usa la durata scritta sulle prenotazioni: non ci sono ancora abbastanza cene chiuse per misurarla.",
      };
    }

    const items = oltre.map((t) => {
      const c = t.current!;
      const conto = c.conto
        ? c.conto.righe === 0
          ? "conto aperto, nulla battuto"
          : `conto ${(c.conto.totalCents / 100).toFixed(0)} € su ${c.conto.righe} ${
              c.conto.righe === 1 ? "riga" : "righe"
            }`
        : "nessun conto aperto";
      return {
        title: `${etichetta.get(t.tableId) ?? "Tavolo"} — oltre di ${durataUmana(
          Math.abs(c.liberoVerso!.minuti),
        )}`,
        subtitle: `${c.guestName}, ${c.partySize} ${c.partySize === 1 ? "persona" : "persone"} · ${conto}${
          t.next ? ` · poi arriva ${t.next.guestName}` : ""
        }`,
      };
    });

    const primo = oltre[0].current!;
    return {
      text: `${oltre.length} ${oltre.length === 1 ? "tavolo è" : "tavoli sono"} oltre la durata prevista. ${
        frasePrevisione(primo.liberoVerso!, live.timezone).dettaglio
      } Un tavolo oltre non è un problema se nessuno lo aspetta: guarda se c'è chi arriva.`,
      structured: { type: "list", title: "Tavoli oltre la durata", items },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  3. Chi non torna                                                         */
/* -------------------------------------------------------------------------- */

export const chiNonTornaTool: Tool = {
  ability: "edit_marketing",
  async run(ctx) {
    const anteprima = await previewSegment(ctx.venueId, { audienceTag: "inattivi" });

    if (anteprima.totalMatchingFilters === 0) {
      return {
        text: `Nessun cliente risulta inattivo: tutti quelli in archivio sono passati negli ultimi ${TAG_RULES.inactiveDays} giorni.`,
      };
    }

    const raggiungibili = anteprima.finalRecipients;
    const senzaEmail = anteprima.excludedNoEmail;
    const senzaConsenso = anteprima.excludedNoConsent;

    return {
      text:
        `${anteprima.totalMatchingFilters} clienti non passano da più di ${TAG_RULES.inactiveDays} giorni. ` +
        `Di questi, ${raggiungibili} si possono invitare — hanno email e consenso al marketing. ` +
        `Gli altri no: ${senzaEmail} non hanno un'email, ${senzaConsenso} non hanno dato il consenso. ` +
        `Scrivere a chi non ha acconsentito non è una scorciatoia, è una multa.`,
      structured: {
        type: "metric",
        label: "Clienti che non tornano",
        value: String(anteprima.totalMatchingFilters),
        hint: `${raggiungibili} invitabili · ${senzaEmail} senza email · ${senzaConsenso} senza consenso`,
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  4. Quali piatti rendono meno                                             */
/* -------------------------------------------------------------------------- */

/** Su quanti giorni si guarda la carta quando nessuno lo dice. */
const GIORNI_CARTA = 30;

export const piattiCheRendonoMenoTool: Tool = {
  ability: "view_revenue",
  async run(ctx) {
    const now = new Date();
    const da = new Date(now.getTime() - GIORNI_CARTA * 86_400_000);
    const report = await getFoodCost(ctx.venueId, da, now);
    const analisi = menuEngineering(report);

    if (!analisi.abbastanzaDati) {
      return {
        text: `Non lo so ancora, e dirti un numero sarebbe peggio. ${analisi.perche ?? ""} Il costo dei piatti si dichiara dalla carta: senza quello, il margine non esiste.`.trim(),
      };
    }

    // Chi rende meno: il margine unitario più basso fra i piatti classificati.
    // Non «i cani»: quelli sono poco venduti **e** poco redditizi, e la
    // domanda era sul rendimento.
    const peggiori = [...analisi.piatti]
      .sort((a, b) => a.margineUnitCents - b.margineUnitCents)
      .slice(0, 5);

    const items = peggiori.map((p) => ({
      title: `${p.name} — ${(p.margineUnitCents / 100).toFixed(2).replace(".", ",")} € di margine a piatto`,
      subtitle: `${p.quantita} venduti (${p.quotaPct}% del totale) · ${QUADRANTE[p.quadrante]}`,
    }));

    const esclusiSenzaCosto = analisi.esclusi.filter((e) => e.motivo === "senza_costo").length;

    return {
      text:
        `Fra i piatti di cui conosciamo il costo, quello che rende meno è ${peggiori[0].name}: ` +
        `${(peggiori[0].margineUnitCents / 100).toFixed(2).replace(".", ",")} € a piatto, contro una media di ` +
        `${(analisi.margineMedioCents / 100).toFixed(2).replace(".", ",")} €. ` +
        `Misurato su ${analisi.vendutiClassificati} piatti venduti negli ultimi ${GIORNI_CARTA} giorni` +
        (esclusiSenzaCosto > 0
          ? `, e ${esclusiSenzaCosto} piatti sono rimasti fuori perché non hanno un costo dichiarato.`
          : "."),
      structured: { type: "list", title: "I piatti che rendono meno", items },
    };
  },
};

const QUADRANTE: Record<string, string> = {
  stella: "popolare e redditizio",
  cavallo: "popolare ma poco redditizio",
  enigma: "redditizio ma poco venduto",
  cane: "poco venduto e poco redditizio",
};

/* -------------------------------------------------------------------------- */
/*  5. Qual è il giorno peggiore                                             */
/* -------------------------------------------------------------------------- */

/** Sotto questo numero di giorni misurati, di un giorno della settimana non si dice niente. */
export const MINIMO_GIORNI_MISURATI = 3;

export const giornoPeggioreTool: Tool = {
  ability: null,
  async run(ctx) {
    const settimana = await getOccupancyByWeekday(ctx.venueId);

    // Solo i giorni con abbastanza misure **e** una capienza dichiarata:
    // senza capienza l'occupazione non è calcolabile, e un giorno misurato
    // due volte è la storia di due serate.
    const misurati = settimana.filter(
      (g) => g.giorni >= MINIMO_GIORNI_MISURATI && g.occupancyPct != null,
    );

    if (misurati.length < 2) {
      return {
        text: `Non ci sono ancora abbastanza serate misurate per confrontare i giorni: servono almeno ${MINIMO_GIORNI_MISURATI} giorni per ciascuno, con la capienza del turno dichiarata. Confrontare due serate sarebbe un aneddoto, non una risposta.`,
      };
    }

    const ordinati = [...misurati].sort((a, b) => a.occupancyPct! - b.occupancyPct!);
    const peggiore = ordinati[0];
    const migliore = ordinati.at(-1)!;

    return {
      text:
        `Il giorno più vuoto è ${peggiore.label}: ${peggiore.occupancyPct}% di occupazione, ` +
        `${peggiore.copertiMedi} coperti in media su ${peggiore.giorni} ${
          peggiore.giorni === 1 ? "serata misurata" : "serate misurate"
        }. Il più pieno è ${migliore.label} col ${migliore.occupancyPct}%. ` +
        `Sono medie sulle serate registrate, non su tutto il calendario: le settimane prima che il locale usasse Tavolo non contano.`,
      structured: {
        type: "metric",
        label: "Giorno più vuoto",
        value: peggiore.label,
        hint: `${peggiore.occupancyPct}% · ${peggiore.copertiMedi} coperti medi su ${peggiore.giorni} serate`,
      },
    };
  },
};
