import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Cancellare i dati di una persona, quando lo chiede.
 *
 * `Guest.anonymizedAt` e `anonymizedBy` stavano nello schema e nessuno li
 * scriveva: la richiesta di cancellazione si evadeva a mano sul database,
 * ammesso che qualcuno sapesse dove guardare. E i posti da guardare sono
 * sette, non uno — il portale Wi-Fi, i messaggi inviati, le note sulle
 * prenotazioni, i commenti dei sondaggi.
 *
 * **La regola che tiene in piedi tutto: cancellare i dati di una persona non
 * deve riscrivere i conti.** Chi chiede la cancellazione ha diritto a
 * sparire come persona, non a far sparire una cena che è stata servita e
 * pagata. Quindi:
 *
 * - **spariscono** nome, cognome, email, telefono, compleanno, allergie, note
 *   riservate, preferenze, etichette, e ogni riga scritta *su* quella persona
 *   (note delle prenotazioni, indirizzi dei messaggi, contatti dal Wi-Fi,
 *   indirizzi IP, commenti nei sondaggi);
 * - **restano** coperti, date, stati, conti chiusi e le loro righe, punti,
 *   utilizzi dei coupon, voti dei sondaggi. Cioè tutto quello che serve a
 *   sapere com'è andato un mese.
 *
 * Non si cancella la riga dell'ospite. Cancellarla porterebbe via le
 * prenotazioni collegate — quindi i coperti, quindi l'incasso — e il locale
 * scoprirebbe a fine mese di aver perso tre serate perché una persona ha
 * esercitato un suo diritto. La riga resta, vuota e segnata: è la differenza
 * fra anonimizzare e distruggere.
 *
 * È **irreversibile** e lo si dice prima. Nessun ripristino: i dati non
 * vengono spostati in un archivio nascosto, vengono sovrascritti.
 */

/** Il nome che resta al posto di quello vero. */
const SEGNAPOSTO = "Ospite anonimizzato";

export class ErasureError extends Error {
  constructor(public code: "not_found" | "already_anonymized" | "reason_required") {
    super(code);
  }
}

export type CosaSparisce = {
  /** Riferimenti che verranno svuotati, contati per categoria. */
  contatti: number;
  noteSuPrenotazioni: number;
  contattiWifi: number;
  messaggiInviati: number;
  consensiRegistrati: number;
  commentiSondaggi: number;
  contiConNomeScritto: number;
};

export type CosaResta = {
  prenotazioni: number;
  contiChiusi: number;
  incassoCents: number;
  punti: number;
  couponUsati: number;
  votiSondaggi: number;
};

export type AnteprimaCancellazione = {
  guestId: string;
  nome: string;
  giaAnonimizzato: boolean;
  sparisce: CosaSparisce;
  resta: CosaResta;
};

/**
 * Cosa succede se si preme quel pulsante, prima di premerlo.
 *
 * Serve perché una cancellazione irreversibile non si chiede con «sei
 * sicuro?»: si chiede mostrando esattamente cosa va via e cosa rimane. Il
 * secondo elenco è quello che tranquillizza chi deve decidere — i conti non si
 * toccano.
 */
export async function anteprimaCancellazione(
  venueId: string,
  guestId: string,
): Promise<AnteprimaCancellazione> {
  const ospite = await db.guest.findFirst({ where: { id: guestId, venueId } });
  if (!ospite) throw new ErasureError("not_found");

  const [
    prenotazioni,
    noteSuPrenotazioni,
    contattiWifi,
    messaggiInviati,
    consensiRegistrati,
    commentiSondaggi,
    contiConNomeScritto,
    conti,
    punti,
    couponUsati,
    votiSondaggi,
  ] = await Promise.all([
    db.booking.count({ where: { venueId, guestId } }),
    db.booking.count({
      where: { venueId, guestId, OR: [{ notes: { not: null } }, { internalNotes: { not: null } }] },
    }),
    db.wifiLead.count({ where: { venueId, guestId } }),
    db.messageLog.count({ where: { venueId, guestId } }),
    db.consentLog.count({ where: { venueId, guestId } }),
    db.surveyResponse.count({ where: { Survey: { venueId, guestId }, comment: { not: null } } }),
    db.order.count({ where: { venueId, guestId, OR: [{ customerName: { not: null } }, { phone: { not: null } }] } }),
    db.order.findMany({ where: { venueId, guestId, status: "COMPLETED" }, select: { totalCents: true } }),
    db.loyaltyTransaction.aggregate({ where: { venueId, guestId }, _sum: { points: true } }),
    db.couponRedemption.count({ where: { venueId, guestId, deletedAt: null } }),
    db.surveyResponse.count({ where: { Survey: { venueId, guestId } } }),
  ]);

  const contatti = [ospite.email, ospite.phone].filter(Boolean).length;

  return {
    guestId,
    nome: `${ospite.firstName}${ospite.lastName ? ` ${ospite.lastName}` : ""}`,
    giaAnonimizzato: ospite.anonymizedAt != null,
    sparisce: {
      contatti,
      noteSuPrenotazioni,
      contattiWifi,
      messaggiInviati,
      consensiRegistrati,
      commentiSondaggi,
      contiConNomeScritto,
    },
    resta: {
      prenotazioni,
      contiChiusi: conti.length,
      incassoCents: conti.reduce((s, o) => s + o.totalCents, 0),
      punti: punti._sum.points ?? 0,
      couponUsati,
      votiSondaggi,
    },
  };
}

