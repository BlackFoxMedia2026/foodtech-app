import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Scarto } from "@/lib/import-csv";
import { colonneDelFile, contattiDaFile, type AbbinamentoColonne } from "@/lib/contatti-colonne";
import { recordAudit, type AuditActor } from "@/server/audit";
import { idDestinatari, type SegmentFilterType } from "@/server/campaigns";

/**
 * Destinatari da un file, nel passo «Destinatari» di una campagna.
 *
 * ## Il consenso, e perché qui sì
 *
 * L'importazione clienti generale (`server/importazione.ts`) **non** porta
 * mai il consenso al marketing: un indirizzo in un file non prova che quella
 * persona abbia detto sì. Qui il file serve proprio a scrivere a quelle
 * persone, quindi il consenso si registra, ma solo dietro una dichiarazione
 * esplicita del locale («ho il consenso di queste persone») che l'interfaccia
 * rende obbligatoria e che resta scritta: `marketingConsentSource =
 * "csv_campagna"`, una riga di `ConsentLog` per persona e una voce nel
 * registro delle azioni con chi l'ha fatto.
 *
 * ## Cosa non si scavalca mai
 *
 * - Chi si è **disiscritto** resta fuori, anche se è nel file: la sua scelta
 *   vale più della dichiarazione di chiunque altro.
 * - Chi è nella lista di **soppressione** (spam, indirizzo inesistente) resta
 *   fuori: rimandargli posta danneggia l'invio di tutti.
 *
 * ## I doppioni
 *
 * Tre livelli, tutti contati e mostrati: la stessa email due volte nel file
 * (vale una), un'email che è già in rubrica (si usa quella scheda, non se ne
 * crea un'altra) e, al momento dell'invio, due schede con lo stesso indirizzo
 * (una email sola, lo fa già `eleggibili`).
 */

const EMAIL_VALIDA = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FONTE = "csv_campagna";

/** `gia_destinatario`: è già fra chi riceve questa campagna, si salta. */
export type StatoContatto = "nuovo" | "in_rubrica" | "gia_destinatario" | "disiscritto" | "bloccato";

export type EsitoContatti = {
  /** Righe del file, intestazione esclusa. */
  righeFile: number;
  /** Righe senza un'email (avevano solo nome o telefono). */
  senzaEmail: number;
  emailNonValide: number;
  /** Ripetizioni della stessa email dentro il file. */
  doppioniNelFile: number;
  /** Email diverse e valide. */
  unici: number;
  /** Non c'erano in rubrica: si creano. */
  nuovi: number;
  /** Già in rubrica: si usa la loro scheda. */
  giaInRubrica: number;
  /** Già fra i destinatari della campagna: si saltano, non si caricano di nuovo. */
  giaDestinatari: number;
  /** Disiscritti: restano fuori. */
  disiscritti: number;
  /** Nella lista di soppressione: restano fuori. */
  soppressi: number;
  /** Quanti entrano davvero fra i destinatari. */
  aggiungibili: number;
  /** I primi scarti, col numero di riga. */
  scarti: Scarto[];
  /** Le prime righe, come le abbiamo capite. */
  esempi: { email: string; nome: string; stato: StatoContatto }[];
  tagliato: boolean;
};

type Contatto = { email: string; nome: string; cognome: string | null; telefono: string | null };
type Esistente = {
  id: string;
  email: string;
  firstName: string;
  phone: string | null;
  unsubscribedAt: Date | null;
  marketingOptIn: boolean;
};

/**
 * Un nome che non è un nome: il telefono o l'email messi al suo posto da
 * un'importazione che non aveva trovato la colonna giusta.
 */
function nomeSegnaposto(g: Esistente): boolean {
  const n = g.firstName.trim();
  return !n || n.includes("@") || /^\+?[\d\s().-]{6,}$/.test(n) || (!!g.phone && n === g.phone.trim());
}

