import { db } from "@/lib/db";
import { CATALOGO, requisitiMancanti, voceDi } from "./registry";
import { adattatoreDi } from "./adapters";
import { motivoNonInstallabile, sospensioneDi } from "./installazioni";
import { faseDi } from "./certificazione/accesso";
import { ETICHETTA_RILASCIO, richiedeAccessoBeta } from "./certificazione/livelli";
import { ETICHETTA_STATO_CLIENTE, statoPerIlCliente, verificaInCorso, type StatoCliente } from "./cliente";
import { richiesteDelLocale } from "./richieste";
import type { Salute, StatoInstallazione } from "./tipi";

/**
 * **Un ristorante visto dall'assistenza Foodtech.** Solo Super Admin.
 *
 * Risponde alle domande di chi aiuta un cliente al telefono: *quale locale
 * è*, *che cosa ha chiesto*, *a che punto è ogni collegamento*, *qual è
 * l'ultimo errore e quando*, *ci ha autorizzati a configurare*. Porta il
 * dettaglio tecnico che la pagina del cliente non ha (codice e riassunto
 * dell'errore, già ripuliti; registro con i riferimenti di correlazione;
 * tipo, permessi e scadenza delle credenziali).
 *
 * **Mai un segreto.** Dalle credenziali si leggono solo colonne che non lo
 * sono (`kind`, `scopes`, scadenze, rotazione); `secretCiphertext` non è
 * nella selezione, e un test serializza la scheda e ce lo cerca.
 */

