import type { IntegrationCredential, IntegrationInstallation } from "@prisma/client";
import { db } from "@/lib/db";
import { CATALOGO, voceDi, type VoceCatalogo } from "./registry";
import { messaggioPerIlRistoratore, type MessaggioErrore } from "./errori";
import { installata, richiedeAttenzione } from "./stati";
import { motivoNonInstallabile } from "./installazioni";
import { motiviRilascioPerLocale, motivoRilascio } from "./certificazione/accesso";
import type { Salute, StatoInstallazione } from "./tipi";

/**
 * **Ciò che dell'integrazione può arrivare al browser.**
 *
 * Le viste si costruiscono per **elenco di campi scelti**, mai con uno
 * `...installazione`: una colonna aggiunta domani non deve finire nel
 * browser perché qualcuno ha scritto uno spread. E in particolare non ci
 * arrivano mai:
 *
 * - i segreti (non sono nemmeno letti qui: `IntegrationCredential` si legge
 *   solo per dire *se* ci sono credenziali, quali permessi e quando
 *   scadono);
 * - `webhookKey`, che è la metà segreta di un indirizzo;
 * - `lastError`, che è il dettaglio tecnico: al browser va la frase per il
 *   ristoratore, costruita dal codice.
 *
 * Lo fissa un test (`integrazioni-vista`): serializza la vista e cerca i
 * segreti.
 */

export type VoceVista = {
  slug: string;
  nome: string;
  fornitore: string;
  categoria: VoceCatalogo["categoria"];
  descrizione: string;
  monogramma: string;
  implementazione: VoceCatalogo["implementazione"];
  disponibilita: VoceCatalogo["disponibilita"];
  autenticazione: VoceCatalogo["autenticazione"]["modalita"];
  capacita: VoceCatalogo["capacita"];
  configurazione: VoceCatalogo["configurazione"];
  dati: VoceCatalogo["dati"];
  documentazione: string | null;
  versioneAdattatore: string | null;
  mancaPerOperare: string[];
  nativa: string | null;
  /** `null` = si può installare adesso; altrimenti perché no, a parole. */
  nonInstallabile: string | null;
  notaInstallazione: string | null;
  /** Il ristoratore configura il webhook nel pannello del fornitore. */
  webhookManuale: boolean;
  risorse: NonNullable<VoceCatalogo["risorse"]>;
};

export type InstallazioneVistaUi = {
  status: StatoInstallazione;
  salute: Salute;
  fraseSalute: string | null;
  problema: MessaggioErrore | null;
  capacitaAccese: string[];
  configurazione: Record<string, string>;
  account: string | null;
  sede: string | null;
  installataIl: string;
  attivataIl: string | null;
  ultimaProvaIl: string | null;
  ultimaProvaRiuscita: boolean | null;
  ultimaSyncIl: string | null;
  ultimaSyncRiuscitaIl: string | null;
  ultimoErroreIl: string | null;
  credenziali: {
    presenti: boolean;
    tipo: string | null;
    permessi: string[];
    scadenzaAccesso: string | null;
    scadenzaRinnovo: string | null;
    rinnovateIl: string | null;
  };
};

export type SchedaCatalogo = VoceVista & {
  installazione: InstallazioneVistaUi | null;
  richiedeAttenzione: boolean;
};

