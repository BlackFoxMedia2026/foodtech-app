import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import {
  MARCHIO,
  PREFISSO_CIFRE,
  componiToken,
  dividiToken,
  haAmbito,
  type Ambito,
} from "@/lib/api-token-forma";

/**
 * I token con cui un servizio esterno parla con Tavolo.
 *
 * Il modello `ApiToken` esisteva nello schema **dal primo giorno e non lo
 * usava nessuno**: nessuna riga di codice ne emetteva uno, lo verificava o
 * guardava i suoi `scopes`. Era una tabella vuota che sembrava una funzione —
 * lo stesso difetto dei contatori mai scritti, alla scala di un'intera tabella.
 * Questo file è la parte che mancava.
 *
 * Serve al centralino telefonico, che vive su un altro server e deve chiedere
 * a Tavolo «chi è il numero che sta chiamando?». Un token **per locale**: se
 * quello di un ristorante finisce dove non deve, si porta dietro solo i dati
 * di quel ristorante.
 *
 * ## Perché SHA-256 e non bcrypt
 *
 * Le password degli utenti stanno sotto `bcrypt` a costo 10, ed è giusto: una
 * password la scegli tu, ha poca entropia, e va resa costosa da indovinare.
 *
 * Un token no: lo generiamo noi con **256 bit casuali**, e non c'è niente da
 * indovinare — provarli tutti non è una questione di costo per tentativo. In
 * cambio, `bcrypt` a costo 10 impiega circa un decimo di secondo, e questa
 * verifica sta dentro una richiesta che il centralino abbandona dopo **800
 * ms** perché una telefonata non può aspettare un gestionale.
 *
 * Quindi: impronta SHA-256, confrontata a **tempo costante**. La differenza
 * fra i due casi è l'entropia del segreto, non la pigrizia.
 */

/** L'impronta che finisce nel database. Il segreto non si salva mai. */
function impronta(segreto: string): string {
  return createHash("sha256").update(segreto, "utf8").digest("hex");
}

/**
 * Confronto a tempo costante.
 *
 * `===` su due stringhe esce al primo carattere diverso, e il tempo di uscita
 * racconta quanti caratteri erano giusti. Su un'impronta è poco sfruttabile,
 * ma costa una riga farlo bene.
 */
function improntaUguale(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type TokenEmesso = {
  id: string;
  prefisso: string;
  /** Il token intero, **mostrato una volta sola**: dopo non è più leggibile. */
  token: string;
};

/**
 * Emette un token per un locale.
 *
 * Restituisce il token in chiaro **una volta**: chi lo chiama deve mostrarlo
 * subito a chi lo userà, perché nel database ne resta solo l'impronta. È una
 * scelta, non un limite: un token rileggibile è un token che prima o poi si
 * legge dal posto sbagliato.
 */
export async function emettiApiToken(
  venueId: string,
  dati: { nome: string; ambiti: Ambito[]; scadeIl?: Date | null; creatoDa?: string | null },
): Promise<TokenEmesso> {
  const prefisso = `${MARCHIO}_${randomBytes(PREFISSO_CIFRE).toString("hex").slice(0, PREFISSO_CIFRE)}`;
  const segreto = randomBytes(32).toString("base64url");

  const riga = await db.apiToken.create({
    data: {
      venueId,
      name: dati.nome,
      prefix: prefisso,
      hashedSecret: impronta(segreto),
      scopes: dati.ambiti,
      expiresAt: dati.scadeIl ?? null,
      createdBy: dati.creatoDa ?? null,
    },
    select: { id: true },
  });

  return { id: riga.id, prefisso, token: componiToken(prefisso, segreto) };
}

export type EsitoVerifica =
  | { ok: true; venueId: string; tokenId: string; ambiti: string[] }
  | { ok: false; motivo: "malformato" | "sconosciuto" | "revocato" | "scaduto" | "ambito" };

/**
 * Verifica un token e dice **perché** non va, quando non va.
 *
 * I motivi non si raccontano a chi chiama (un 401 dice solo «no»), ma servono
 * a chi legge i registri: «scaduto» e «sconosciuto» portano a due telefonate
 * diverse con il cliente.
 */
export async function verificaApiToken(
  valore: string | null | undefined,
  ambitoRichiesto: Ambito,
  adesso: Date = new Date(),
): Promise<EsitoVerifica> {
  const diviso = dividiToken(valore);
  if (!diviso) return { ok: false, motivo: "malformato" };

  const riga = await db.apiToken.findUnique({
    where: { prefix: diviso.prefisso },
    select: {
      id: true,
      venueId: true,
      hashedSecret: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  /* Il segreto si confronta **sempre**, anche quando il prefisso non esiste:
     altrimenti il tempo di risposta direbbe se un prefisso è vero, e si
     potrebbe setacciare l'archivio dei prefissi senza indovinare un segreto. */
  const atteso = riga?.hashedSecret ?? impronta("prefisso-che-non-esiste");
  const combacia = improntaUguale(impronta(diviso.segreto), atteso);

  if (!riga || !combacia) return { ok: false, motivo: "sconosciuto" };
  if (riga.revokedAt) return { ok: false, motivo: "revocato" };
  if (riga.expiresAt && riga.expiresAt <= adesso) return { ok: false, motivo: "scaduto" };
  if (!haAmbito(riga.scopes, ambitoRichiesto)) return { ok: false, motivo: "ambito" };

  /* Quando è stato usato l'ultima volta: serve a spegnere i token che nessuno
     usa più. Non si attende — se questa scrittura fallisce o è lenta, la
     telefonata non deve accorgersene. */
  void db.apiToken
    .update({ where: { id: riga.id }, data: { lastUsedAt: adesso } })
    .catch(() => {});

  return { ok: true, venueId: riga.venueId, tokenId: riga.id, ambiti: riga.scopes };
}

/** Revoca un token: resta nel registro, ma non apre più niente. */
export async function revocaApiToken(venueId: string, tokenId: string): Promise<void> {
  const esistente = await db.apiToken.findFirst({
    where: { id: tokenId, venueId },
    select: { id: true },
  });
  if (!esistente) throw new Error("not_found");
  await db.apiToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
}

export type TokenInElenco = {
  id: string;
  nome: string;
  prefisso: string;
  ambiti: string[];
  ultimoUso: Date | null;
  scadeIl: Date | null;
  revocatoIl: Date | null;
  creatoIl: Date;
};

/** I token di un locale, senza niente che permetta di ricostruirli. */
export async function elencaApiToken(venueId: string): Promise<TokenInElenco[]> {
  const righe = await db.apiToken.findMany({
    where: { venueId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return righe.map((r) => ({
    id: r.id,
    nome: r.name,
    prefisso: r.prefix,
    ambiti: r.scopes,
    ultimoUso: r.lastUsedAt,
    scadeIl: r.expiresAt,
    revocatoIl: r.revokedAt,
    creatoIl: r.createdAt,
  }));
}
