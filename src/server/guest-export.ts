import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Dare a una persona tutto quello che il locale ha su di lei.
 *
 * È la metà gemella della cancellazione (`guest-erasure.ts`): **gli stessi
 * sette posti, letti invece che svuotati**. E si scrive subito dopo, perché la
 * richiesta di accesso arriva più spesso di quella di cancellazione — spesso è
 * il passo prima.
 *
 * Due scelte che valgono la pena di essere dette.
 *
 * **Si esporta anche quello che il locale ha scritto di suo pugno**: le note
 * riservate, il rischio no-show, le etichette. Sono dati su quella persona, e
 * il fatto che siano scomodi da mostrare non li rende di qualcun altro. Un
 * export che tiene fuori le note riservate non è un export, è una vetrina.
 *
 * **Non si esportano gli identificativi interni** oltre a quelli che servono a
 * capire il documento. Gli `id` di questa applicazione non dicono niente a chi
 * legge e non sono dati suoi: sono nostri.
 *
 * Il formato è JSON e non PDF: deve essere leggibile da una persona **e**
 * riutilizzabile da chi lo riceve, e un PDF impaginato è la scusa con cui si
 * consegnano dati che nessuno può rileggere.
 */

export type EsportazioneOspite = {
  /** Chi ha prodotto il documento, quando, e per chi. */
  documento: {
    locale: string;
    generatoIl: string;
    riguarda: string;
    nota: string;
  };
  scheda: Record<string, unknown>;
  prenotazioni: Array<Record<string, unknown>>;
  conti: Array<Record<string, unknown>>;
  puntiFedelta: { saldo: number; movimenti: Array<Record<string, unknown>> };
  coupon: Array<Record<string, unknown>>;
  accessiWifi: Array<Record<string, unknown>>;
  messaggiRicevuti: Array<Record<string, unknown>>;
  consensi: Array<Record<string, unknown>>;
  sondaggi: Array<Record<string, unknown>>;
};

