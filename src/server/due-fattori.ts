import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { cifra, cifraturaAttiva, decifra } from "@/lib/cifratura";
import { indirizzoOtpauth, nuovoSegreto, verificaCodice } from "@/lib/totp";
import { recordAudit, type AuditActor } from "@/server/audit";

/**
 * L'accesso in due passi: la password, e un codice che cambia ogni trenta
 * secondi.
 *
 * ## Perché adesso
 *
 * Perché in Tavolo una sola password apre l'agenda di un ristorante, la
 * rubrica dei suoi clienti e i contratti del personale. `totpEnabled`,
 * `totpSecret` e `recoveryCodesHash` stavano nello schema dal principio — con
 * i nomi giusti — e **nessuna riga di codice li leggeva o li scriveva**: una
 * difesa dichiarata e mai messa.
 *
 * ## Le cinque decisioni che contano
 *
 * **1. Il segreto è cifrato a riposo.** Chi legge il database non deve poter
 * generare i codici di nessuno. Senza `CHIAVE_CIFRATURA` `lib/cifratura` lo
 * scrive in chiaro col prefisso `chiaro:`, e va bene saperlo: è la stessa
 * regola delle password Wi-Fi e SIP, ed è dichiarata invece che nascosta.
 *
 * **2. Si attiva in due passi.** Il segreto nasce **spento**: si mostra il QR,
 * e solo quando arriva un codice giusto i due fattori si accendono. Il
 * contrario — accendere e poi sperare che l'app sia stata configurata — chiude
 * fuori chi ha sbagliato a inquadrare, e per rientrare servirebbe un
 * amministratore.
 *
 * **3. I codici di recupero si mostrano una volta.** In database ci sono solo
 * le impronte, e nessun percorso li restituisce. Un elenco recuperabile è una
 * seconda password scritta in chiaro.
 *
 * **4. Spegnere chiede un codice.** Altrimenti una sessione rubata — un tablet
 * in sala, un portatile aperto — toglie la protezione senza saper nulla del
 * telefono. Non si spegne con «sei già dentro».
 *
 * **5. Un codice usato non si riusa.** `totpUltimoPasso` lo ricorda. Senza, un
 * codice visto passare vale altri novanta secondi.
 */

/** Quanti codici di recupero si consegnano. Otto: due stampati, sei in tasca. */
export const CODICI_RECUPERO = 8;

export type StatoDueFattori = {
  attivo: boolean;
  /** Vero quando c'è un segreto in attesa di conferma. */
  inAttesa: boolean;
  /** Quanti codici di recupero restano da usare. */
  codiciRimasti: number;
  /** Vero quando il segreto **non** è cifrato: lo dice, invece di tacere. */
  segretoInChiaro: boolean;
};

export async function statoDueFattori(userId: string): Promise<StatoDueFattori> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true, totpSecret: true, recoveryCodesHash: true },
  });
  if (!u) throw new Error("not_found");

  return {
    attivo: u.totpEnabled,
    inAttesa: !u.totpEnabled && !!u.totpSecret,
    codiciRimasti: u.recoveryCodesHash.length,
    segretoInChiaro: !!u.totpSecret && !cifraturaAttiva(),
  };
}

/**
 * Primo passo: si prepara un segreto e si restituisce il QR.
 *
 * **Non accende niente.** Chiamarla due volte sostituisce il segreto in
 * attesa, ed è voluto: chi ha chiuso la pagina a metà ricomincia da un QR
 * nuovo invece di restare con un segreto che non ha mai inquadrato.
 */
export async function iniziaDueFattori(
  userId: string,
  actor?: AuditActor,
): Promise<{ segreto: string; indirizzo: string; qr: string }> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabled: true },
  });
  if (!u) throw new Error("not_found");
  if (u.totpEnabled) throw new DueFattoriError("gia_attivo");

  const segreto = nuovoSegreto();
  await db.user.update({
    where: { id: userId },
    data: { totpSecret: cifra(segreto), totpUltimoPasso: null },
  });
  await recordAudit(actor, "utente.due_fattori", "user", userId, { passo: "iniziato" });

  const indirizzo = indirizzoOtpauth({ segreto, email: u.email, emittente: "Tavolo" });
  return {
    segreto,
    indirizzo,
    /* Il QR lo disegna il server e arriva già pronto: la libreria sta già nel
       progetto per i tavoli e la tessera, e farla scaricare al browser
       aggiungerebbe peso a ogni pagina per una schermata che si apre una volta
       nella vita. Il segreto torna **anche in chiaro** perché chi ha il
       telefono in mano e la fotocamera rotta lo deve poter battere a mano. */
    qr: await QRCode.toDataURL(indirizzo, { margin: 1, width: 240 }),
  };
}

/**
 * Secondo passo: il codice giusto accende i due fattori.
 *
 * Restituisce i codici di recupero **in chiaro, una volta sola**: da qui in
 * poi esistono solo le loro impronte.
 */
