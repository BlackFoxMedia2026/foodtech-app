import { durataUmana } from "@/lib/durata";

/**
 * Cinque righe che dicono com'è andata, e cosa è andato storto.
 *
 * Analytics è una pagina lunga: undici pannelli, sedici numeri, quattro
 * grafici. Su una scrivania si legge; su un telefono è la stessa pagina
 * compressa, e chi la apre alle sette di sera fra due servizi non ha modo di
 * capire in trenta secondi se questa settimana è andata bene.
 *
 * Questa è la risposta a quella domanda, e ha quattro regole:
 *
 * - **si dicono solo fatti misurati.** Ogni riga porta il numero e su cosa è
 *   stato contato. Le misure che il locale non ha ancora — food cost senza
 *   costi dichiarati, voti senza risposte — **non compaiono**: non esiste una
 *   riga «dato non disponibile», perché occuperebbe il posto di un fatto;
 * - **prima quello che non va.** Chi apre una sintesi cerca i problemi: le
 *   righe sono ordinate per gravità, non per argomento;
 * - **niente aggettivi al posto dei numeri.** Non «gli incassi calano», ma
 *   «12.480 €, l'8% in meno del periodo prima»;
 * - **si tace quando non c'è niente da dire.** Un locale che va bene e non ha
 *   scostamenti si merita «nessuno scostamento rilevante», non cinque righe
 *   di rassicurazioni inventate.
 *
 * È una funzione **pura** sui numeri che la pagina ha già letto: non fa
 * nessuna lettura in più, e si può verificare senza database.
 */

export type TonoSintesi = "problema" | "attenzione" | "bene";

export type RigaSintesi = {
  /** Cosa è successo, in una riga. */
  testo: string;
  tono: TonoSintesi;
  /** Su cosa è stato misurato: un numero senza base è un'opinione. */
  base: string;
};

/** Oltre questo scostamento percentuale, un numero è una notizia. */
export const SCOSTAMENTO_RILEVANTE_PCT = 5;

/** Quante righe al massimo: una sintesi di dieci righe non è una sintesi. */
export const MAX_RIGHE_SINTESI = 5;

export type DatiSintesi = {
  periodoGiorni: number;
  valuta: string;
  ora: { covers: number; bookings: number; occupancyRate: number; noShowRate: number };
  prima: { covers: number; bookings: number };
  assenze: { assenze: number; copertiPersi: number; costoCents: number | null; quota: number | null };
  foodCost: { conti: number; incassoCents: number; foodCostPct: number | null; coperturaPct: number };
  incassoPrimaCents?: number | null;
  coda: { chiuse: number; copertiRecuperati: number; conversione: number | null };
  voti: { averageScore: number | null; responses: number; nps: number | null };
  rotazione: { misurate: number; durataMediaMin: number | null; durataPrevistaMin: number | null; abbastanza: boolean };
  giftCard: { carte: number; residuoCents: number };
  inattivi: number;
};

const ORDINE: Record<TonoSintesi, number> = { problema: 0, attenzione: 1, bene: 2 };

function euro(cents: number, valuta: string): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta, maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

/** Lo scostamento percentuale, nullo quando il periodo prima non ha niente da confrontare. */
export function scostamento(ora: number, prima: number): number | null {
  if (prima <= 0) return null;
  return Math.round(((ora - prima) / prima) * 100);
}