export class ExportError extends Error {
  constructor(public code: "not_found") {
    super(code);
  }
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const euro = (c: number) => Number((c / 100).toFixed(2));

/**
 * Tutto quello che il locale ha su questa persona, in un documento.
 *
 * Una lettura sola per tabella, e nessun limite: se una persona ha
 * quarant'anni di prenotazioni le vuole tutte, e tagliare a cinquanta un
 * documento che si chiama «tutti i tuoi dati» sarebbe la solita lista che
 * mente per omissione.
 */
export async function esportaOspite(
  venueId: string,
  guestId: string,
  opts: { actor?: AuditActor } = {},
): Promise<EsportazioneOspite> {
  const ospite = await db.guest.findFirst({
    where: { id: guestId, venueId },
    include: { venue: { select: { name: true, currency: true } } },
  });
  if (!ospite) throw new ExportError("not_found");

  const [prenotazioni, conti, movimenti, coupon, wifi, messaggi, consensi, sondaggi] = await Promise.all([
    db.booking.findMany({
      where: { venueId, guestId },
      orderBy: { startsAt: "desc" },
      include: { table: { select: { label: true } } },
    }),
    db.order.findMany({
      where: { venueId, guestId },
      orderBy: { createdAt: "desc" },
      include: { OrderItem: { select: { name: true, priceCents: true, quantity: true } } },
    }),
    db.loyaltyTransaction.findMany({ where: { venueId, guestId }, orderBy: { createdAt: "desc" } }),
    db.coupon.findMany({ where: { venueId, guestId }, orderBy: { createdAt: "desc" } }),
    db.wifiLead.findMany({ where: { venueId, guestId }, orderBy: { createdAt: "desc" } }),
    db.messageLog.findMany({ where: { venueId, guestId }, orderBy: { createdAt: "desc" } }),
    db.consentLog.findMany({ where: { venueId, guestId }, orderBy: { createdAt: "desc" } }),
    db.surveyResponse.findMany({
      where: { Survey: { venueId, guestId } },
      orderBy: { createdAt: "desc" },
      include: { Survey: { select: { sentAt: true, respondedAt: true } } },
    }),
  ]);

  const nome = `${ospite.firstName}${ospite.lastName ? ` ${ospite.lastName}` : ""}`;

  await recordAudit(opts.actor, "guest.export", "guest", guestId, {
    prenotazioni: prenotazioni.length,
    conti: conti.length,
    messaggi: messaggi.length,
  });

  return {
    documento: {
      locale: ospite.venue.name,
      generatoIl: new Date().toISOString(),
      riguarda: nome,
      nota:
        "Questo documento contiene tutti i dati che il locale conserva su questa persona, " +
        "comprese le annotazioni scritte dal personale. Gli importi sono in euro.",
    },

    scheda: {
      nome: ospite.firstName,
      cognome: ospite.lastName,
      email: ospite.email,
      telefono: ospite.phone,
      compleanno: iso(ospite.birthday),
      lingua: ospite.language,
      allergieEIntolleranze: ospite.allergies,
      // Anche questa: è un dato su di lei, e il fatto che sia scomodo da
      // mostrare non lo rende di qualcun altro.
      noteDelPersonale: ospite.privateNotes,
      preferenze: ospite.preferences,
      etichette: ospite.tags,
      consensoMarketing: ospite.marketingOptIn,
      riconoscimento: ospite.loyaltyTier,
      visiteRegistrate: ospite.totalVisits,
      assenzeSenzaDisdetta: ospite.noShowCount,
      ultimaVisita: iso(ospite.lastVisitAt),
      bloccato: ospite.blocked,
      motivoBlocco: ospite.blockedReason,
      creataIl: iso(ospite.createdAt),
      datiCancellatiIl: iso(ospite.anonymizedAt),
    },

    prenotazioni: prenotazioni.map((b) => ({
      quando: iso(b.startsAt),
      persone: b.partySize,
      durataMinuti: b.durationMin,
      stato: b.status,
      tavolo: b.table?.label ?? null,
      occasione: b.occasion,
      arrivataDa: b.source,
      noteScritteDaTe: b.notes,
      noteInterneDelLocale: b.internalNotes,
      arrivataIl: iso(b.arrivedAt),
      seduteIl: iso(b.seatedAt),
    })),

    conti: conti.map((o) => ({
      riferimento: o.reference,
      quando: iso(o.createdAt),
      stato: o.status,
      tavolo: o.tableLabel,
      totale: euro(o.totalCents),
      valuta: o.currency,
      righe: o.OrderItem.map((i) => ({
        piatto: i.name,
        prezzo: euro(i.priceCents),
        quantita: i.quantity,
      })),
    })),

    puntiFedelta: {
      saldo: movimenti.reduce((s, m) => s + m.points, 0),
      movimenti: movimenti.map((m) => ({
        quando: iso(m.createdAt),
        tipo: m.kind,
        punti: m.points,
        valore: m.amountCents != null ? euro(m.amountCents) : null,
        motivo: m.reason,
      })),
    },

    coupon: coupon.map((c) => ({
      codice: c.code,
      nome: c.name,
      tipo: c.kind,
      valore: c.value,
      categoria: c.category,
      stato: c.status,
      validoFinoAl: iso(c.validUntil),
      creatoIl: iso(c.createdAt),
    })),

    accessiWifi: wifi.map((w) => ({
      quando: iso(w.createdAt),
      nomeLasciato: w.name,
      email: w.email,
      telefono: w.phone,
      indirizzoIp: w.ipAddress,
      dispositivo: w.userAgent,
      consensoMarketing: w.consentMarketing,
    })),

    messaggiRicevuti: messaggi.map((m) => ({
      quando: iso(m.createdAt),
      canale: m.channel,
      tipo: m.kind,
      destinatario: m.toAddress || null,
      oggetto: m.subject,
      anteprima: m.bodyPreview,
      stato: m.status,
      consegnatoIl: iso(m.deliveredAt),
    })),

    consensi: consensi.map((c) => ({
      quando: iso(c.createdAt),
      riguarda: c.channel,
      concesso: c.granted,
      da: c.source,
      indirizzoIp: c.ipAddress,
      dispositivo: c.userAgent,
    })),

    sondaggi: sondaggi.map((s) => ({
      invitoInviatoIl: iso(s.Survey.sentAt),
      rispostoIl: iso(s.Survey.respondedAt),
      voto: s.npsScore,
      consiglierebbe: s.recommend,
      commento: s.comment,
    })),
  };
}

/** Un nome file che si capisce dentro una cartella di download. */
export function nomeFileExport(nome: string, quando = new Date()): string {
  const pulito = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `dati-${pulito || "ospite"}-${quando.toISOString().slice(0, 10)}.json`;
}
