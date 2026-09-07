import type { FoodCostReport, PiattoVenduto } from "./food-cost";

/**
 * Il menu, incrociato: quanto piace per quanto rende.
 *
 * Il costo del cibo dice **quanto è rimasto**. Questa è l'altra domanda, che
 * un ristoratore si fa quando ristampa la carta: *quali piatti tengo, quali
 * cambio, quali tolgo*. Non servono dati nuovi — popolarità e margine ci sono
 * già entrambi: qui si incrociano, ed è tutto quello che è.
 *
 * I quattro nomi sono quelli del metodo classico (Kasavana-Smith, 1982):
 *
 * - **stella** — lo ordinano in tanti e rende: non si tocca;
 * - **cavallo** — lo ordinano in tanti e rende poco: è il piatto su cui pochi
 *   centesimi di prezzo o di porzione cambiano il mese;
 * - **enigma** — rende ma non lo ordina nessuno: è un problema di carta o di
 *   sala, non di cucina;
 * - **cane** — non piace e non rende: il primo candidato a uscire.
 *
 * Tre regole che tengono onesta la classifica, e sono più importanti della
 * classifica stessa:
 *
 * - **si classificano solo i piatti di cui conosciamo il costo.** Senza costo
 *   non c'è margine, e senza margine metà del quadro è inventata;
 * - **un piatto venduto due volte non è un cane.** Sotto un minimo di vendite
 *   il dato non dice niente, e dire «toglilo dalla carta» sulla base di due
 *   coperti è il modo di far perdere soldi a un ristorante con un grafico;
 * - **se il periodo è troppo corto, non si classifica niente.** Meglio dire
 *   «servono più serate» che dare quattro etichette a caso.
 *
 * La soglia di popolarità è quella del metodo: si è «popolari» quando si
 * vende almeno il 70% di quello che si venderebbe dividendo le vendite in
 * parti uguali fra i piatti. Il 70% non è nostro: è la regola, ed è scritta
 * qui perché chi la legge possa discuterla.
 */

export type Quadrante = "stella" | "cavallo" | "enigma" | "cane";

export type PiattoClassificato = {
  menuItemId: string | null;
  name: string;
  quantita: number;
  /** Quota sulle vendite dei piatti classificati, in percentuale. */
  quotaPct: number;
  /** Quanto resta su **un** piatto: è il numero con cui si confrontano. */
  margineUnitCents: number;
  quadrante: Quadrante;
};

export type MotivoEsclusione = "senza_costo" | "poche_vendite";

export type MenuEngineering = {
  /** Falso quando il periodo non basta: in quel caso `piatti` è vuoto. */
  abbastanzaDati: boolean;
  /** Perché non basta, quando non basta. */
  perche: string | null;
  vendutiClassificati: number;
  /** Sopra questa quota un piatto è «popolare», in percentuale. */
  sogliaPopolaritaPct: number;
  /** Il margine unitario medio, pesato sulle quantità vendute. */
  margineMedioCents: number;
  piatti: PiattoClassificato[];
  esclusi: { name: string; quantita: number; motivo: MotivoEsclusione }[];
};

/** Sotto queste vendite, di un piatto non si dice niente. */
export const MINIMO_VENDITE_PIATTO = 3;

/** Sotto questi numeri non si classifica il menu: il periodo è troppo corto. */
export const MINIMO_PIATTI = 4;
export const MINIMO_VENDITE_TOTALI = 20;

/** La regola del metodo: popolare = almeno il 70% della quota media. */
const FATTORE_POPOLARITA = 0.7;

export const NOME_QUADRANTE: Record<Quadrante, string> = {
  stella: "Stelle",
  cavallo: "Cavalli",
  enigma: "Enigmi",
  cane: "Cani",
};

