import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CATALOGO, voceDi, type VoceCatalogo } from "./registry";
import { messaggioPerIlRistoratore, type AzioneSuggerita } from "./errori";
import { motivoNonInstallabile, preferenzeDi, sospensioneDi } from "./installazioni";
import { faseDi, fasePredefinita } from "./certificazione/accesso";
import { FASI_RILASCIO, type FaseRilascio } from "./certificazione/livelli";
import { richiesteDelLocale } from "./richieste";
import { assistenzaDelLocale, type AssistenzaCliente } from "./assistenza";
import { anteprimaImportazione, type AnteprimaImportazione } from "./importazione";
import {
  condizioneDi,
  ETICHETTA_STATO_CLIENTE,
  funzionalitaPerIlCliente,
  gruppiAccesi,
  passoDaRiprendere,
  statoPerIlCliente,
  STATI_DA_SISTEMARE,
  verificaInCorso,
  vistaVoceCliente,
  type AzioneCliente,
  type Condizione,
  type Funzionalita,
  type MotivoTecnico,
  type StatoCliente,
  type VoceCliente,
} from "./cliente";
import { ORE_SYNC_VECCHIA } from "./stati";
import type { Salute, StatoInstallazione } from "./tipi";

/**
 * **Ciò che dell'integrazione arriva al browser di un ristoratore.**
 *
 * La vista interna (`vista.ts`, `vista-assistenza.ts`) porta tutto —
 * documentazione, adattatore, matrice delle risorse, permessi, cosa manca per
 * operare — e la legge solo Foodtech (/admin/integrazioni). Questa porta il
 * minimo per decidere e agire: nome, a che cosa serve, lo stato della
 * connessione, un pulsante, e per un'integrazione collegata l'ultima
 * verifica, l'ultima sincronizzazione, che cosa fa davvero e l'ultimo
 * problema detto a parole.
 *
 * Come l'altra, si costruisce **per elenco di campi scelti**: niente
 * `lastError`, niente `webhookKey`, niente segreti, niente identificativi
 * del fornitore, niente riferimenti di correlazione. Il test
 * `integrazioni-esperienza-cliente` serializza il risultato e ci cerca le
 * parole della vista interna.
 */

export type SchedaCliente = {
  slug: string;
  nome: string;
  categoria: string;
  descrizione: string;
  monogramma: string;
  logo: string | null;
  stato: StatoCliente;
  etichettaStato: string;
  azione: AzioneCliente;
  inAttivazione: boolean;
  /** Ancora in prova presso Foodtech: la scheda lo dice anche quando è collegata. */
  anteprima: boolean;
  hrefNativa: string | null;
  /** Una riga sotto lo stato: la sede collegata, o il problema. */
  riga: string | null;
};

export type InstallazioneCliente = {
  condizione: Condizione;
  passo: number;
  credenzialiPresenti: boolean;
  account: string | null;
  sede: string | null;
  /** L'ultima verifica della connessione con il fornitore, e com'è andata. */
  ultimaVerificaIl: string | null;
  ultimaVerificaOk: boolean | null;
  verificaInCorso: boolean;
  ultimaSyncIl: string | null;
  ultimaSyncRiuscitaIl: string | null;
  problema: { titolo: string; spiegazione: string; azione: AzioneSuggerita; il: string | null } | null;
  /**
   * La sincronizzazione, **separata** dalla connessione: un collegamento
   * riuscito è «Collegato» anche prima che i dati arrivino.
   * - `in_attesa`: collegata (o ricollegata) e nessuna sincronizzazione dopo;
   * - `in_corso`; `riuscita`: l'ultimo tentativo è andato; `non_riuscita`.
   */
  sincronizzazione: "in_attesa" | "in_corso" | "riuscita" | "non_riuscita" | null;
  /** Gli interruttori accesi adesso. */
  gruppiAccesi: string[];
  /** Che cosa fa davvero adesso, e che cosa è ancora in preparazione. */
  funzionalita: Funzionalita[];
  /** Le scelte del cliente da riproporre nel wizard, anche dopo una disconnessione. `null` se non ha mai scelto. */
  gruppiScelti: string[] | null;
  /** I valori scelti (non segreti), per riaprire il wizard con le scelte di prima. */
  configurazione: Record<string, string>;
  collegataIl: string | null;
};

