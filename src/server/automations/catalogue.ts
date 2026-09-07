import type { AutomationTrigger } from "@prisma/client";
import { db } from "@/lib/db";
import { TAG_RULES } from "@/server/guest-intelligence";

/**
 * Le automazioni sono un **numero chiuso**, non un costruttore libero.
 *
 * Un editor «se questo allora quello» sembra più potente, e in un gestionale
 * per ristoranti non viene usato: chi apre alle 19 non ha il tempo di
 * progettare un diagramma, e una regola scritta di fretta scrive a tutti la
 * cosa sbagliata. Tre automazioni che partono davvero valgono più di un
 * editor che fa tutto e resta vuoto.
 *
 * Ogni automazione qui dentro ha tre cose che la rendono onesta:
 *
 * - **si vede quante persone toccherebbe oggi, prima di accenderla.** È la
 *   protezione vera: il numero si legge prima, non dopo l'invio;
 * - **una finestra stretta invece di «tutti quelli che...»**. «Chi non torna
 *   da sessanta giorni» preso alla lettera, il primo giorno, scriverebbe a
 *   mezza rubrica. Qui si guarda solo chi ha *appena* superato la soglia, in
 *   una finestra di pochi giorni: all'accensione non parte nessun diluvio, e
 *   se un giorno il lavoro pianificato non gira, nessuno viene saltato;
 * - **un solo numero regolabile**, quello che conta. Il resto sono decisioni
 *   già prese, e sono scritte qui.
 *
 * Cosa **non** c'è, e perché: automazioni su coupon, Wi-Fi e ordini (non
 * esistono quei dati), e la risposta automatica a un voto basso — a chi è
 * uscito insoddisfatto deve scrivere una persona, e la notifica immediata c'è
 * già (vedi server/surveys.ts).
 */

export const AUTOMATION_KEYS = ["compleanno", "non_torna", "invito_ritorno"] as const;
export type AutomationKey = (typeof AUTOMATION_KEYS)[number];

/**
 * Quanti giorni di silenzio dopo un nostro qualunque messaggio.
 *
 * Senza questa regola un ospite che ieri ha ricevuto «com'è andata?» oggi si
 * troverebbe l'invito a tornare: due email in due giorni dallo stesso
 * ristorante, ed è così che si finisce fra lo spam. Vale per tutte le
 * automazioni, e non è regolabile.
 */
export const SILENZIO_GIORNI = 3;

/** Quanti messaggi al massimo per esecuzione: il resto va al giorno dopo. */
export const TETTO_PER_ESECUZIONE = 50;

export type AutomationRecipient = {
  guestId: string;
  firstName: string;
  email: string;
  /** Perché questa persona è in elenco: compare nell'anteprima. */
  reason: string;
};

export type AutomationConditions = {
  /** Giorni prima del compleanno / di silenzio / dalla visita, secondo l'automazione. */
  giorni?: number;
};

/**
 * L'omaggio che un'automazione può portarsi dietro.
 *
 * **Un codice per persona, non uno condiviso.** Un omaggio di compleanno con
 * un codice unico per tutti si gira agli amici e diventa uno sconto generico
 * che il locale non ha deciso: il coupon nasce intestato a quella persona
 * (`Coupon.guestId`), vale una volta e scade.
 *
 * Nasce assente: un'automazione che regala qualcosa senza che nessuno l'abbia
 * chiesto è il modo più rapido di far perdere soldi a un ristorante.
 */
export type AutomationCoupon = {
  kind: "PERCENT" | "FIXED" | "FREE_ITEM" | "MENU_OFFER";
  /** Percentuale o centesimi, secondo il tipo. */
  value?: number;
  freeItem?: string | null;
  /** Per quanti giorni vale, da quando parte il messaggio. */
  giorniValidita: number;
};

export type AutomationActions = {
  subject: string;
  /** Il paragrafo scritto dal locale, dentro il nostro modello. */
  intro: string;
  /** L'omaggio, se il locale ne ha messo uno. */
  coupon?: AutomationCoupon | null;
};

export type AutomationDefinition = {
  key: AutomationKey;
  trigger: AutomationTrigger;
  name: string;
  /** Cosa fa, in una riga. */
  promise: string;
  /** Perché conviene tenerla accesa. */
  why: string;
  knob: { label: string; hint: string; min: number; max: number; default: number };
  defaults: AutomationActions;
  /** Ogni quanti giorni la stessa persona può ricevere questa automazione. */
  cooldownDays: number;
  /** La categoria con cui nasce il coupon di questa automazione. */
  couponCategory: "BIRTHDAY" | "WINBACK" | "NEW_CUSTOMER";
  audience(venueId: string, giorni: number, now: Date): Promise<AutomationRecipient[]>;
};