export const SPIEGAZIONE_QUADRANTE: Record<Quadrante, string> = {
  stella: "Li ordinano in tanti e rendono. Non toccarli: semmai mettili dove si leggono per primi.",
  cavallo:
    "Li ordinano in tanti e rendono poco. Qui pochi centesimi di prezzo, o una porzione rivista, cambiano il mese: sono i piatti che passano per più tavoli.",
  enigma:
    "Rendono, ma non li ordina quasi nessuno. Non è un problema di cucina: è dove stanno nella carta, o se qualcuno in sala li racconta.",
  cane: "Non piacciono e non rendono. Sono i primi candidati a uscire dalla carta, o a essere rifatti da capo.",
};

function margineUnitario(p: PiattoVenduto): number | null {
  if (p.margineCents == null || p.quantita <= 0) return null;
  return Math.round(p.margineCents / p.quantita);
}

/**
 * Classifica i piatti venduti in un periodo.
 *
 * Prende il rendiconto del costo del cibo invece di rifare le stesse letture:
 * è la stessa serata, e due funzioni che contano gli stessi piatti in due
 * modi diversi sono un difetto che questo progetto ha già visto.
 */
export function menuEngineering(report: FoodCostReport): MenuEngineering {
  const esclusi: MenuEngineering["esclusi"] = report.senzaCosto.map((p) => ({
    name: p.name,
    quantita: p.quantita,
    motivo: "senza_costo" as const,
  }));

  const candidati: { p: PiattoVenduto; margineUnitCents: number }[] = [];
  for (const p of report.piatti) {
    const m = margineUnitario(p);
    if (m == null) continue;
    if (p.quantita < MINIMO_VENDITE_PIATTO) {
      esclusi.push({ name: p.name, quantita: p.quantita, motivo: "poche_vendite" });
      continue;
    }
    candidati.push({ p, margineUnitCents: m });
  }

  const vendutiClassificati = candidati.reduce((n, c) => n + c.p.quantita, 0);

  if (candidati.length < MINIMO_PIATTI || vendutiClassificati < MINIMO_VENDITE_TOTALI) {
    return {
      abbastanzaDati: false,
      perche:
        candidati.length < MINIMO_PIATTI
          ? `Servono almeno ${MINIMO_PIATTI} piatti col costo dichiarato e venduti abbastanza: qui ce ne ${
              candidati.length === 1 ? "è 1" : `sono ${candidati.length}`
            }.`
          : `Servono almeno ${MINIMO_VENDITE_TOTALI} piatti venduti nel periodo: qui sono ${vendutiClassificati}.`,
      vendutiClassificati,
      sogliaPopolaritaPct: 0,
      margineMedioCents: 0,
      piatti: [],
      esclusi,
    };
  }

  // La quota media se le vendite fossero divise in parti uguali, scontata del
  // 30% come vuole il metodo: sopra sei popolare, sotto no.
  const sogliaQuota = (1 / candidati.length) * FATTORE_POPOLARITA;
  const margineMedioCents = Math.round(
    candidati.reduce((s, c) => s + c.margineUnitCents * c.p.quantita, 0) / vendutiClassificati,
  );

  const piatti: PiattoClassificato[] = candidati.map(({ p, margineUnitCents }) => {
    const quota = p.quantita / vendutiClassificati;
    const popolare = quota >= sogliaQuota;
    const redditizio = margineUnitCents >= margineMedioCents;
    const quadrante: Quadrante = popolare
      ? redditizio
        ? "stella"
        : "cavallo"
      : redditizio
        ? "enigma"
        : "cane";
    return {
      menuItemId: p.menuItemId,
      name: p.name,
      quantita: p.quantita,
      quotaPct: Math.round(quota * 100),
      margineUnitCents,
      quadrante,
    };
  });

  // Dentro ogni gruppo, prima quello che vende di più: è l'ordine in cui
  // conviene guardarli, perché è l'ordine in cui pesano.
  const ORDINE: Record<Quadrante, number> = { stella: 0, cavallo: 1, enigma: 2, cane: 3 };
  piatti.sort((a, b) => ORDINE[a.quadrante] - ORDINE[b.quadrante] || b.quantita - a.quantita);

  return {
    abbastanzaDati: true,
    perche: null,
    vendutiClassificati,
    sogliaPopolaritaPct: Math.round(sogliaQuota * 100),
    margineMedioCents,
    piatti,
    esclusi,
  };
}