export function vistaVoce(v: VoceCatalogo): VoceVista {
  return {
    slug: v.slug,
    nome: v.nome,
    fornitore: v.fornitore,
    categoria: v.categoria,
    descrizione: v.descrizione,
    monogramma: v.logo.monogramma,
    implementazione: v.implementazione,
    disponibilita: v.disponibilita,
    autenticazione: v.autenticazione.modalita,
    capacita: v.capacita,
    configurazione: v.configurazione,
    dati: v.dati,
    documentazione: v.documentazione,
    versioneAdattatore: v.versioneAdattatore,
    mancaPerOperare: v.mancaPerOperare,
    nativa: v.nativa?.href ?? null,
    nonInstallabile: v.nativa ? null : motivoNonInstallabile(v)?.messaggio ?? null,
    notaInstallazione: v.notaInstallazione ?? null,
    webhookManuale: !!v.webhook.configurazioneManuale,
    risorse: v.risorse ?? [],
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function vistaInstallazione(
  i: IntegrationInstallation,
  c: Pick<IntegrationCredential, "kind" | "scopes" | "accessTokenExpiresAt" | "refreshTokenExpiresAt" | "rotatedAt"> | null,
  nome: string,
): InstallazioneVistaUi {
  const status = i.status as StatoInstallazione;
  const salute = i.healthStatus as Salute;
  const conf = (i.configuration ?? {}) as Record<string, unknown>;
  return {
    status,
    salute,
    fraseSalute: i.healthMessage,
    problema:
      status === "ERROR" || status === "REAUTH_REQUIRED" || (i.lastErrorCode && salute !== "HEALTHY")
        ? messaggioPerIlRistoratore(i.lastErrorCode, nome, voceDi(i.integrationSlug)?.messaggi)
        : null,
    capacitaAccese: i.enabledCapabilities,
    configurazione: Object.fromEntries(Object.entries(conf).map(([k, v]) => [k, String(v)])),
    account: i.externalAccountName,
    sede: i.externalLocationName ?? i.externalLocationId,
    installataIl: i.installedAt.toISOString(),
    attivataIl: iso(i.activatedAt),
    ultimaProvaIl: iso(i.lastTestAt),
    ultimaProvaRiuscita: i.lastTestOk,
    ultimaSyncIl: iso(i.lastSyncAt),
    ultimaSyncRiuscitaIl: iso(i.lastSuccessfulSyncAt),
    ultimoErroreIl: iso(i.lastErrorAt),
    credenziali: {
      presenti: !!c,
      tipo: c?.kind ?? null,
      permessi: c?.scopes ?? [],
      scadenzaAccesso: iso(c?.accessTokenExpiresAt),
      scadenzaRinnovo: iso(c?.refreshTokenExpiresAt),
      rinnovateIl: iso(c?.rotatedAt),
    },
  };
}

const SELEZIONE_CREDENZIALE = {
  kind: true,
  scopes: true,
  accessTokenExpiresAt: true,
  refreshTokenExpiresAt: true,
  rotatedAt: true,
} as const;

/**
 * Il catalogo visto da un locale: ogni voce con la sua installazione (se
 * c'è). Le installate vengono per prime, poi le installabili, poi le altre.
 */
export async function catalogoPerLocale(
  venueId: string,
  statoNativo: { stripe: boolean },
): Promise<SchedaCatalogo[]> {
  const installazioni = await db.integrationInstallation.findMany({
    where: { venueId },
    include: { credential: { select: SELEZIONE_CREDENZIALE } },
  });
  const perSlug = new Map(installazioni.map((i) => [i.integrationSlug, i]));
  const suRichiesta = await motiviRilascioPerLocale(venueId, CATALOGO);

  const schede = CATALOGO.map((v): SchedaCatalogo => {
    const i = perSlug.get(v.slug);
    let inst = i && installata(i.status as StatoInstallazione) ? vistaInstallazione(i, i.credential, v.nome) : null;

    /* Stripe è collegato dal suo modulo, non dalla piattaforma: il suo stato
       si legge da lì, ed è la stessa cosa che dice la pagina Pagamenti. */
    if (v.nativa && v.slug === "stripe" && statoNativo.stripe) {
      inst = statoNativoAttivo();
    }
    const voce = vistaVoce(v);
    return {
      ...voce,
      nonInstallabile: voce.nonInstallabile ?? suRichiesta.get(v.slug) ?? null,
      installazione: inst,
      richiedeAttenzione: inst ? richiedeAttenzione(inst.status, inst.salute) : false,
    };
  });

  const peso = (s: SchedaCatalogo) =>
    s.installazione ? 0 : s.nonInstallabile === null && !s.nativa ? 1 : s.nativa ? 1 : 2;
  return schede.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, "it"));
}