/* -------------------------------------------------------------------------- */
/*  Aiuti                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Il giorno e il mese di una data, come `"09-12"`.
 *
 * Un compleanno è una data pura: chi è nato il 12 settembre è nato il 12
 * settembre in qualunque fuso. Si leggono le parti UTC, perché convertire nel
 * fuso del locale sposterebbe la data di un giorno per chi è a est di
 * Greenwich.
 */
export function giornoMese(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function piuGiorni(d: Date, giorni: number): Date {
  return new Date(d.getTime() + giorni * 86_400_000);
}

/**
 * Quanti giorni di tolleranza sulla data esatta.
 *
 * Il lavoro pianificato gira una volta al giorno: se un giorno salta, senza
 * tolleranza gli auguri di quella persona non partono più (l'anno prossimo,
 * forse). Con due giorni di tolleranza si recuperano, e il divieto di
 * ripetizione impedisce che partano tre volte.
 */
const TOLLERANZA_GIORNI = 2;

/** La finestra di chi ha «appena» superato una soglia di giorni. */
const FINESTRA_GIORNI = 7;

const SELEZIONE_OSPITE = { id: true, firstName: true, email: true } as const;

/** I vincoli che non si negoziano: un contatto valido e il consenso. */
const RAGGIUNGIBILE = { marketingOptIn: true, email: { not: null } } as const;

function giorniFa(riferimento: Date, quanti: number): string {
  if (quanti <= 0) return "oggi";
  if (quanti === 1) return "ieri";
  return `${quanti} giorni fa`;
}

function giorniDiCalendario(da: Date, a: Date): number {
  const g = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((g(a) - g(da)) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/*  Il catalogo                                                               */
/* -------------------------------------------------------------------------- */

export const AUTOMATIONS: Record<AutomationKey, AutomationDefinition> = {
  compleanno: {
    key: "compleanno",
    trigger: "GUEST_BIRTHDAY",
    name: "Auguri di compleanno",
    promise: "Scrive a chi compie gli anni fra qualche giorno, in tempo per prenotare.",
    why: "Una cena di compleanno si decide con qualche giorno di anticipo: gli auguri il giorno stesso arrivano quando il tavolo è già stato prenotato da qualcun altro.",
    knob: {
      label: "Quanti giorni prima",
      hint: "Tre giorni sono il compromesso: c'è ancora tempo per decidere, e non è troppo presto per ricordarselo.",
      min: 1,
      max: 21,
      default: 3,
    },
    defaults: {
      subject: "Tanti auguri!",
      intro:
        "Il tuo compleanno si avvicina e ci farebbe piacere festeggiarlo con te. Se vuoi, teniamo da parte il tavolo che preferisci.",
    },
    cooldownDays: 300,
    couponCategory: "BIRTHDAY",
    async audience(venueId, giorni, now) {
      // Le date di nascita non si filtrano in una query portabile (servirebbe
      // EXTRACT su mese e giorno): si prendono gli ospiti con una data di
      // nascita e si confronta qui. Sono centinaia per locale, non milioni.
      const attesi = new Set(
        Array.from({ length: TOLLERANZA_GIORNI + 1 }, (_, i) => giornoMese(piuGiorni(now, giorni - i)))
      );
      const ospiti = await db.guest.findMany({
        where: { venueId, ...RAGGIUNGIBILE, birthday: { not: null } },
        select: { ...SELEZIONE_OSPITE, birthday: true },
      });
      return ospiti
        .filter((g) => g.birthday && attesi.has(giornoMese(g.birthday)))
        .map((g) => ({
          guestId: g.id,
          firstName: g.firstName,
          email: g.email!,
          reason: `compie gli anni il ${new Intl.DateTimeFormat("it-IT", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }).format(g.birthday!)}`,
        }));
    },
  },

  non_torna: {
    key: "non_torna",
    trigger: "GUEST_INACTIVE",
    name: "Chi non torna da un po'",
    promise: "Scrive a chi veniva e ha smesso, appena supera i giorni di silenzio che decidi tu.",
    why: "Far tornare un cliente che c'era già costa molto meno che trovarne uno nuovo, e chi ha smesso di venire quasi mai l'ha deciso: si è solo perso di vista.",
    knob: {
      label: "Dopo quanti giorni di silenzio",
      hint: `Sessanta giorni è la soglia con cui la scheda ospite lo segna «a rischio»: sopra i ${TAG_RULES.inactiveDays} è già un cliente perso, e il messaggio suona fuori tempo.`,
      min: 30,
      max: 180,
      default: TAG_RULES.atRiskDays,
    },
    defaults: {
      subject: "Ci manchi",
      intro:
        "È passato un po' dall'ultima volta che ci siamo visti. Se ti va di tornare, siamo qui: basta un messaggio e ti troviamo posto.",
    },
    cooldownDays: 365,
    couponCategory: "WINBACK",
    async audience(venueId, giorni, now) {
      // Solo chi ha **appena** superato la soglia. «Tutti quelli che non
      // vengono da sessanta giorni», il primo giorno, sarebbe mezza rubrica.
      const soglia = piuGiorni(now, -giorni);
      const inizioFinestra = piuGiorni(soglia, -FINESTRA_GIORNI);
      const ospiti = await db.guest.findMany({
        where: {
          venueId,
          ...RAGGIUNGIBILE,
          totalVisits: { gt: 0 },
          lastVisitAt: { lte: soglia, gt: inizioFinestra },
        },
        select: { ...SELEZIONE_OSPITE, lastVisitAt: true },
      });
      return ospiti.map((g) => ({
        guestId: g.id,
        firstName: g.firstName,
        email: g.email!,
        reason: `ultima visita ${giorniFa(now, giorniDiCalendario(g.lastVisitAt!, now))}`,
      }));
    },
  },

  invito_ritorno: {
    key: "invito_ritorno",
    trigger: "BOOKING_COMPLETED",
    name: "Invito a tornare, dopo la prima volta",
    promise: "Scrive a chi è venuto una volta sola e non ha ancora un tavolo prenotato.",
    why: "La seconda visita è quella che trasforma un passante in un cliente. Chi è già tornato o ha già prenotato non riceve niente: sarebbe un promemoria di una cosa che ha già deciso.",
    knob: {
      label: "Quanti giorni dopo la visita",
      hint: "Sette giorni lasciano passare la richiesta di parere del giorno dopo: due email in due giorni dallo stesso ristorante sono troppe.",
      min: 4,
      max: 60,
      default: 7,
    },
    defaults: {
      subject: "La seconda volta è ancora meglio",
      intro:
        "Ci ha fatto piacere averti con noi. Se ti è piaciuto, la prossima volta ci organizziamo meglio: dicci quando vieni e ti teniamo il tavolo.",
    },
    cooldownDays: 365,
    couponCategory: "NEW_CUSTOMER",
    async audience(venueId, giorni, now) {
      const fine = piuGiorni(now, -giorni);
      const inizio = piuGiorni(fine, -FINESTRA_GIORNI);
      const prenotazioni = await db.booking.findMany({
        where: {
          venueId,
          status: "COMPLETED",
          deletedAt: null,
          closedAt: { lte: fine, gt: inizio },
          guest: {
            ...RAGGIUNGIBILE,
            // Una visita sola: chi è già tornato non va invitato a tornare.
            totalVisits: 1,
            // E chi ha già un tavolo prenotato nemmeno.
            bookings: { none: { startsAt: { gte: now }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } },
          },
        },
        select: { closedAt: true, guest: { select: SELEZIONE_OSPITE } },
        orderBy: { closedAt: "asc" },
      });

      const visti = new Set<string>();
      const destinatari: AutomationRecipient[] = [];
      for (const b of prenotazioni) {
        if (!b.guest?.email || visti.has(b.guest.id)) continue;
        visti.add(b.guest.id);
        destinatari.push({
          guestId: b.guest.id,
          firstName: b.guest.firstName,
          email: b.guest.email,
          reason: `prima visita ${giorniFa(now, giorniDiCalendario(b.closedAt!, now))}`,
        });
      }
      return destinatari;
    },
  },
};

export function automationList(): AutomationDefinition[] {
  return AUTOMATION_KEYS.map((k) => AUTOMATIONS[k]);
}

export function isAutomationKey(value: string): value is AutomationKey {
  return (AUTOMATION_KEYS as readonly string[]).includes(value);
}

/** Il tipo di messaggio che questa automazione scrive nel registro. */
export function automationKind(key: AutomationKey): string {
  return `automation.${key}`;
}