export function sintesiEsecutiva(d: DatiSintesi): RigaSintesi[] {
  const righe: RigaSintesi[] = [];
  const giorni = `${d.periodoGiorni} ${d.periodoGiorni === 1 ? "giorno" : "giorni"}`;

  /* --- 1. I coperti, con il confronto col periodo prima --- */
  const deltaCoperti = scostamento(d.ora.covers, d.prima.covers);
  if (deltaCoperti !== null && Math.abs(deltaCoperti) >= SCOSTAMENTO_RILEVANTE_PCT) {
    const giu = deltaCoperti < 0;
    righe.push({
      testo: `${d.ora.covers} coperti, il ${Math.abs(deltaCoperti)}% in ${
        giu ? "meno" : "più"
      } del periodo prima.`,
      tono: giu ? "problema" : "bene",
      base: `Coperti delle prenotazioni non annullate, ${giorni} contro i ${giorni} precedenti.`,
    });
  }

  /* --- 2. L'incasso, solo se ci sono conti chiusi --- */
  if (d.foodCost.conti > 0) {
    const delta =
      d.incassoPrimaCents != null ? scostamento(d.foodCost.incassoCents, d.incassoPrimaCents) : null;
    const confronto =
      delta !== null && Math.abs(delta) >= SCOSTAMENTO_RILEVANTE_PCT
        ? `, il ${Math.abs(delta)}% in ${delta < 0 ? "meno" : "più"} del periodo prima`
        : "";
    righe.push({
      testo: `${euro(d.foodCost.incassoCents, d.valuta)} incassati su ${d.foodCost.conti} ${
        d.foodCost.conti === 1 ? "conto chiuso" : "conti chiusi"
      }${confronto}.`,
      tono: delta !== null && delta <= -SCOSTAMENTO_RILEVANTE_PCT ? "problema" : "bene",
      base: "Somma dei conti chiusi nel periodo. I conti aperti non sono incasso.",
    });
  }

  /* --- 3. Le assenze: sempre, se ci sono state --- */
  if (d.assenze.assenze > 0) {
    const costo = d.assenze.costoCents != null ? ` — ${euro(d.assenze.costoCents, d.valuta)}` : "";
    righe.push({
      testo: `${d.assenze.assenze} ${
        d.assenze.assenze === 1 ? "assenza" : "assenze"
      }, ${d.assenze.copertiPersi} ${d.assenze.copertiPersi === 1 ? "coperto" : "coperti"} persi${costo}.`,
      tono: "problema",
      base:
        d.assenze.costoCents != null
          ? "Prenotazioni segnate come assenza; il valore di un coperto è quello dichiarato o misurato sui conti chiusi."
          : "Prenotazioni segnate come assenza. Il valore in euro manca perché lo scontrino medio non è dichiarato.",
    });
  }

  /* --- 4. Il costo del cibo, solo dove è misurato --- */
  if (d.foodCost.foodCostPct != null) {
    // Sopra il 35% è la soglia di cui parlano i ristoratori: non è una legge,
    // ed è per questo che la riga dice sempre la copertura.
    const alto = d.foodCost.foodCostPct > 35;
    righe.push({
      testo: `Costo del cibo al ${d.foodCost.foodCostPct}% sui piatti di cui conosciamo il costo.`,
      tono: alto ? "attenzione" : "bene",
      // Il numero va davanti anche per una ragione di lingua: «sul 84%» è
      // sbagliato e «sull'84%» dipende da come si pronuncia la cifra, che
      // cambia con il numero. Mettendolo per primo la frase resta giusta
      // qualunque percentuale esca.
      base: `${d.foodCost.coperturaPct}% dell'incasso ha un costo dichiarato: sul resto non si può dire.`,
    });
  }

  /* --- 5. La rotazione, se misurata: dice se la durata è tarata male --- */
  if (d.rotazione.abbastanza && d.rotazione.durataMediaMin != null && d.rotazione.durataPrevistaMin != null) {
    const scarto = d.rotazione.durataMediaMin - d.rotazione.durataPrevistaMin;
    if (Math.abs(scarto) >= 15) {
      righe.push({
        testo: `Le cene durano ${durataUmana(d.rotazione.durataMediaMin)}, ${durataUmana(
          Math.abs(scarto),
        )} ${scarto > 0 ? "più" : "meno"} del previsto.`,
        tono: "attenzione",
        base: `Misurato su ${d.rotazione.misurate} cene con arrivo e chiusura registrati. ${
          scarto > 0
            ? "Con la durata prevista più corta del vero, il motore vende tavoli che non si liberano in tempo."
            : "Con la durata prevista più lunga del vero, il motore rifiuta prenotazioni che ci starebbero."
        }`,
      });
    }
  }

  /* --- 6. I voti, solo con risposte --- */
  if (d.voti.averageScore != null && d.voti.responses > 0) {
    const basso = d.voti.averageScore < 4;
    righe.push({
      testo: `Voto medio ${d.voti.averageScore.toFixed(1)} su ${d.voti.responses} ${
        d.voti.responses === 1 ? "risposta" : "risposte"
      }.`,
      tono: basso ? "problema" : "bene",
      base: "Risposte al sondaggio inviato il giorno dopo la visita.",
    });
  }

  /* --- 7. La lista d'attesa: quanti coperti ha recuperato --- */
  if (d.coda.copertiRecuperati > 0) {
    righe.push({
      testo: `${d.coda.copertiRecuperati} coperti recuperati dalla lista d'attesa.`,
      tono: "bene",
      base: `Su ${d.coda.chiuse} righe chiuse nel periodo: sono persone che si sono sedute passando dalla lista.`,
    });
  }

  /* --- 8. I clienti che non tornano --- */
  if (d.inattivi > 0) {
    righe.push({
      testo: `${d.inattivi} clienti raggiungibili non tornano da tempo.`,
      tono: "attenzione",
      base: "Clienti con email e consenso al marketing, senza visite recenti: è lo stesso segmento che userebbe una campagna.",
    });
  }

  /* --- 9. Il debito delle gift card --- */
  if (d.giftCard.carte > 0 && d.giftCard.residuoCents > 0) {
    righe.push({
      testo: `${euro(d.giftCard.residuoCents, d.valuta)} di gift card da onorare.`,
      tono: "attenzione",
      base: `${d.giftCard.carte} ${
        d.giftCard.carte === 1 ? "carta" : "carte"
      } già incassate con cene ancora da servire: è un debito, non un incasso.`,
    });
  }

  // Prima i problemi. A parità di gravità resta l'ordine in cui sono scritte,
  // che è quello di importanza per un ristoratore: coperti, incasso, assenze.
  const ordinate = righe.sort((a, b) => ORDINE[a.tono] - ORDINE[b.tono]);
  return ordinate.slice(0, MAX_RIGHE_SINTESI);
}
