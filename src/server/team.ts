import { randomBytes } from "node:crypto";
import type { StaffRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Chi lavora in questo locale, e come gli si dà accesso.
 *
 * Fino all'8 settembre 2026 questa cosa **non esisteva**: `VenueMembership`
 * la scriveva solo il seed. I cinque ruoli e le sette abilità funzionavano e
 * venivano applicati a ogni richiesta, ma non c'era una riga di codice per
 * assegnarli — quindi un ristorante che comprava Tavolo non poteva dare
 * l'accesso al suo maître.
 *
 * L'invito è **un link da consegnare a mano**, non un'email. Non è una
 * scorciatoia: l'invio di Tavolo è spento finché manca la chiave del
 * fornitore, e una funzione che dipende da una chiave che non c'è è una
 * funzione che non c'è. Il manager copia il link e lo manda su WhatsApp, o lo
 * legge a chi è nella stanza accanto — lo stesso schema già usato per il QR e
 * per il portale Wi-Fi.
 *
 * Le regole che impediscono di chiudersi fuori da soli sono la parte più
 * importante di questo modulo, e stanno tutte qui dentro invece che
 * nell'interfaccia: un pulsante nascosto non è un controllo.
 */

/** Quanto vive un invito. Una settimana: il tempo di vedere il messaggio. */
export const INVITO_GIORNI = 7;

export class TeamError extends Error {
  constructor(
    readonly code:
      | "invito_non_valido"
      | "invito_scaduto"
      | "invito_usato"
      | "gia_nel_team"
      | "email_di_un_altro"
      | "ultimo_manager"
      | "non_su_di_te"
      | "password_richiesta",
  ) {
    super(code);
    this.name = "TeamError";
  }
}

export const InvitoInput = z.object({
  email: z.string().trim().toLowerCase().email("Questo indirizzo non sembra valido").max(200),
  role: z.enum(["MANAGER", "RECEPTION", "WAITER", "MARKETING", "READ_ONLY"]),
});

export type MembroView = {
  membershipId: string;
  userId: string;
  nome: string | null;
  email: string;
  role: StaffRole;
  /** Vero per chi sta guardando: su di sé non si agisce. */
  seiTu: boolean;
};

export type InvitoView = {
  id: string;
  email: string;
  role: StaffRole;
  /** Il link da consegnare, completo. */
  link: string;
  scadeIl: Date;
};

export async function listTeam(venueId: string, userId: string): Promise<MembroView[]> {
  const righe = await db.venueMembership.findMany({
    where: { venueId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return righe.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    nome: m.user.name,
    email: m.user.email,
    role: m.role,
    seiTu: m.userId === userId,
  }));
}

/** Gli inviti ancora aperti, col link già composto. */
export async function listInviti(venueId: string, baseUrl: string): Promise<InvitoView[]> {
  const righe = await db.venueInvite.findMany({
    where: { venueId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return righe.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    link: `${baseUrl}/invito/${i.token}`,
    scadeIl: i.expiresAt,
  }));
}

export async function invitaAlTeam(
  venueId: string,
  raw: unknown,
  baseUrl: string,
  actor?: AuditActor,
): Promise<InvitoView> {
  const data = InvitoInput.parse(raw);

  // Chi c'è già non si invita: l'invito creerebbe un secondo accesso allo
  // stesso locale per la stessa persona, e il secondo vincerebbe in silenzio.
  const gia = await db.venueMembership.findFirst({
    where: { venueId, user: { email: data.email } },
  });
  if (gia) throw new TeamError("gia_nel_team");

  // Un invito aperto per lo stesso indirizzo si sostituisce invece di
  // accumularsi: due link validi per la stessa persona sono due modi di
  // entrare, e uno dei due nessuno lo ricorda.
  await db.venueInvite.deleteMany({ where: { venueId, email: data.email, acceptedAt: null } });

  const invito = await db.venueInvite.create({
    data: {
      venueId,
      email: data.email,
      role: data.role,
      token: randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + INVITO_GIORNI * 86_400_000),
      invitedBy: actor?.userId ?? null,
    },
  });

  await recordAudit(actor, "team.invite", "venue", venueId, {
    email: data.email,
    ruolo: data.role,
    scadeIl: invito.expiresAt.toISOString(),
  });

  return {
    id: invito.id,
    email: invito.email,
    role: invito.role,
    link: `${baseUrl}/invito/${invito.token}`,
    scadeIl: invito.expiresAt,
  };
}

export async function revocaInvito(venueId: string, id: string, actor?: AuditActor) {
  const invito = await db.venueInvite.findFirst({ where: { id, venueId } });
  if (!invito) throw new TeamError("invito_non_valido");
  await db.venueInvite.delete({ where: { id } });
  await recordAudit(actor, "team.invite_revoked", "venue", venueId, { email: invito.email });
}

/* -------------------------------------------------------------------------- */
/*  Il lato pubblico: chi apre il link                                        */
/* -------------------------------------------------------------------------- */

