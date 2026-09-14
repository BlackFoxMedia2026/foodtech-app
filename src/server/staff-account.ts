import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { StaffPermission, StaffRole } from "@prisma/client";
import { db } from "@/lib/db";
import { coincideConPreset } from "@/lib/scheda-dipendente";
import { recordAudit, type AuditActor } from "./audit";
import { invitaAlTeam } from "./team";

/**
 * L'account con cui una persona dell'organico entra in Tavolo.
 *
 * Il ponte è `Waiter.userId`. Tutto quello che c'è qui parte dalla persona
 * (`waiterId`) e arriva al suo `User` passando da quel ponte, mai
 * dall'email digitata: l'email si può sbagliare, il ponte no.
 *
 * ## La password non si vede mai
 *
 * Né qui né altrove il prodotto mostra una password. Due strade sole:
 *
 * - **un link di reimpostazione**, da consegnare a mano come l'invito: vale
 *   quarantott'ore e una volta. Nel database sta il suo hash, non il token —
 *   chi legge la tabella non deve poter entrare al posto di nessuno;
 * - **una password nuova scelta dal responsabile**, digitata due volte, che
 *   chiude tutte le sessioni aperte della persona. Da dire a voce, e da
 *   cambiare al primo accesso.
 *
 * ## Le difese
 *
 * Le stesse di `team.ts`, perché sono le stesse situazioni: su di sé non si
 * agisce, e l'ultimo manager di un locale non si disattiva né si abbassa.
 */

export const ORE_VALIDITA_RESET = 48;

export class AccountError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "senza_account"
      | "ha_gia_account"
      | "email_richiesta"
      | "email_in_uso"
      | "non_su_di_te"
      | "ultimo_manager"
      | "link_non_valido",
  ) {
    super(code);
    this.name = "AccountError";
  }
}

export const MESSAGGIO_ACCOUNT: Record<AccountError["code"], string> = {
  not_found: "Questa persona non fa parte di questo locale.",
  senza_account: "Questa persona non ha ancora un account.",
  ha_gia_account: "Questa persona ha già un account.",
  email_richiesta: "Serve un indirizzo email per creare l'accesso.",
  email_in_uso: "Questo indirizzo è già usato da un altro account.",
  non_su_di_te: "Sul tuo account non puoi agire da qui: chiedilo a un altro manager.",
  ultimo_manager: "È l'ultimo manager del locale: nominane un altro prima, altrimenti nessuno potrebbe più gestirlo.",
  link_non_valido: "Questo link non è più valido.",
};

async function personaConAccount(venueId: string, waiterId: string) {
  const persona = await db.waiter.findFirst({
    where: { id: waiterId, venueId },
    include: { user: { include: { venueMemberships: { where: { venueId } } } } },
  });
  if (!persona) throw new AccountError("not_found");
  return persona;
}

function nonSuDiTe(userId: string, actorUserId: string) {
  if (userId === actorUserId) throw new AccountError("non_su_di_te");
}

/** Vero se, tolto `userId`, nel locale non resta nessun manager attivo. */
async function sarebbeUltimoManager(venueId: string, userId: string) {
  const altri = await db.venueMembership.count({
    where: { venueId, role: "MANAGER", disabledAt: null, NOT: { userId } },
  });
  return altri === 0;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/* -------------------------------------------------------------------------- */
/*  Creare l'accesso                                                          */
/* -------------------------------------------------------------------------- */

export const CreaAccessoInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  role: z.nativeEnum(StaffRole),
});

/**
 * Dà un accesso a una persona che non ne ha.
 *
 * Se quell'indirizzo ha già un account in Tavolo **e** già l'accesso a questo
 * locale, si collega e basta. Altrimenti si crea un invito (`team.ts`): il
 * link si consegna a mano, e quando viene accettato `accettaInvito` collega
 * la persona per email.
 */
