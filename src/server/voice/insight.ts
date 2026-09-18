import { db } from "@/lib/db";
import { segnaEventoChiamata } from "@/server/chiamate";
import { telefonoLeggibile } from "@/lib/telefono";
import type { TipoInsight } from "@/lib/voice-insight";

/**
 * Quello che si scopre al telefono, e che **nessuno scrive** nella scheda.
 *
 * ## Il dato che si perde ogni sera
 *
 * «Mia moglie è celiaca.» «Se possibile il tavolo in fondo, quello vicino alla
 * finestra no.» «Chiamo per mio padre, ha 88 anni, il bagno al piano deve
 * essere raggiungibile.» Sono le tre frasi che cambiano una cena, dette al
 * telefono a chi risponde — e che non arrivano **mai** nella scheda del
 * cliente, perché per scriverle bisogna uscire dalla chiamata, cercare la
 * scheda, aprire il campo giusto.
 *
 * Qui si scrivono in due tocchi mentre si parla, e diventano una **proposta**.
 *
 * ## Perché una proposta e non una scrittura
 *
 * Perché il profilo di un cliente è la cosa più delicata che questo prodotto
 * contiene, e la regola del brief è netta: *niente si scrive nel profilo di un
 * ospite senza approvazione umana*. Vale oggi, che le frasi le scrive una
 * persona al telefono — un nome frainteso, una nota nella scheda sbagliata — e
 * varrà domani, quando le proporrà un risponditore automatico che ha *sentito*
 * «celiaca» in una frase in cui c'era «celiaco mio cognato».
 *
 * Il secondo gesto costa un tocco e compra una cosa sola: che nella scheda di
 * un cliente non ci sia **niente** che nessuno ha guardato.
 *
 * ## Si aggiunge, non si sovrascrive
 *
 * Approvare un'allergia non cancella quelle che c'erano: si accoda. Una
 * scrittura che sostituisce il campo farebbe sparire «arachidi» il giorno in
 * cui qualcuno approva «lattosio», e la differenza si scoprirebbe in cucina.
 */

export type InsightDaApprovare = {
  id: string;
  tipo: string;
  valore: string;
  quando: Date;
  /** Chi ha chiamato: il nome se lo conosciamo, il numero se no. */
  chi: string | null;
  /** La scheda su cui finirebbe. Nullo quando quel numero non è di nessuno. */
  ospite: { id: string; nome: string } | null;
  callId: string;
};