function statoNativoAttivo(): InstallazioneVistaUi {
  return {
    status: "ACTIVE",
    salute: "HEALTHY",
    fraseSalute: null,
    problema: null,
    capacitaAccese: ["charges"],
    configurazione: {},
    account: null,
    sede: null,
    installataIl: new Date(0).toISOString(),
    attivataIl: null,
    ultimaProvaIl: null,
    ultimaProvaRiuscita: null,
    ultimaSyncIl: null,
    ultimaSyncRiuscitaIl: null,
    ultimoErroreIl: null,
    credenziali: {
      presenti: true,
      tipo: "NATIVE",
      permessi: [],
      scadenzaAccesso: null,
      scadenzaRinnovo: null,
      rinnovateIl: null,
    },
  };
}

/**
 * La pagina di dettaglio: la voce, l'installazione, e il registro recente.
 *
 * `webhook` è l'unica eccezione alla regola «`webhookKey` non esce»: per
 * le voci con `configurazioneManuale` il ristoratore **deve** incollare
 * l'indirizzo nel pannello del fornitore, quindi glielo si mostra — solo se
 * chi chiama può configurare (`indirizzoWebhookPer`), e solo l'indirizzo.
 */
export async function dettaglioPerLocale(
  venueId: string,
  slug: string,
  conRegistro: boolean,
  indirizzoWebhookPer?: { origine: string },
) {
  const v = voceDi(slug);
  if (!v) return null;
  const i = await db.integrationInstallation.findFirst({
    where: { venueId, integrationSlug: slug },
    include: { credential: { select: SELEZIONE_CREDENZIALE } },
  });
  const inst = i && installata(i.status as StatoInstallazione) ? vistaInstallazione(i, i.credential, v.nome) : null;

  const [registro, mappature] = inst && i
    ? await Promise.all([
        conRegistro
          ? db.integrationSyncLog.findMany({
              where: { installationId: i.id, venueId },
              orderBy: { startedAt: "desc" },
              take: 30,
              select: {
                id: true,
                operation: true,
                trigger: true,
                status: true,
                startedAt: true,
                finishedAt: true,
                itemsProcessed: true,
                itemsSucceeded: true,
                itemsFailed: true,
                errorCode: true,
                correlationId: true,
              },
            })
          : Promise.resolve([]),
        db.externalEntityMapping.groupBy({
          by: ["entityType"],
          where: { installationId: i.id, venueId },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const nonAbbinate =
    inst && i
      ? await db.externalEntityMapping.groupBy({
          by: ["entityType"],
          where: { installationId: i.id, venueId, internalId: null },
          _count: { _all: true },
        })
      : [];

  const meta = i?.metadata && typeof i.metadata === "object" ? (i.metadata as Record<string, unknown>) : {};
  const webhook =
    inst && i && v.webhook.configurazioneManuale && indirizzoWebhookPer
      ? {
          indirizzo: `${indirizzoWebhookPer.origine}/api/integrations/webhooks/${v.slug}/${i.webhookKey}`,
          segretoPresente: meta.segretoWebhookPresente === true,
        }
      : null;

  const voce = vistaVoce(v);
  const rilascio = voce.nonInstallabile ? null : await motivoRilascio(v, venueId);
  return {
    voce: { ...voce, nonInstallabile: voce.nonInstallabile ?? rilascio?.messaggio ?? null },
    installazione: inst,
    webhook,
    registro: registro.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      problema: r.errorCode ? messaggioPerIlRistoratore(r.errorCode, v.nome, v.messaggi).titolo : null,
    })),
    mappature: mappature.map((m) => ({
      tipo: m.entityType,
      totale: m._count._all,
      daAbbinare: nonAbbinate.find((n) => n.entityType === m.entityType)?._count._all ?? 0,
    })),
  };
}

export type Dettaglio = NonNullable<Awaited<ReturnType<typeof dettaglioPerLocale>>>;
