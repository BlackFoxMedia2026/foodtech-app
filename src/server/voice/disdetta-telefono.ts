import { db } from "@/lib/db";
import { riconosciChiamante } from "@/server/telefonia";
import { recordAudit, type AuditActor } from "@/server/audit";
import { annunciaDisdetta } from "@/server/bookings";

/**
 * Disdire al telefono, parlando con la voce.
 *
 * ## Perché conta più di prendere una prenotazione
 *
 * Chi chiama per disdire e non riesce **diventa un no-show**: il tavolo resta
 * bloccato, nessuno lo rivende, e il locale incolpa il cliente che invece
 * aveva provato ad avvisare. È la telefonata che i concorrenti gestiscono e
 * noi no.
 *
 * ## Su cosa poggia il riconoscimento, e cosa vale
 *
 * Sul **numero di chi chiama**: si disdice solo una prenotazione che ha quel
 * numero in scheda. Non è una credenziale forte — un numero si può falsificare
 * — ed è esattamente la stessa protezione che ha una telefonata vera: chi
 * chiama il ristorante e dice «sono Rossi, disdico» viene creduto. La
 * differenza è che qui resta scritto chi ha disdetto e da quale numero.
 *
 * Per questo la voce **ripete giorno, ora e coperti prima di disdire**: non è
 * cortesia, è il controllo che chi parla sappia cosa sta disdicendo.
 *
 * ## Una disdetta non si annulla da qui
 *
 * Se qualcuno disdice per sbaglio, la prenotazione la riapre il locale. Dare
 * alla voce il potere di rimettere in piedi una prenotazione disdetta vorrebbe
 * dire che un tavolo può tornare occupato senza che nessuno in sala lo sappia.
 */

/** Gli stati da cui si può disdire: una già disdetta o già seduta no. */
const DISDICIBILI = ["PENDING", "CONFIRMED"] as const;

export type PrenotazioneDaDisdire = {
  id: string;
  quando: Date;
  persone: number;
  /** Il nome in scheda, per farlo ripetere alla voce. */
  nome: string | null;
};

/**
 * La prossima prenotazione di chi sta chiamando.
 *
 * `null` quando non ce n'è nessuna: la voce lo dice e non prova a indovinare.
 * Si riusa `riconosciChiamante`, che sa già confrontare i numeri come li
 * scrivono le persone — se qui si rifacesse il confronto a modo proprio, lo
 * stesso cliente sarebbe riconosciuto mentre chiama e sconosciuto quando
 * disdice.
 */
/**
 * Le schede che hanno il numero di chi sta chiamando.
 *
 * Sono **più di una**, e non per un difetto dei dati: una famiglia usa un
 * numero solo, e il locale ha una scheda per il marito e una per la moglie.
 * Chiedere solo `prossimaPrenotazione` bastava per dire «buonasera signor
 * Rossi» e non basta per disdire: la prenotazione di venerdì può essere sotto
 * l'altra scheda, e sarebbe stata rifiutata come «numero diverso» — cioè
 * accusando di appropriazione chi stava disdicendo la propria cena.
 */
async function schedeDiChiChiama(
  venueId: string,
  telefono: string | null | undefined,
  adesso: Date,
): Promise<string[]> {
  if (!telefono?.trim()) return [];
  const chi = await riconosciChiamante(venueId, telefono, adesso);
  const ids = new Set<string>();
  if (chi.guest) ids.add(chi.guest.id);
  for (const s of chi.altreSchede) ids.add(s.id);
  return [...ids];
}

/**
 * La prossima prenotazione **disdicibile** di chi sta chiamando.
 *
 * `null` quando non ce n'è nessuna: la voce lo dice e non prova a indovinare.
 * Il riconoscimento del numero passa da `riconosciChiamante`, che sa già
 * confrontare i numeri come li scrivono le persone — se qui si rifacesse il
 * confronto a modo proprio, lo stesso cliente sarebbe riconosciuto mentre
 * chiama e sconosciuto quando disdice.
 *
 * Si cerca fra gli stati disdicibili e non fra quelli «in arrivo»: chi è già
 * seduto al tavolo non sta disdicendo, e offrirgli di disdire vorrebbe dire
 * liberare in Tavolo un tavolo occupato.
 */
export async function prenotazioneDaDisdire(
  venueId: string,
  telefono: string | null | undefined,
  adesso: Date = new Date(),
): Promise<PrenotazioneDaDisdire | null> {
  const schede = await schedeDiChiChiama(venueId, telefono, adesso);
  if (schede.length === 0) return null;

  const riga = await db.booking.findFirst({
    where: {
      venueId,
      guestId: { in: schede },
      deletedAt: null,
      startsAt: { gte: adesso },
      status: { in: [...DISDICIBILI] },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      partySize: true,
      guest: { select: { firstName: true, lastName: true } },
    },
  });
  if (!riga) return null;

  return {
    id: riga.id,
    quando: riga.startsAt,
    persone: riga.partySize,
    nome: riga.guest
      ? `${riga.guest.firstName}${riga.guest.lastName ? ` ${riga.guest.lastName}` : ""}`
      : null,
  };
}