export class SenzaOspiteError extends Error {
  constructor() {
    super("senza_ospite");
    this.name = "SenzaOspiteError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Proporre                                                                  */
/* -------------------------------------------------------------------------- */

export async function proponiInsight(
  venueId: string,
  callId: string,
  dati: { tipo: TipoInsight; valore: string },
  attore?: string | null,
): Promise<{ id: string }> {
  const chiamata = await db.phoneCall.findFirst({
    where: { id: callId, venueId },
    select: { id: true, guestId: true },
  });
  /* La chiamata deve essere di **questo** locale: l'identificativo arriva da
     una richiesta, e senza questo controllo si scriverebbe una proposta sulla
     scheda di un cliente di un altro ristorante. */
  if (!chiamata) throw new Error("not_found");

  const creato = await db.voiceCRMInsight.create({
    data: {
      venueId,
      callId: chiamata.id,
      /* L'ospite si fissa **adesso**: se domani quel numero passa a un'altra
         scheda, questa proposta resta di chi era al telefono quel giorno. */
      guestId: chiamata.guestId,
      tipo: dati.tipo,
      valore: dati.valore.trim().slice(0, 300),
    },
    select: { id: true },
  });

  await segnaEventoChiamata(chiamata.id, "CRM_INSIGHT_CREATED", {
    actor: attore ?? null,
    meta: { tipo: dati.tipo },
  });

  return creato;
}

/* -------------------------------------------------------------------------- */
/*  Leggere                                                                   */
/* -------------------------------------------------------------------------- */

export async function insightDaApprovare(
  venueId: string,
): Promise<InsightDaApprovare[]> {
  const righe = await db.voiceCRMInsight.findMany({
    where: { venueId, stato: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      tipo: true,
      valore: true,
      createdAt: true,
      callId: true,
      guest: { select: { id: true, firstName: true, lastName: true } },
      call: { select: { fromNumber: true } },
    },
  });

  return righe.map((r) => {
    const nome = r.guest
      ? `${r.guest.firstName}${r.guest.lastName ? ` ${r.guest.lastName}` : ""}`
      : null;
    return {
      id: r.id,
      tipo: r.tipo,
      valore: r.valore,
      quando: r.createdAt,
      chi: nome ?? telefonoLeggibile(r.call.fromNumber),
      ospite: r.guest ? { id: r.guest.id, nome: nome! } : null,
      callId: r.callId,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Decidere                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Approva: l'informazione entra nella scheda dell'ospite.
 *
 * Senza una scheda non si può approvare — e non è un limite tecnico: non
 * esiste nessun posto dove scrivere l'allergia di un numero di telefono. Chi
 * approva vede il messaggio giusto: prima si dà un nome a quel numero, e il
 * gesto per farlo è a due righe di distanza nello storico.
 */
export async function approvaInsight(
  venueId: string,
  id: string,
  attore?: string | null,
): Promise<{ ospiteId: string }> {
  const riga = await db.voiceCRMInsight.findFirst({
    where: { id, venueId },
    select: { id: true, tipo: true, valore: true, guestId: true, stato: true },
  });
  if (!riga) throw new Error("not_found");
  /* Già decisa: non si riscrive chi ha deciso e quando, e non si scrive due
     volte la stessa frase nella scheda. */
  if (riga.stato !== "PENDING") {
    if (!riga.guestId) throw new SenzaOspiteError();
    return { ospiteId: riga.guestId };
  }
  if (!riga.guestId) throw new SenzaOspiteError();

  const ospite = await db.guest.findFirst({
    where: { id: riga.guestId, venueId },
    select: {
      id: true,
      allergies: true,
      privateNotes: true,
      preferences: true,
    },
  });
  if (!ospite) throw new Error("not_found");

  const dati = scritturaPerTipo(riga.tipo, riga.valore, ospite);

  /* La scheda e la decisione insieme: se la scrittura nella scheda riuscisse e
     la proposta restasse in attesa, la stessa frase verrebbe approvata due
     volte e finirebbe due volte nella scheda. */
  await db.$transaction([
    db.guest.update({ where: { id: ospite.id }, data: dati }),
    db.voiceCRMInsight.update({
      where: { id: riga.id },
      data: { stato: "SAVED", decisoDa: attore ?? null, decisoIl: new Date() },
    }),
  ]);

  return { ospiteId: ospite.id };
}

/** Ignora: è una decisione, e resta scritta con chi l'ha presa. */
export async function ignoraInsight(
  venueId: string,
  id: string,
  attore?: string | null,
): Promise<void> {
  const riga = await db.voiceCRMInsight.findFirst({
    where: { id, venueId, stato: "PENDING" },
    select: { id: true },
  });
  if (!riga) throw new Error("not_found");
  await db.voiceCRMInsight.update({
    where: { id: riga.id },
    data: { stato: "IGNORED", decisoDa: attore ?? null, decisoIl: new Date() },
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Dove va a finire una frase, per tipo — **accodata**, non al posto di quello
 * che c'era.
 *
 * E se c'è già, non si accoda niente: approvare due volte «celiaca» non deve
 * lasciare «celiaca · celiaca» nella riga che in sala si legge di corsa.
 */
function scritturaPerTipo(
  tipo: string,
  valore: string,
  ospite: {
    allergies: string | null;
    privateNotes: string | null;
    preferences: unknown;
  },
): Record<string, unknown> {
  if (tipo === "allergia") {
    return { allergies: accoda(ospite.allergies, valore, " · ") };
  }
  if (tipo === "preferenza") {
    const attuali =
      ospite.preferences && typeof ospite.preferences === "object"
        ? (ospite.preferences as Record<string, unknown>)
        : {};
    const note = typeof attuali.note === "string" ? attuali.note : null;
    return { preferences: { ...attuali, note: accoda(note, valore, " · ") } };
  }
  /* «nota» è anche il ripiego: un tipo sconosciuto — una riga vecchia, o una
     scritta da un'altra versione — finisce nelle note interne, che è il posto
     dove non fa danni. Perderla non sarebbe meglio. */
  return { privateNotes: accoda(ospite.privateNotes, valore, "\n") };
}

function accoda(
  attuale: string | null,
  aggiunta: string,
  separatore: string,
): string {
  const pulita = aggiunta.trim();
  if (!attuale?.trim()) return pulita;
  const dentro = attuale.toLowerCase().includes(pulita.toLowerCase());
  return dentro ? attuale : `${attuale}${separatore}${pulita}`;
}