export type ElementoSincronizzato = { tipo: "TABLE" | "PRODUCT" | "CATEGORY"; etichetta: string; totale: number; daCollegare: number };

export type DettaglioCliente = {
  voce: VoceCliente;
  stato: StatoCliente;
  etichettaStato: string;
  azione: AzioneCliente;
  inAttivazione: boolean;
  anteprima: boolean;
  richiestaIl: string | null;
  installazione: InstallazioneCliente | null;
  elementi: ElementoSincronizzato[];
  importabile: AnteprimaImportazione | null;
  /** Solo per chi può configurare, e solo per le voci che lo chiedono. */
  aggiornamenti: { indirizzo: string; segretoPresente: boolean } | null;
  /** «Chiedi aiuto a Foodtech»: la richiesta aperta e la delega, se ci sono. `null` per le voci che non si configurano qui. */
  assistenza: AssistenzaCliente | null;
  assistenzaPossibile: boolean;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function motivoTecnico(v: VoceCatalogo): MotivoTecnico {
  return (motivoNonInstallabile(v)?.codice as MotivoTecnico | undefined) ?? null;
}

/** Le colonne lette: `lastError` (il dettaglio tecnico) e le credenziali non ci sono. */
const SELEZIONE = {
  id: true,
  integrationSlug: true,
  status: true,
  healthStatus: true,
  lastErrorCode: true,
  lastErrorAt: true,
  enabledCapabilities: true,
  configuration: true,
  externalAccountName: true,
  externalLocationName: true,
  lastTestAt: true,
  lastTestOk: true,
  testStartedAt: true,
  lastSyncAt: true,
  lastSuccessfulSyncAt: true,
  activatedAt: true,
  metadata: true,
  webhookKey: true,
  credential: { select: { id: true } },
} as const;

type RigaInstallazione = Prisma.IntegrationInstallationGetPayload<{ select: typeof SELEZIONE }>;

/**
 * La salute come la legge il cliente. «Degradata» senza un codice d'errore
 * vuol dire una di due cose: la sincronizzazione è vecchia (e allora va
 * detto), oppure c'è stato un errore **già risolto** — la chiave sostituita,
 * la prova riuscita — e la prima sincronizzazione dopo non è ancora passata.
 * Nel secondo caso dire «errore» a chi ha appena ricollegato sarebbe falso.
 */
function saluteCliente(i: RigaInstallazione, adesso = Date.now()): Salute {
  const s = i.healthStatus as Salute;
  if (s !== "DEGRADED" || i.lastErrorCode) return s;
  // Appena collegata o ricollegata: la connessione è buona, i dati devono ancora arrivare.
  if (statoSincronizzazione(i) === "in_attesa") return "HEALTHY";
  const vecchia = !!i.lastSuccessfulSyncAt && adesso - i.lastSuccessfulSyncAt.getTime() > ORE_SYNC_VECCHIA * 3_600_000;
  return vecchia ? "DEGRADED" : "HEALTHY";
}

function ingressoInstallazione(i: RigaInstallazione) {
  return {
    status: i.status as StatoInstallazione,
    salute: saluteCliente(i),
    sospesa: !!sospensioneDi(i),
    verificaInCorso: verificaInCorso(i),
  };
}

function vistaInstallazioneCliente(i: RigaInstallazione, v: VoceCatalogo): InstallazioneCliente {
  const status = i.status as StatoInstallazione;
  const salute = saluteCliente(i);
  const sospesa = !!sospensioneDi(i);
  const condizione = condizioneDi(status, salute, sospesa);
  const conProblema = condizione === "da_ricollegare" || condizione === "errore" || (condizione === "da_controllare" && !!i.lastErrorCode);
  const conf = (i.configuration ?? {}) as Record<string, unknown>;
  const nonSegreti = new Set(v.configurazione.filter((c) => c.tipo !== "segreto").map((c) => c.chiave));
  const m = conProblema ? messaggioPerIlRistoratore(i.lastErrorCode, v.nome, v.messaggi) : null;
  return {
    condizione,
    passo: passoDaRiprendere({ status, credenzialiPresenti: !!i.credential }),
    credenzialiPresenti: !!i.credential,
    account: i.externalAccountName,
    sede: i.externalLocationName,
    ultimaVerificaIl: iso(i.lastTestAt),
    ultimaVerificaOk: i.lastTestOk,
    verificaInCorso: verificaInCorso(i),
    ultimaSyncIl: iso(i.lastSyncAt),
    ultimaSyncRiuscitaIl: iso(i.lastSuccessfulSyncAt),
    problema: m ? { titolo: m.titolo, spiegazione: m.spiegazione, azione: m.azione, il: iso(i.lastErrorAt) } : null,
    sincronizzazione: statoSincronizzazione(i),
    gruppiAccesi: gruppiAccesi(v.capacita, i.enabledCapabilities),
    funzionalita: funzionalitaPerIlCliente(v.capacita, i.enabledCapabilities),
    gruppiScelti: preferenzeDi(i),
    configurazione: Object.fromEntries(
      Object.entries(conf)
        .filter(([k]) => nonSegreti.has(k))
        .map(([k, x]) => [k, String(x)]),
    ),
    collegataIl: iso(i.activatedAt),
  };
}

function statoSincronizzazione(i: RigaInstallazione): InstallazioneCliente["sincronizzazione"] {
  if (!i.activatedAt) return null;
  if (i.status === "SYNCING") return "in_corso";
  if (!i.lastSyncAt || i.lastSyncAt < i.activatedAt) return "in_attesa";
  return i.lastSuccessfulSyncAt && i.lastSuccessfulSyncAt >= i.lastSyncAt ? "riuscita" : "non_riuscita";
}

function rigaScheda(inst: InstallazioneCliente | null, portaDati: boolean): string | null {
  if (!inst) return null;
  // Un collegamento di solo profilo non sincronizza: niente «prima sincronizzazione in attesa».
  if (!portaDati) inst = { ...inst, sincronizzazione: null };
  if (inst.condizione === "sospesa") return "In pausa: contatta l'assistenza Foodtech.";
  if (inst.condizione === "in_pausa") return "Sincronizzazione in pausa.";
  if (inst.condizione === "in_configurazione") return "Collegamento da completare.";
  if (inst.problema) return inst.problema.titolo;
  if (inst.sincronizzazione === "in_attesa") return inst.sede ? `${inst.sede} · Prima sincronizzazione in attesa` : "Prima sincronizzazione in attesa";
  return inst.sede;
}

/** Il catalogo visto da un ristoratore. Da sistemare prima, poi le collegate, poi le collegabili, poi le altre. */
export async function catalogoCliente(venueId: string, statoNativo: { stripe: boolean }): Promise<SchedaCliente[]> {
  const [installazioni, fasi, accessi, richieste] = await Promise.all([
    db.integrationInstallation.findMany({ where: { venueId }, select: SELEZIONE }),
    db.integrationRollout.findMany({ select: { integrationSlug: true, stage: true } }),
    db.integrationBetaAccess.findMany({ where: { venueId, enabled: true }, select: { integrationSlug: true } }),
    richiesteDelLocale(venueId),
  ]);
  const perSlug = new Map(installazioni.map((i) => [i.integrationSlug, i]));
  const fasePer = new Map(fasi.map((f) => [f.integrationSlug, f.stage as FaseRilascio]));
  const beta = new Set(accessi.map((a) => a.integrationSlug));

  const schede = CATALOGO.map((v): SchedaCliente => {
    const i = perSlug.get(v.slug);
    const inst = i && i.status !== "NOT_INSTALLED" ? vistaInstallazioneCliente(i, v) : null;
    const scritta = fasePer.get(v.slug);
    const e = statoPerIlCliente({
      nativa: v.nativa ? { collegata: v.slug === "stripe" && statoNativo.stripe } : null,
      motivoTecnico: motivoTecnico(v),
      fase: scritta && FASI_RILASCIO.includes(scritta) ? scritta : fasePredefinita(v),
      betaAbilitata: beta.has(v.slug),
      installazione: i ? ingressoInstallazione(i) : null,
      richiesta: richieste.get(v.slug) ?? null,
    });
    return {
      slug: v.slug,
      nome: v.nome,
      categoria: vistaVoceCliente(v).categoria,
      descrizione: v.descrizione,
      monogramma: v.logo.monogramma,
      logo: v.logo.src ?? null,
      stato: e.stato,
      etichettaStato: ETICHETTA_STATO_CLIENTE[e.stato],
      azione: e.azione,
      inAttivazione: e.inAttivazione,
      anteprima: e.anteprima,
      hrefNativa: v.nativa?.href ?? null,
      riga: rigaScheda(inst, vistaVoceCliente(v).portaDati),
    };
  });

  const peso = (s: SchedaCliente) =>
    STATI_DA_SISTEMARE.has(s.stato)
      ? 0
      : s.stato === "COLLEGATO" || s.stato === "VERIFICA_IN_CORSO" || s.stato === "IN_PAUSA"
        ? 1
        : s.azione === "COLLEGA"
          ? 2
          : s.stato === "PROSSIMAMENTE"
            ? 4
            : 3;
  return schede.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, "it"));
}