export type EsitoCancellazione = {
  guestId: string;
  /** Quante righe sono state ripulite, per tabella. */
  ripulite: Record<string, number>;
  quando: Date;
};

/**
 * Esegue la cancellazione.
 *
 * Tutto in una transazione: una cancellazione a metà lascerebbe il nome in una
 * tabella e non nell'altra, cioè non sarebbe una cancellazione — e la persona
 * avrebbe ricevuto una conferma falsa.
 *
 * Il motivo è obbligatorio, come per ogni forzatura in questa applicazione:
 * fra un anno «anonimizzato» senza contesto non si distingue da un errore, e
 * qui l'errore non si può correggere.
 */
export async function anonimizzaOspite(
  venueId: string,
  guestId: string,
  input: { reason: string },
  opts: { actor?: AuditActor } = {},
): Promise<EsitoCancellazione> {
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new ErasureError("reason_required");

  const quando = new Date();

  const ripulite = await db.$transaction(async (tx) => {
    const ospite = await tx.guest.findFirst({ where: { id: guestId, venueId } });
    if (!ospite) throw new ErasureError("not_found");
    if (ospite.anonymizedAt) throw new ErasureError("already_anonymized");

    // 1. La scheda: via tutto quello che identifica o descrive la persona.
    //    Restano `totalVisits`, `totalSpend`, `noShowCount` e `lastVisitAt`:
    //    sono numeri sull'andamento del locale, non dati su di lei, e non
    //    permettono di risalire a nessuno.
    await tx.guest.update({
      where: { id: guestId },
      data: {
        firstName: SEGNAPOSTO,
        lastName: null,
        email: null,
        phone: null,
        birthday: null,
        allergies: null,
        privateNotes: null,
        // Un campo JSON si svuota con `DbNull`: `null` in Prisma vorrebbe dire
        // «non cambiarlo».
        preferences: Prisma.DbNull,
        tags: [],
        marketingOptIn: false,
        // Il riconoscimento assegnato a mano non ha più a chi riferirsi.
        loyaltyTier: "NEW",
        blockedReason: null,
        anonymizedAt: quando,
        anonymizedBy: opts.actor?.userId ?? null,
      },
    });

    // 2. Le note scritte *sulla* persona, sulle prenotazioni. Le prenotazioni
    //    restano: sono i coperti di quelle serate.
    const prenotazioni = await tx.booking.updateMany({
      where: { venueId, guestId },
      data: { notes: null, internalNotes: null },
    });

    // 3. I contatti lasciati al portale Wi-Fi, IP compreso.
    const wifi = await tx.wifiLead.updateMany({
      where: { venueId, guestId },
      data: { name: SEGNAPOSTO, email: null, phone: null, ipAddress: null, userAgent: null },
    });

    // 4. I messaggi inviati: resta che sono stati inviati e quando — serve a
    //    non rimandare due volte lo stesso promemoria — spariscono
    //    destinatario, oggetto e anteprima del testo.
    const messaggi = await tx.messageLog.updateMany({
      where: { venueId, guestId },
      data: { toAddress: "", subject: null, bodyPreview: null },
    });

    // 5. I consensi: la riga resta, perché è la prova di cosa è stato
    //    scelto e quando. Spariscono IP e dispositivo, che sono dati sulla
    //    persona e non sulla scelta.
    const consensi = await tx.consentLog.updateMany({
      where: { venueId, guestId },
      data: { ipAddress: null, userAgent: null },
    });

    // 6. I commenti dei sondaggi sono scritti di suo pugno. I voti restano:
    //    sono la misura di com'è andato il servizio.
    const sondaggi = await tx.surveyResponse.updateMany({
      where: { Survey: { venueId, guestId } },
      data: { comment: null },
    });

    // 7. I conti restano interi — incasso e costo del cibo si calcolano da
    //    quelli — ma il nome e il telefono scritti sopra vanno via.
    const conti = await tx.order.updateMany({
      where: { venueId, guestId },
      data: { customerName: null, phone: null, email: null, notes: null },
    });

    return {
      prenotazioni: prenotazioni.count,
      contattiWifi: wifi.count,
      messaggi: messaggi.count,
      consensi: consensi.count,
      sondaggi: sondaggi.count,
      conti: conti.count,
    };
  });

  await recordAudit(opts.actor, "guest.anonymize", "guest", guestId, {
    motivo: reason,
    quando: quando.toISOString(),
    ...ripulite,
  });

  return { guestId, ripulite, quando };
}