export type InvitoPubblico = {
  token: string;
  venueName: string;
  email: string;
  ruolo: StaffRole;
  /** Vero quando quell'indirizzo ha già un accesso a Tavolo. */
  haGiaUnAccount: boolean;
};

/**
 * Legge un invito dal suo link, senza dire niente di più del necessario.
 *
 * Il nome del locale e il ruolo servono a chi sta accettando per capire dove
 * sta entrando. Tutto il resto — quanti tavoli, quante prenotazioni, chi
 * lavora là — non riguarda una persona che non è ancora dentro.
 */
export async function leggiInvito(token: string): Promise<InvitoPubblico | null> {
  const invito = await db.venueInvite.findUnique({
    where: { token },
    include: { venue: { select: { name: true } } },
  });
  if (!invito) return null;
  if (invito.acceptedAt) return null;
  if (invito.expiresAt.getTime() < Date.now()) return null;

  const utente = await db.user.findUnique({ where: { email: invito.email }, select: { id: true } });

  return {
    token,
    venueName: invito.venue.name,
    email: invito.email,
    ruolo: invito.role,
    haGiaUnAccount: !!utente,
  };
}

export const AccettaInput = z.object({
  token: z.string().min(10),
  /** Solo per chi non ha ancora un accesso. */
  nome: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(10, "Servono almeno dieci caratteri").max(200).optional(),
});

/**
 * Accetta un invito: da qui nasce l'accesso.
 *
 * Due strade, e la differenza sta in chi apre il link:
 *
 * - **ha già un accesso a Tavolo** (lavora in un altro locale del gruppo, o
 *   c'è già stato): non gli si chiede una password nuova, gli si aggiunge il
 *   locale. Chiedergliela vorrebbe dire farne una seconda per la stessa
 *   persona;
 * - **non ce l'ha**: la crea adesso, e il link è la prova che quell'indirizzo
 *   è suo — è lo stesso ragionamento di ogni invito via email, con la
 *   differenza che qui il messaggio l'ha consegnato una persona.
 *
 * In entrambi i casi l'invito si consuma: **vale una volta**. Un link che
 * resta valido dopo l'uso è un accesso in più che nessuno sa di avere.
 */
export async function accettaInvito(
  raw: unknown,
): Promise<{ email: string; venueId: string; nuovoAccesso: boolean }> {
  const data = AccettaInput.parse(raw);

  const invito = await db.venueInvite.findUnique({ where: { token: data.token } });
  if (!invito) throw new TeamError("invito_non_valido");
  if (invito.acceptedAt) throw new TeamError("invito_usato");
  if (invito.expiresAt.getTime() < Date.now()) throw new TeamError("invito_scaduto");

  const esistente = await db.user.findUnique({ where: { email: invito.email } });

  // La **lunghezza** la controlla lo schema, con il suo messaggio in italiano.
  // Qui resta il caso che lo schema non può conoscere: chi non ha ancora un
  // accesso deve scegliere una password, chi ce l'ha non deve toccarla.
  if (!esistente && !data.password) throw new TeamError("password_richiesta");

  const esito = await db.$transaction(async (tx) => {
    const utente =
      esistente ??
      (await tx.user.create({
        data: {
          email: invito.email,
          name: data.nome?.trim() || null,
          passwordHash: await bcrypt.hash(data.password!, 10),
        },
      }));

    // Se nel frattempo qualcuno gliel'ha dato a mano, non si duplica.
    const gia = await tx.venueMembership.findFirst({
      where: { userId: utente.id, venueId: invito.venueId },
    });
    if (!gia) {
      await tx.venueMembership.create({
        data: { userId: utente.id, venueId: invito.venueId, role: invito.role },
      });
    }

    await tx.venueInvite.update({
      where: { id: invito.id },
      data: { acceptedAt: new Date() },
    });

    return { userId: utente.id, nuovoAccesso: !esistente };
  });

  // L'attore qui è la persona che accetta, che non ha ancora una sessione:
  // il registro riceve l'organizzazione dal locale invitante.
  const venue = await db.venue.findUnique({ where: { id: invito.venueId }, select: { orgId: true } });
  if (venue) {
    await recordAudit(
      { userId: esito.userId, orgId: venue.orgId, venueId: invito.venueId, email: invito.email },
      "team.invite_accepted",
      "venue",
      invito.venueId,
      { ruolo: invito.role },
    );
  }

  return { email: invito.email, venueId: invito.venueId, nuovoAccesso: esito.nuovoAccesso };
}

/* -------------------------------------------------------------------------- */
/*  Cambiare ruolo, togliere l'accesso                                        */
/* -------------------------------------------------------------------------- */

/**
 * Le due regole che impediscono a un locale di restare senza nessuno che
 * possa gestirlo, e a una persona di chiudersi fuori da sola.
 *
 * Stanno qui e non nell'interfaccia perché un pulsante nascosto non è un
 * controllo: chi chiama l'API a mano deve sentirsi dire no.
 */
/**
 * Le due difese che valgono per **ogni** azione su un membro del team: che sia
 * davvero di questo locale, e che non sia te stesso.
 */