export async function creaAccesso(
  venueId: string,
  waiterId: string,
  raw: unknown,
  baseUrl: string,
  actor?: AuditActor,
): Promise<{ collegato: true } | { collegato: false; link: string; scadeIl: Date; email: string }> {
  const persona = await personaConAccount(venueId, waiterId);
  if (persona.userId) throw new AccountError("ha_gia_account");
  const data = CreaAccessoInput.parse(raw);
  const email = data.email ?? persona.email?.toLowerCase();
  if (!email) throw new AccountError("email_richiesta");

  if (persona.email !== email) {
    await db.waiter.update({ where: { id: waiterId }, data: { email } });
  }

  const utente = await db.user.findUnique({
    where: { email },
    include: { venueMemberships: { where: { venueId } }, staffProfiles: { where: { venueId } } },
  });
  if (utente?.venueMemberships.length && utente.staffProfiles.length === 0) {
    await db.waiter.update({ where: { id: waiterId }, data: { userId: utente.id } });
    await recordAudit(actor, "waiter.account_invite", "waiter", waiterId, { email, collegato: true });
    return { collegato: true };
  }

  const invito = await invitaAlTeam(venueId, { email, role: data.role }, baseUrl, actor);
  await recordAudit(actor, "waiter.account_invite", "waiter", waiterId, { email, ruolo: data.role, scadeIl: invito.scadeIl.toISOString() });
  return { collegato: false, link: invito.link, scadeIl: invito.scadeIl, email };
}

/** L'invito ancora aperto per questa persona, se c'è: la scheda lo mostra
 * con il link, così chi non l'ha ancora consegnato lo ritrova. */