export async function confermaDueFattori(
  userId: string,
  codice: string,
  actor?: AuditActor,
): Promise<{ codiciRecupero: string[] }> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true, totpUltimoPasso: true },
  });
  if (!u) throw new Error("not_found");
  if (u.totpEnabled) throw new DueFattoriError("gia_attivo");
  if (!u.totpSecret) throw new DueFattoriError("non_iniziato");

  const segreto = decifra(u.totpSecret);
  if (!segreto) throw new DueFattoriError("non_iniziato");

  const esito = verificaCodice(segreto, codice, { ultimoPassoUsato: u.totpUltimoPasso });
  if (!esito.ok) throw new DueFattoriError("codice_non_valido");

  const codiciRecupero = Array.from({ length: CODICI_RECUPERO }, () => nuovoCodiceRecupero());
  /* L'impronta si calcola sulla forma **normalizzata**, la stessa che userà il
     confronto: si mostrano coi trattini perché così si leggono e si dettano,
     e se l'impronta li contenesse chi li reinserisce senza — o in minuscolo —
     si sentirebbe dire «non valido». È il difetto che ho scritto e che il test
     ha preso: due forme per la stessa cosa, in due punti diversi. */
  const impronte = await Promise.all(
    codiciRecupero.map((c) => bcrypt.hash(normalizzaCodiceRecupero(c), 10)),
  );

  await db.user.update({
    where: { id: userId },
    data: {
      totpEnabled: true,
      totpUltimoPasso: esito.passo,
      recoveryCodesHash: impronte,
    },
  });
  await recordAudit(actor, "utente.due_fattori", "user", userId, {
    passo: "attivato",
    codiciRecupero: codiciRecupero.length,
  });

  return { codiciRecupero };
}

/**
 * Spegne i due fattori, **chiedendo un codice**.
 *
 * Una sessione rubata non deve poter togliere la protezione: chi spegne deve
 * avere in mano il telefono, o uno dei codici di recupero.
 */
export async function spegniDueFattori(
  userId: string,
  codice: string,
  actor?: AuditActor,
): Promise<void> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      totpEnabled: true,
      totpSecret: true,
      totpUltimoPasso: true,
      recoveryCodesHash: true,
    },
  });
  if (!u) throw new Error("not_found");
  if (!u.totpEnabled) throw new DueFattoriError("non_attivo");

  const ok = await verificaSecondoFattore({ id: userId, ...u }, codice);
  if (!ok.ok) throw new DueFattoriError("codice_non_valido");

  await db.user.update({
    where: { id: userId },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpUltimoPasso: null,
      recoveryCodesHash: [],
    },
  });
  await recordAudit(actor, "utente.due_fattori", "user", userId, { passo: "spento" });
}

export type UtenteDueFattori = {
  id: string;
  totpEnabled: boolean;
  totpSecret: string | null;
  totpUltimoPasso: number | null;
  recoveryCodesHash: string[];
};

export type EsitoSecondoFattore =
  | { ok: true; usato: "codice" | "recupero" }
  | { ok: false; perche: "mancante" | "non_valido" };

/**
 * Il controllo all'accesso: un codice dell'app, oppure uno di recupero.
 *
 * Il codice di recupero **si consuma**, e si consuma con la condizione dentro
 * l'aggiornamento: due accessi in parallelo con lo stesso codice non possono
 * passare entrambi, perché la seconda scrittura non trova più l'impronta da
 * togliere. Un `if (c'è) allora (togli)` qui li farebbe passare tutti e due.
 */
export async function verificaSecondoFattore(
  u: UtenteDueFattori,
  codice: string | undefined | null,
): Promise<EsitoSecondoFattore> {
  if (!codice || !codice.trim()) return { ok: false, perche: "mancante" };
  const pulito = codice.trim();

  const segreto = u.totpSecret ? decifra(u.totpSecret) : null;
  if (segreto) {
    const esito = verificaCodice(segreto, pulito, { ultimoPassoUsato: u.totpUltimoPasso });
    if (esito.ok) {
      /* Il passo si brucia subito: da qui lo stesso codice non vale più. */
      await db.user.update({
        where: { id: u.id },
        data: { totpUltimoPasso: esito.passo },
      });
      return { ok: true, usato: "codice" };
    }
  }

  /* I codici di recupero: si prova uno per uno perché l'impronta non si può
     cercare — bcrypt ha un sale diverso per ognuna. Otto confronti, una volta
     per accesso: costa meno di una password sbagliata. */
  const normalizzato = normalizzaCodiceRecupero(pulito);
  for (const impronta of u.recoveryCodesHash) {
    if (!(await bcrypt.compare(normalizzato, impronta))) continue;

    const rimasti = u.recoveryCodesHash.filter((i) => i !== impronta);
    const consumato = await db.user.updateMany({
      where: { id: u.id, recoveryCodesHash: { has: impronta } },
      data: { recoveryCodesHash: { set: rimasti } },
    });
    /* Se un altro accesso l'ha consumato un istante prima, `count` è zero e
       questo codice non vale: è la condizione dentro la scrittura. */
    if (consumato.count === 0) return { ok: false, perche: "non_valido" };
    return { ok: true, usato: "recupero" };
  }

  return { ok: false, perche: "non_valido" };
}

/**
 * Un codice di recupero: quattro gruppi di quattro, leggibili ad alta voce.
 *
 * Alfabeto senza `0`, `O`, `1`, `I` e `L`: questi codici si stampano e si
 * dettano al telefono, e una `O` letta come zero è una persona chiusa fuori.
 */
/**
 * La forma su cui si calcola e si confronta l'impronta.
 *
 * Una sola funzione, usata da entrambi i lati: quando erano due espressioni
 * in due punti — una col trattino, una senza — i codici di recupero non
 * funzionavano affatto. Un codice si detta al telefono e si ribatte a mano,
 * quindi maiuscole, spazi e trattini non devono contare.
 */
export function normalizzaCodiceRecupero(codice: string): string {
  return codice.toUpperCase().replace(/[\s-]/g, "");
}

function nuovoCodiceRecupero(): string {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const grezzo = randomBytes(16);
  let fuori = "";
  for (let i = 0; i < 16; i++) {
    fuori += alfabeto[grezzo[i]! % alfabeto.length];
    if (i % 4 === 3 && i < 15) fuori += "-";
  }
  return fuori;
}

export class DueFattoriError extends Error {
  constructor(
    public code:
      | "gia_attivo"
      | "non_attivo"
      | "non_iniziato"
      | "codice_non_valido",
  ) {
    super(code);
  }
}