async function membroDiQuestoLocale(venueId: string, membershipId: string, userId: string) {
  const membro = await db.venueMembership.findFirst({ where: { id: membershipId, venueId } });
  if (!membro) throw new TeamError("invito_non_valido");

  // Su di sé non si agisce: né togliersi l'accesso, né abbassarsi il ruolo.
  // È il modo più comune di restare fuori dal proprio locale.
  if (membro.userId === userId) throw new TeamError("non_su_di_te");

  return membro;
}

async function difendiIlLocale(
  venueId: string,
  membershipId: string,
  userId: string,
  nuovoRuolo: StaffRole | null,
) {
  const membro = await membroDiQuestoLocale(venueId, membershipId, userId);

  /*
    L'ultimo manager non si tocca: senza manager nessuno può più invitare
    nessuno, e il locale diventa inaccessibile per sempre.

    Questa difesa vale per **togliere l'accesso o abbassare il ruolo**, non
    per chiudere le sessioni: chiudere una sessione non toglie l'accesso, la
    persona rientra con la sua password. Applicarla anche là renderebbe
    impossibile chiudere fuori il tablet perso **del titolare**, che è
    esattamente il caso in cui serve. Vedi `chiudiLeSessioni`.
  */
  if (membro.role === "MANAGER" && nuovoRuolo !== "MANAGER") {
    const manager = await db.venueMembership.count({ where: { venueId, role: "MANAGER" } });
    if (manager <= 1) throw new TeamError("ultimo_manager");
  }

  return membro;
}

export async function cambiaRuolo(
  venueId: string,
  membershipId: string,
  ruolo: StaffRole,
  userId: string,
  actor?: AuditActor,
) {
  const membro = await difendiIlLocale(venueId, membershipId, userId, ruolo);
  const aggiornato = await db.venueMembership.update({
    where: { id: membershipId },
    data: { role: ruolo },
  });
  await recordAudit(actor, "team.role_change", "venue", venueId, {
    utente: membro.userId,
    da: membro.role,
    a: ruolo,
  });
  return aggiornato;
}

/**
 * Chiude tutte le sessioni di una persona, su ogni dispositivo.
 *
 * Serve nei due momenti in cui serve: un tablet perso in sala, e una persona
 * che non lavora più qui. Togliere qualcuno dal team gli toglie l'accesso a
 * **questo** locale, ma se ha un altro locale nella stessa organizzazione la
 * sua sessione resta valida — e in ogni caso, fra il momento in cui gli si
 * toglie l'accesso e quello in cui il suo browser lo scopre, un token firmato
 * continua a essere un token firmato.
 *
 * Non cancella niente: scrive un istante. Tutti i token emessi prima di quel
 * momento smettono di valere al primo controllo (vedi `lib/tenant.ts`), e la
 * persona rientra con la sua password come sempre. Non è un divieto: è un
 * «ricominciamo da capo».
 *
 * Le stesse due difese di ogni altra azione sul team: non si agisce su di sé
 * da qui — per uscire dai propri dispositivi c'è `chiudiLeMieSessioni`, che
 * non ha bisogno di essere manager — e non si tocca chi non fa parte di
 * questo locale.
 */
export async function chiudiLeSessioni(
  venueId: string,
  membershipId: string,
  userId: string,
  actor?: AuditActor,
) {
  // `membroDiQuestoLocale` e non `difendiIlLocale`: vedi la nota là sopra —
  // l'ultimo manager si può e si deve poter chiudere fuori.
  const membro = await membroDiQuestoLocale(venueId, membershipId, userId);
  const quando = new Date();
  await db.user.update({ where: { id: membro.userId }, data: { sessionsRevokedAt: quando } });
  await recordAudit(actor, "team.revoke_sessions", "venue", venueId, {
    utente: membro.userId,
    ruolo: membro.role,
    da: quando.toISOString(),
  });
  return quando;
}

/**
 * «Esci da tutti i dispositivi», per sé.
 *
 * Non richiede di essere manager e non passa da `difendiIlLocale`: chiudere le
 * proprie sessioni è sempre lecito, ed è la cosa da fare quando si è lasciato
 * l'accesso aperto da qualche parte e non si sa dove. Chiude anche quella da
 * cui si sta chiedendo: è il senso di «tutti».
 */
export async function chiudiLeMieSessioni(userId: string, actor?: AuditActor) {
  const quando = new Date();
  await db.user.update({ where: { id: userId }, data: { sessionsRevokedAt: quando } });
  await recordAudit(actor, "account.revoke_sessions", "user", userId, { da: quando.toISOString() });
  return quando;
}

export async function togliDalTeam(
  venueId: string,
  membershipId: string,
  userId: string,
  actor?: AuditActor,
) {
  const membro = await difendiIlLocale(venueId, membershipId, userId, null);
  await db.venueMembership.delete({ where: { id: membershipId } });
  await recordAudit(actor, "team.remove", "venue", venueId, {
    utente: membro.userId,
    ruolo: membro.role,
  });
}