const ETICHETTA_ELEMENTO: Record<ElementoSincronizzato["tipo"], string> = {
  TABLE: "Tavoli",
  PRODUCT: "Prodotti",
  CATEGORY: "Categorie",
};

/** La pagina di un'integrazione, per il ristoratore. */
export async function dettaglioCliente(
  venueId: string,
  slug: string,
  opzioni: { aggiornamentiDa?: { origine: string } } = {},
): Promise<DettaglioCliente | null> {
  const v = voceDi(slug);
  if (!v) return null;
  const [i, fase, beta, richieste, assistenza] = await Promise.all([
    db.integrationInstallation.findFirst({ where: { venueId, integrationSlug: slug }, select: SELEZIONE }),
    faseDi(slug),
    db.integrationBetaAccess.findUnique({ where: { venueId_integrationSlug: { venueId, integrationSlug: slug } }, select: { enabled: true } }),
    richiesteDelLocale(venueId),
    v.nativa ? Promise.resolve(null) : assistenzaDelLocale(venueId, slug),
  ]);
  const richiesta = richieste.get(slug) ?? null;
  const e = statoPerIlCliente({
    nativa: v.nativa ? { collegata: false } : null,
    motivoTecnico: motivoTecnico(v),
    fase,
    betaAbilitata: !!beta?.enabled,
    installazione: i ? ingressoInstallazione(i) : null,
    richiesta,
  });
  const inst = i && i.status !== "NOT_INSTALLED" ? vistaInstallazioneCliente(i, v) : null;

  let elementi: ElementoSincronizzato[] = [];
  let importabile: AnteprimaImportazione | null = null;
  if (inst && i && inst.condizione !== "in_configurazione") {
    const [tutti, liberi] = await Promise.all([
      db.externalEntityMapping.groupBy({
        by: ["entityType"],
        where: { installationId: i.id, venueId, entityType: { in: ["TABLE", "PRODUCT", "CATEGORY"] } },
        _count: { _all: true },
      }),
      db.externalEntityMapping.groupBy({
        by: ["entityType"],
        where: { installationId: i.id, venueId, internalId: null, entityType: { in: ["TABLE", "PRODUCT", "CATEGORY"] } },
        _count: { _all: true },
      }),
    ]);
    elementi = (["TABLE", "PRODUCT", "CATEGORY"] as const)
      .map((tipo) => ({
        tipo,
        etichetta: ETICHETTA_ELEMENTO[tipo],
        totale: tutti.find((x) => x.entityType === tipo)?._count._all ?? 0,
        daCollegare: liberi.find((x) => x.entityType === tipo)?._count._all ?? 0,
      }))
      .filter((x) => x.totale > 0);
    importabile = await anteprimaImportazione({ id: i.id, venueId });
  }

  const meta = i?.metadata && typeof i.metadata === "object" ? (i.metadata as Record<string, unknown>) : {};
  const aggiornamenti =
    inst && i && v.webhook.configurazioneManuale && opzioni.aggiornamentiDa
      ? {
          indirizzo: `${opzioni.aggiornamentiDa.origine}/api/integrations/webhooks/${v.slug}/${i.webhookKey}`,
          segretoPresente: meta.segretoWebhookPresente === true,
        }
      : null;

  return {
    voce: vistaVoceCliente(v),
    stato: e.stato,
    etichettaStato: ETICHETTA_STATO_CLIENTE[e.stato],
    azione: e.azione,
    inAttivazione: e.inAttivazione,
    anteprima: e.anteprima,
    richiestaIl: richiesta?.status === "PENDING" ? richiesta.il.toISOString() : null,
    installazione: inst,
    elementi,
    importabile,
    aggiornamenti,
    assistenza,
    // Si chiede aiuto per ciò che si collega da qui: non per Stripe (ha la sua pagina) né per le voci senza codice.
    assistenzaPossibile: !v.nativa && e.stato !== "PROSSIMAMENTE",
  };
}