export async function cercaLocali(q: string) {
  const t = q.trim().slice(0, 100);
  const dove = t
    ? {
        OR: [
          { id: t },
          { slug: { contains: t, mode: "insensitive" as const } },
          { name: { contains: t, mode: "insensitive" as const } },
          { org: { name: { contains: t, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const locali = await db.venue.findMany({
    where: dove,
    orderBy: { name: "asc" },
    take: 50,
    select: {
      id: true,
      name: true,
      slug: true,
      org: { select: { name: true } },
      integrations: { where: { NOT: { status: "NOT_INSTALLED" } }, select: { integrationSlug: true, status: true, healthStatus: true } },
      integrationAssistances: { where: { status: "OPEN" }, select: { integrationSlug: true } },
      integrationAccessRequests: { where: { status: "PENDING" }, select: { integrationSlug: true } },
    },
  });
  return locali.map((l) => ({
    venueId: l.id,
    nome: l.name,
    slug: l.slug,
    gruppo: l.org.name,
    installate: l.integrations.length,
    conProblemi: l.integrations.filter(
      (i) => i.status === "ERROR" || i.status === "REAUTH_REQUIRED" || i.healthStatus === "ERROR" || i.healthStatus === "DEGRADED",
    ).length,
    assistenzeAperte: l.integrationAssistances.length,
    richiesteAperte: l.integrationAccessRequests.length,
  }));
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export type RigaAdmin = {
  slug: string;
  nome: string;
  logo: string | null;
  monogramma: string;
  categoria: string;
  implementazione: string;
  fase: string;
  haAdattatore: boolean;
  motivoNonInstallabile: { codice: string; messaggio: string } | null;
  betaAbilitata: boolean;
  /** La fase di rilascio chiede la beta per locale, e questo locale non ce l'ha. */
  serveBeta: boolean;
  /** Si può concedere o togliere la beta (fase interna o beta privata). */
  betaApplicabile: boolean;
  /** Ciò che vede il cliente, per parlargli con le sue parole. */
  statoCliente: StatoCliente;
  etichettaStatoCliente: string;
  installazione: {
    status: string;
    salute: string;
    frase: string | null;
    account: string | null;
    sede: string | null;
    capacita: string[];
    installataIl: string;
    attivataIl: string | null;
    ultimaVerificaIl: string | null;
    ultimaVerificaOk: boolean | null;
    verificaInCorso: boolean;
    ultimaSyncIl: string | null;
    ultimaSyncRiuscitaIl: string | null;
    erroreIl: string | null;
    erroreCodice: string | null;
    /** Tecnico e ripulito dai segreti (`ErroreIntegrazione.riassunto`). */
    erroreRiassunto: string | null;
    sospensione: { da: string; il: string; motivo: string | null } | null;
    credenziali: {
      tipo: string;
      permessi: string[];
      scadeAccesso: string | null;
      scadeRinnovo: string | null;
      ruotateIl: string | null;
      versione: number;
    } | null;
  } | null;
  richiesta: { tipo: string; il: string } | null;
  assistenza: { aperta: boolean; nota: string | null; il: string; delegaFinoAl: string | null } | null;
  consegne: { id: string; creataIl: string; scadeIl: string; creataDa: string; apertaIl: string | null; completataIl: string | null; revocataIl: string | null }[];
  registro: {
    id: string;
    operazione: string;
    origine: string;
    esito: string;
    il: string;
    riusciti: number;
    falliti: number;
    erroreCodice: string | null;
    correlazione: string;
  }[];
};

export async function schedaLocaleAdmin(venueId: string, adesso = new Date()) {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      orgId: true,
      org: { select: { name: true } },
      members: {
        where: { disabledAt: null, role: "MANAGER" },
        select: { role: true, user: { select: { email: true, name: true } } },
        take: 10,
      },
    },
  });
  if (!venue) return null;

  const [installazioni, beta, richieste, assistenze, consegne] = await Promise.all([
    db.integrationInstallation.findMany({
      where: { venueId },
      // Le colonne scelte una per una: niente `webhookKey`, niente segreti.
      select: {
        id: true,
        integrationSlug: true,
        status: true,
        healthStatus: true,
        healthMessage: true,
        externalAccountName: true,
        externalLocationName: true,
        enabledCapabilities: true,
        installedAt: true,
        activatedAt: true,
        lastTestAt: true,
        lastTestOk: true,
        testStartedAt: true,
        lastSyncAt: true,
        lastSuccessfulSyncAt: true,
        lastErrorAt: true,
        lastErrorCode: true,
        lastError: true,
        metadata: true,
        credential: {
          select: { kind: true, scopes: true, accessTokenExpiresAt: true, refreshTokenExpiresAt: true, rotatedAt: true, version: true },
        },
      },
    }),
    db.integrationBetaAccess.findMany({ where: { venueId, enabled: true }, select: { integrationSlug: true } }),
    richiesteDelLocale(venueId),
    db.integrationAssistance.findMany({ where: { venueId } }),
    db.integrationCredentialHandoff.findMany({ where: { venueId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const idInstallazioni = installazioni.filter((i) => i.status !== "NOT_INSTALLED").map((i) => i.id);
  const registro = idInstallazioni.length
    ? await db.integrationSyncLog.findMany({
        where: { venueId, installationId: { in: idInstallazioni } },
        orderBy: { startedAt: "desc" },
        take: 60,
        select: {
          id: true,
          installationId: true,
          operation: true,
          trigger: true,
          status: true,
          startedAt: true,
          itemsSucceeded: true,
          itemsFailed: true,
          errorCode: true,
          correlationId: true,
        },
      })
    : [];

  const perSlug = new Map(installazioni.map((i) => [i.integrationSlug, i]));
  const conBeta = new Set(beta.map((b) => b.integrationSlug));
  const assistenzaPer = new Map(assistenze.map((a) => [a.integrationSlug, a]));

  // Le voci che contano per questo locale: tutte quelle con un adattatore, più quelle che ha toccato.
  const toccate = new Set([...perSlug.keys(), ...richieste.keys(), ...assistenzaPer.keys()]);
  const voci = CATALOGO.filter((v) => !v.nativa && (adattatoreDi(v.slug) || toccate.has(v.slug)));

  const righe: RigaAdmin[] = await Promise.all(
    voci.map(async (v) => {
      const i = perSlug.get(v.slug);
      const installata = i && i.status !== "NOT_INSTALLED" ? i : null;
      const fase = await faseDi(v.slug);
      const tecnico = motivoNonInstallabile(v);
      // All'assistenza serve sapere che cosa manca: i nomi delle variabili, mai i valori.
      const mancanti = requisitiMancanti(v);
      const motivo =
        tecnico?.codice === "platform_not_configured" && mancanti.length
          ? { ...tecnico, messaggio: `${tecnico.messaggio} Mancano: ${mancanti.join(", ")}.` }
          : tecnico;
      const inVerifica = installata ? verificaInCorso(installata, adesso) : false;
      const sospensione = i ? sospensioneDi(i) : null;
      const richiesta = richieste.get(v.slug) ?? null;
      const e = statoPerIlCliente({
        nativa: null,
        motivoTecnico: (motivo?.codice as never) ?? null,
        fase,
        betaAbilitata: conBeta.has(v.slug),
        installazione: i
          ? { status: i.status as StatoInstallazione, salute: i.healthStatus as Salute, sospesa: !!sospensione, verificaInCorso: inVerifica }
          : null,
        richiesta,
      });
      const a = assistenzaPer.get(v.slug);
      const delegaAttiva = !!a?.delegatedUntil && a.delegatedUntil > adesso && !a.revokedAt;
      return {
        slug: v.slug,
        nome: v.nome,
        logo: v.logo.src ?? null,
        monogramma: v.logo.monogramma,
        categoria: v.categoria,
        implementazione: v.implementazione,
        fase: ETICHETTA_RILASCIO[fase],
        haAdattatore: !!adattatoreDi(v.slug),
        motivoNonInstallabile: motivo,
        betaAbilitata: conBeta.has(v.slug),
        serveBeta: !!adattatoreDi(v.slug) && richiedeAccessoBeta(fase) && !conBeta.has(v.slug),
        betaApplicabile: !!adattatoreDi(v.slug) && richiedeAccessoBeta(fase),
        statoCliente: e.stato,
        etichettaStatoCliente: ETICHETTA_STATO_CLIENTE[e.stato],
        installazione: installata
          ? {
              status: installata.status,
              salute: installata.healthStatus,
              frase: installata.healthMessage,
              account: installata.externalAccountName,
              sede: installata.externalLocationName,
              capacita: installata.enabledCapabilities,
              installataIl: installata.installedAt.toISOString(),
              attivataIl: iso(installata.activatedAt),
              ultimaVerificaIl: iso(installata.lastTestAt),
              ultimaVerificaOk: installata.lastTestOk,
              verificaInCorso: inVerifica,
              ultimaSyncIl: iso(installata.lastSyncAt),
              ultimaSyncRiuscitaIl: iso(installata.lastSuccessfulSyncAt),
              erroreIl: iso(installata.lastErrorAt),
              erroreCodice: installata.lastErrorCode,
              erroreRiassunto: installata.lastError,
              sospensione,
              credenziali: installata.credential
                ? {
                    tipo: installata.credential.kind,
                    permessi: installata.credential.scopes,
                    scadeAccesso: iso(installata.credential.accessTokenExpiresAt),
                    scadeRinnovo: iso(installata.credential.refreshTokenExpiresAt),
                    ruotateIl: iso(installata.credential.rotatedAt),
                    versione: installata.credential.version,
                  }
                : null,
            }
          : null,
        richiesta: richiesta && richiesta.status === "PENDING" ? { tipo: richiesta.kind, il: richiesta.il.toISOString() } : null,
        assistenza:
          a && (a.status === "OPEN" || delegaAttiva)
            ? { aperta: a.status === "OPEN", nota: a.note, il: a.requestedAt.toISOString(), delegaFinoAl: delegaAttiva ? a.delegatedUntil!.toISOString() : null }
            : null,
        consegne: consegne
          .filter((c) => c.integrationSlug === v.slug)
          .slice(0, 5)
          .map((c) => ({
            id: c.id,
            creataIl: c.createdAt.toISOString(),
            scadeIl: c.expiresAt.toISOString(),
            creataDa: c.createdByEmail,
            apertaIl: iso(c.openedAt),
            completataIl: iso(c.completedAt),
            revocataIl: iso(c.revokedAt),
          })),
        registro: installata
          ? registro
              .filter((r) => r.installationId === installata.id)
              .slice(0, 10)
              .map((r) => ({
                id: r.id,
                operazione: r.operation,
                origine: r.trigger,
                esito: r.status,
                il: r.startedAt.toISOString(),
                riusciti: r.itemsSucceeded,
                falliti: r.itemsFailed,
                erroreCodice: r.errorCode,
                correlazione: r.correlationId,
              }))
          : [],
      };
    }),
  );

  // Prima ciò che chiede un gesto: assistenza aperta, errori, collegamenti a metà; poi le collegate; poi il resto.
  const peso = (r: RigaAdmin) =>
    r.assistenza?.aperta ? 0 : ["ERRORE_CONNESSIONE", "CREDENZIALI_SCADUTE"].includes(r.statoCliente) ? 1 : r.statoCliente === "CONFIGURAZIONE_NECESSARIA" ? 2 : r.installazione ? 3 : r.richiesta ? 4 : 5;
  righe.sort((x, y) => peso(x) - peso(y) || x.nome.localeCompare(y.nome, "it"));

  return {
    locale: {
      venueId: venue.id,
      nome: venue.name,
      slug: venue.slug,
      orgId: venue.orgId,
      gruppo: venue.org.name,
      referenti: venue.members.map((m) => ({ ruolo: m.role, email: m.user.email, nome: m.user.name })),
    },
    righe,
  };
}

export type SchedaLocaleAdmin = NonNullable<Awaited<ReturnType<typeof schedaLocaleAdmin>>>;

/** Per la pagina: il nome della voce, anche se è stata tolta dal catalogo. */
export function nomeVoce(slug: string) {
  return voceDi(slug)?.nome ?? slug;
}