export type MotivoMancato =
  | "non_trovata"
  | "numero_diverso"
  | "gia_passata"
  | "gia_disdetta"
  | "gia_in_sala";

export type EsitoDisdetta =
  | { ok: true; quando: Date; persone: number }
  | { ok: false; perche: MotivoMancato };

/** Perché quella prenotazione non si è potuta disdire, letto dal suo stato. */
function perchePerStato(stato: string): MotivoMancato {
  if (stato === "CANCELLED") return "gia_disdetta";
  if (stato === "ARRIVED" || stato === "SEATED" || stato === "COMPLETED") return "gia_in_sala";
  return "gia_disdetta";
}

/**
 * Disdice, con la condizione **dentro** la scrittura.
 *
 * Due telefonate in parallelo sulla stessa prenotazione non possono disdirla
 * due volte, e — più importante — una prenotazione che in sala è appena
 * diventata «arrivato» non si può disdire dal telefono: la seconda scrittura
 * non trova più una prenotazione in uno stato disdicibile. Un `if (si può)`
 * seguito da `update` lo permetterebbe, e il tavolo risulterebbe libero con la
 * gente seduta.
 *
 * Quando la scrittura non trova niente **si rilegge lo stato**, perché il
 * motivo va detto giusto: «era già disdetta» e «è appena entrata in sala»
 * portano a due frasi diverse al telefono, e dire la prima quando vale la
 * seconda manda il cliente a credere che il tavolo non sia più suo.
 */
export async function disdiciDalTelefono(
  venueId: string,
  dati: { bookingId: string; telefono: string | null | undefined },
  opz: { actor?: AuditActor; adesso?: Date } = {},
): Promise<EsitoDisdetta> {
  const adesso = opz.adesso ?? new Date();

  const riga = await db.booking.findFirst({
    where: { id: dati.bookingId, venueId, deletedAt: null },
    select: {
      id: true,
      status: true,
      startsAt: true,
      partySize: true,
      guestId: true,
      venue: { select: { orgId: true } },
      guest: { select: { firstName: true, lastName: true } },
      table: { select: { label: true } },
    },
  });
  if (!riga) return { ok: false, perche: "non_trovata" };

  /* Prima di tutto: è sua? Un identificativo arriva da una richiesta, e senza
     questo controllo si disdirebbe la cena di uno sconosciuto. */
  const schede = await schedeDiChiChiama(venueId, dati.telefono, adesso);
  if (!riga.guestId || !schede.includes(riga.guestId)) {
    return { ok: false, perche: "numero_diverso" };
  }

  if (riga.status === "CANCELLED") return { ok: false, perche: "gia_disdetta" };
  if (riga.startsAt.getTime() < adesso.getTime()) return { ok: false, perche: "gia_passata" };

  const disdetta = await db.booking.updateMany({
    where: { id: riga.id, venueId, deletedAt: null, status: { in: [...DISDICIBILI] } },
    data: { status: "CANCELLED" },
  });
  if (disdetta.count === 0) {
    const ora = await db.booking.findUnique({
      where: { id: riga.id },
      select: { status: true },
    });
    return { ok: false, perche: ora ? perchePerStato(ora.status) : "non_trovata" };
  }

  /*
    Resta scritto **chi** ha disdetto, e da quale numero non lo scriviamo: il
    numero è un dato personale e sta già nella scheda dell'ospite.

    L'attore qui non è una persona — nessuno ha premuto niente, ha parlato una
    voce — e senza un attore `recordAudit` non scrive nulla e se ne va in
    silenzio: una disdetta invisibile nel registro, che è il difetto che questa
    funzione esiste per non avere. Quindi l'attore è il centralino, dichiarato.
  */
  const attore: AuditActor =
    opz.actor ??
    ({
      userId: "centralino",
      email: null,
      orgId: riga.venue.orgId,
      venueId,
    } satisfies AuditActor);

  await recordAudit(attore, "booking.cancel", "booking", riga.id, {
    da: "telefono",
    quando: riga.startsAt.toISOString(),
    coperti: riga.partySize,
  });

  /*
    E la sala lo deve **sapere**: un tavolo disdetto che nessuno annuncia resta
    apparecchiato tutta la sera, cioè il danno che disdire al telefono doveva
    evitare. L'annuncio è la stessa funzione che usa la disdetta fatta dal
    gestionale: due formule per lo stesso avviso divergerebbero al primo
    ritocco, e quella che non emette lascerebbe la schermata incantata.
  */
  await annunciaDisdetta(
    venueId,
    {
      id: riga.id,
      startsAt: riga.startsAt,
      partySize: riga.partySize,
      nome: riga.guest
        ? `${riga.guest.firstName}${riga.guest.lastName ? ` ${riga.guest.lastName}` : ""}`
        : null,
      tavolo: riga.table?.label ?? null,
    },
    adesso,
  );

  return { ok: true, quando: riga.startsAt, persone: riga.partySize };
}