/**
 * Legge il file con l'abbinamento delle colonne e lo confronta con la
 * rubrica, senza scrivere niente. Senza abbinamento si usa quello proposto
 * (`proponiAbbinamento`), lo stesso che l'interfaccia mostra.
 */
async function analizza(
  venueId: string,
  testo: string,
  abbinamento?: AbbinamentoColonne,
  segment?: SegmentFilterType,
) {
  const lettura = contattiDaFile(testo, abbinamento ?? colonneDelFile(testo).proposta);
  const scarti: Scarto[] = [];
  let senzaEmail = 0;
  let emailNonValide = 0;
  let doppioniNelFile = 0;

  const perEmail = new Map<string, Contatto>();
  for (const r of lettura.righe) {
    const email = r.email?.trim().toLowerCase() ?? "";
    if (!email) {
      senzaEmail += 1;
      continue;
    }
    if (!EMAIL_VALIDA.test(email)) {
      emailNonValide += 1;
      scarti.push({ riga: r.riga, perche: `email non valida: «${r.email}»` });
      continue;
    }
    if (perEmail.has(email)) {
      doppioniNelFile += 1;
      continue;
    }
    perEmail.set(email, { email, nome: r.nome, cognome: r.cognome, telefono: r.telefono });
  }

  const emails = Array.from(perEmail.keys());
  const esistenti = new Map<string, Esistente>();
  const soppresse = new Set<string>();
  for (let i = 0; i < emails.length; i += 1000) {
    const lotto = emails.slice(i, i + 1000);
    const [ospiti, soppressioni] = await Promise.all([
      db.guest.findMany({
        where: { venueId, anonymizedAt: null, email: { in: lotto, mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, firstName: true, phone: true, unsubscribedAt: true, marketingOptIn: true },
      }),
      db.demSuppression.findMany({ where: { venueId, email: { in: lotto } }, select: { email: true } }),
    ]);
    for (const o of ospiti) {
      const chiave = o.email!.trim().toLowerCase();
      // La scheda più vecchia vince: è quella con la storia.
      if (!esistenti.has(chiave)) esistenti.set(chiave, { ...o, email: chiave });
    }
    for (const s of soppressioni) soppresse.add(s.email.trim().toLowerCase());
  }

  // Chi riceve già la campagna (dai filtri o da un file di prima) si salta.
  const giaDentro = segment && esistenti.size > 0 ? await idDestinatari(venueId, segment) : new Set<string>();

  const stati = new Map<string, StatoContatto>();
  for (const email of emails) {
    const g = esistenti.get(email);
    if (soppresse.has(email)) stati.set(email, "bloccato");
    else if (g?.unsubscribedAt) stati.set(email, "disiscritto");
    else if (g && giaDentro.has(g.id)) stati.set(email, "gia_destinatario");
    else stati.set(email, g ? "in_rubrica" : "nuovo");
  }

  const conta = (s: StatoContatto) => Array.from(stati.values()).filter((x) => x === s).length;
  const esito: EsitoContatti = {
    righeFile: lettura.totali,
    senzaEmail,
    emailNonValide,
    doppioniNelFile,
    unici: emails.length,
    nuovi: conta("nuovo"),
    giaInRubrica: conta("in_rubrica"),
    giaDestinatari: conta("gia_destinatario"),
    disiscritti: conta("disiscritto"),
    soppressi: conta("bloccato"),
    aggiungibili: conta("nuovo") + conta("in_rubrica"),
    scarti: scarti.sort((a, b) => a.riga - b.riga).slice(0, 8),
    esempi: emails.slice(0, 6).map((email) => ({
      email,
      nome: [perEmail.get(email)!.nome, perEmail.get(email)!.cognome].filter(Boolean).join(" "),
      stato: stati.get(email)!,
    })),
    tagliato: lettura.tagliato,
  };
  return { esito, perEmail, esistenti, stati };
}

export async function anteprimaContatti(
  venueId: string,
  testo: string,
  abbinamento?: AbbinamentoColonne,
  segment?: SegmentFilterType,
): Promise<EsitoContatti> {
  return (await analizza(venueId, testo, abbinamento, segment)).esito;
}

/**
 * Scrive: crea i nuovi, registra il consenso dichiarato, restituisce gli id
 * da aggiungere alla campagna. Ripeterla con lo stesso file non crea doppioni:
 * la seconda volta sono tutti «già in rubrica».
 */
export async function importaContatti(
  venueId: string,
  testo: string,
  opts: {
    actor?: AuditActor;
    campaignId?: string | null;
    abbinamento?: AbbinamentoColonne;
    segment?: SegmentFilterType;
  },
): Promise<EsitoContatti & { guestIds: string[] }> {
  const { esito, perEmail, esistenti, stati } = await analizza(venueId, testo, opts.abbinamento, opts.segment);
  const adesso = new Date();

  const daCreare = Array.from(stati.entries())
    .filter(([, s]) => s === "nuovo")
    .map(([email]) => perEmail.get(email)!);
  /* Già in rubrica senza consenso: il consenso dichiarato si registra.
     Chi lo aveva già lo tiene con la sua fonte originale. */
  const daAggiornare = Array.from(stati.entries())
    .filter(([email, s]) => s === "in_rubrica" && !esistenti.get(email)!.marketingOptIn)
    .map(([email]) => esistenti.get(email)!.id);
  const giaPronti = Array.from(stati.entries())
    .filter(([, s]) => s === "in_rubrica")
    .map(([email]) => esistenti.get(email)!.id);

  const creati = await db.$transaction(async (tx) => {
    const nuovi =
      daCreare.length === 0
        ? []
        : await tx.guest.createManyAndReturn({
            data: daCreare.map((c) => ({
              venueId,
              // Senza nome resta vuoto: «Ciao 3394995402» è peggio di «Ciao».
              firstName: c.nome,
              lastName: c.cognome?.trim() || null,
              email: c.email,
              phone: c.telefono?.trim() || null,
              marketingOptIn: true,
              marketingConsentAt: adesso,
              marketingConsentSource: FONTE,
            })),
            select: { id: true },
          });
    if (daAggiornare.length > 0) {
      await tx.guest.updateMany({
        where: { venueId, id: { in: daAggiornare }, unsubscribedAt: null },
        data: { marketingOptIn: true, marketingConsentAt: adesso, marketingConsentSource: FONTE },
      });
    }
    /* Riparazione: chi è già in rubrica con il telefono o l'email al posto
       del nome (un caricamento di prima, con la colonna sbagliata) prende il
       nome del file. Un nome vero non si tocca mai. */
    for (const [email, stato] of stati) {
      if (stato !== "in_rubrica" && stato !== "gia_destinatario") continue;
      const g = esistenti.get(email)!;
      const c = perEmail.get(email)!;
      if (c.nome && nomeSegnaposto(g)) {
        await tx.guest.update({
          where: { id: g.id },
          data: { firstName: c.nome, ...(c.cognome ? { lastName: c.cognome } : {}) },
        });
      }
    }
    const conConsensoNuovo = [...nuovi.map((n) => n.id), ...daAggiornare];
    if (conConsensoNuovo.length > 0) {
      await tx.consentLog.createMany({
        data: conConsensoNuovo.map((guestId) => ({
          id: randomUUID(),
          venueId,
          guestId,
          channel: "EMAIL" as const,
          granted: true,
          source: FONTE,
        })),
      });
    }
    return nuovi.map((n) => n.id);
  });

  await recordAudit(opts.actor, "campaign.import_contacts", "campaign", opts.campaignId ?? null, {
    righeFile: esito.righeFile,
    nuovi: esito.nuovi,
    giaInRubrica: esito.giaInRubrica,
    giaDestinatari: esito.giaDestinatari,
    consensoRegistrato: creati.length + daAggiornare.length,
    disiscrittiEsclusi: esito.disiscritti,
    soppressiEsclusi: esito.soppressi,
    dichiarazioneConsenso: true,
  });

  return { ...esito, guestIds: [...giaPronti, ...creati] };
}