export async function invitoAperto(venueId: string, email: string | null, baseUrl: string) {
  if (!email) return null;
  const invito = await db.venueInvite.findFirst({
    where: { venueId, email: email.toLowerCase(), acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!invito) return null;
  return { link: `${baseUrl}/invito/${invito.token}`, scadeIl: invito.expiresAt, role: invito.role };
}

/* -------------------------------------------------------------------------- */
/*  Email di accesso                                                          */
/* -------------------------------------------------------------------------- */

export const CambiaEmailInput = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export async function cambiaEmailAccesso(venueId: string, waiterId: string, raw: unknown, actor?: AuditActor) {
  const persona = await personaConAccount(venueId, waiterId);
  if (!persona.user) throw new AccountError("senza_account");
  const { email } = CambiaEmailInput.parse(raw);
  if (email === persona.user.email) return persona.user;

  const occupata = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (occupata) throw new AccountError("email_in_uso");

  const [utente] = await db.$transaction([
    db.user.update({ where: { id: persona.user.id }, data: { email } }),
    db.waiter.update({ where: { id: waiterId }, data: { email } }),
  ]);
  await recordAudit(actor, "waiter.account_email", "waiter", waiterId, { da: persona.user.email, a: email });
  return utente;
}

/* -------------------------------------------------------------------------- */
/*  Password                                                                  */
/* -------------------------------------------------------------------------- */

export const NuovaPasswordInput = z.object({
  password: z.string().min(10, "Servono almeno dieci caratteri").max(200),
});

/** Il responsabile imposta una password nuova. Chiude le sessioni aperte:
 * chi era dentro con la vecchia rientra con la nuova. */
export async function impostaPassword(venueId: string, waiterId: string, raw: unknown, actor?: AuditActor) {
  const persona = await personaConAccount(venueId, waiterId);
  if (!persona.user) throw new AccountError("senza_account");
  const { password } = NuovaPasswordInput.parse(raw);
  await db.user.update({
    where: { id: persona.user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      sessionsRevokedAt: new Date(),
      passwordResetHash: null,
      passwordResetExpiresAt: null,
    },
  });
  // Nel registro c'è che è successo, non che cosa: la password non si scrive
  // da nessuna parte.
  await recordAudit(actor, "waiter.account_password", "waiter", waiterId, { email: persona.user.email });
}

/** Un link per reimpostare la password, da consegnare a mano. */
export async function generaLinkReset(venueId: string, waiterId: string, baseUrl: string, actor?: AuditActor) {
  const persona = await personaConAccount(venueId, waiterId);
  if (!persona.user) throw new AccountError("senza_account");
  const token = randomBytes(32).toString("hex");
  const scadeIl = new Date(Date.now() + ORE_VALIDITA_RESET * 3_600_000);
  await db.user.update({
    where: { id: persona.user.id },
    data: { passwordResetHash: hashToken(token), passwordResetExpiresAt: scadeIl },
  });
  await recordAudit(actor, "waiter.account_reset_link", "waiter", waiterId, { email: persona.user.email, scadeIl: scadeIl.toISOString() });
  return { link: `${baseUrl}/reimposta-password/${token}`, scadeIl };
}

/** Chi ha in mano il link: c'è ancora un reset aperto per questo token? */
export async function leggiReset(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const utente = await db.user.findUnique({
    where: { passwordResetHash: hashToken(token) },
    select: { email: true, passwordResetExpiresAt: true },
  });
  if (!utente?.passwordResetExpiresAt || utente.passwordResetExpiresAt.getTime() < Date.now()) return null;
  return { email: utente.email };
}

export const CompletaResetInput = NuovaPasswordInput.extend({ token: z.string().regex(/^[a-f0-9]{64}$/) });

/** Il lato pubblico: chi apre il link sceglie la password. Il link si consuma. */
export async function completaReset(raw: unknown) {
  const { token, password } = CompletaResetInput.parse(raw);
  const utente = await db.user.findUnique({ where: { passwordResetHash: hashToken(token) } });
  if (!utente?.passwordResetExpiresAt || utente.passwordResetExpiresAt.getTime() < Date.now()) {
    throw new AccountError("link_non_valido");
  }
  await db.user.update({
    where: { id: utente.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      passwordResetHash: null,
      passwordResetExpiresAt: null,
      // Chi aveva la vecchia password su un altro dispositivo esce: è il senso
      // di reimpostarla.
      sessionsRevokedAt: new Date(),
    },
  });
  return { email: utente.email };
}

/* -------------------------------------------------------------------------- */
/*  Attivo / disattivato                                                      */
/* -------------------------------------------------------------------------- */

export async function disattivaAccount(venueId: string, waiterId: string, actorUserId: string, actor?: AuditActor) {
  const persona = await personaConAccount(venueId, waiterId);
  if (!persona.user) throw new AccountError("senza_account");
  nonSuDiTe(persona.user.id, actorUserId);
  const membership = persona.user.venueMemberships[0];
  if (!membership) throw new AccountError("senza_account");
  if (membership.role === "MANAGER" && (await sarebbeUltimoManager(venueId, persona.user.id))) {
    throw new AccountError("ultimo_manager");
  }
  const quando = new Date();
  await db.$transaction([
    db.venueMembership.update({ where: { id: membership.id }, data: { disabledAt: quando } }),
    // Fuori subito, non alla prossima scadenza del token.
    db.user.update({ where: { id: persona.user.id }, data: { sessionsRevokedAt: quando } }),
  ]);
  await recordAudit(actor, "waiter.account_disable", "waiter", waiterId, { email: persona.user.email });
}

export async function riattivaAccount(venueId: string, waiterId: string, actor?: AuditActor) {
  const persona = await personaConAccount(venueId, waiterId);
  if (!persona.user) throw new AccountError("senza_account");
  const membership = persona.user.venueMemberships[0];
  if (!membership) throw new AccountError("senza_account");
  await db.venueMembership.update({ where: { id: membership.id }, data: { disabledAt: null } });
  await recordAudit(actor, "waiter.account_enable", "waiter", waiterId, { email: persona.user.email });
}

/* -------------------------------------------------------------------------- */
/*  Ruolo e permessi                                                          */
/* -------------------------------------------------------------------------- */

export const PermessiInput = z.object({
  role: z.nativeEnum(StaffRole),
  permissions: z.array(z.nativeEnum(StaffPermission)),
});

/**
 * Salva ruolo e permessi. Se l'elenco coincide con il preset del ruolo, si
 * salva **come preset** (`customPermissions: false`): così cambiare ruolo
 * domani porta con sé i permessi nuovi, invece di lasciare quelli vecchi
 * congelati.
 */
export async function aggiornaPermessi(venueId: string, waiterId: string, raw: unknown, actorUserId: string, actor?: AuditActor) {
  const persona = await personaConAccount(venueId, waiterId);
  if (!persona.user) throw new AccountError("senza_account");
  nonSuDiTe(persona.user.id, actorUserId);
  const membership = persona.user.venueMemberships[0];
  if (!membership) throw new AccountError("senza_account");
  const data = PermessiInput.parse(raw);

  if (membership.role === "MANAGER" && data.role !== "MANAGER" && (await sarebbeUltimoManager(venueId, persona.user.id))) {
    throw new AccountError("ultimo_manager");
  }

  const preset = coincideConPreset(data.role, data.permissions);
  const aggiornata = await db.venueMembership.update({
    where: { id: membership.id },
    data: {
      role: data.role,
      customPermissions: !preset,
      permissions: preset ? [] : data.permissions,
    },
  });
  await recordAudit(actor, "waiter.account_permissions", "waiter", waiterId, {
    ruolo: membership.role !== data.role ? { da: membership.role, a: data.role } : undefined,
    permessi: preset ? "predefiniti del ruolo" : data.permissions,
  });
  return aggiornata;
}
