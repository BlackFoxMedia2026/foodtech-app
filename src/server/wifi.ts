import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { cifra, decifra } from "@/lib/cifratura";
import { recordAudit, type AuditActor } from "./audit";
import { trovaOCreaOspite } from "./guest-match";
import { codiceCasuale } from "./coupons";
import { createNotification } from "./notifications";

/**
 * Il portale Wi-Fi.
 *
 * `WifiLead`, `WifiSession` e otto colonne su `Venue` (testo di benvenuto,
 * note legali, colore, coupon automatico) stavano nello schema senza una riga
 * di codice. Mancava però la cosa per cui una persona compila un modulo: la
 * password della rete.
 *
 * **Tavolo non apre la rete.** Quello lo fa il router del locale, e fingere il
 * contrario sarebbe la bugia più grossa di questo modulo. Quindi lo scambio è
 * dichiarato: la persona lascia un contatto, e in cambio riceve **il nome
 * della rete e la password**. Funziona in ogni locale, senza toccare nessun
 * apparato — e chi ha un router che sa sbloccare la navigazione da un
 * indirizzo può metterlo in `wifiRedirectUrl`.
 *
 * Se il locale non ha configurato il portale, la pagina pubblica **non
 * esiste**: un modulo che raccoglie indirizzi email senza che nessuno abbia
 * deciso cosa dare in cambio è peggio di una pagina mancante.
 *
 * Cosa **non** si scrive, di proposito: `WifiSession`. Una sessione ha un
 * inizio e una fine, e la fine non possiamo vederla — nessuno ci dice quando
 * un telefono si scollega. Righe con `endedAt` sempre vuoto e `durationSec`
 * che nessuno calcola sarebbero esattamente i contatori mai scritti che questo
 * progetto ha passato giorni a togliere dalle pagine. Quando il portale sarà
 * collegato a un router che manda gli eventi, quella tabella avrà un senso.
 */

/* -------------------------------------------------------------------------- */
/*  La configurazione                                                         */
/* -------------------------------------------------------------------------- */

export const PortaleInput = z.object({
  networkName: z.string().trim().max(64).optional().nullable(),
  password: z.string().trim().max(128).optional().nullable(),
  welcome: z.string().trim().max(500).optional().nullable(),
  legal: z.string().trim().max(2000).optional().nullable(),
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Il colore va scritto come #1A2B3C")
    .optional()
    .nullable(),
  redirectUrl: z
    .string()
    .trim()
    .url("Questo indirizzo non sembra valido")
    .max(500)
    .optional()
    .nullable(),
  /** Il logo che il cliente vede in cima al portale. Vuoto: quello del brand. */
  logoUrl: z.string().trim().url("Questo indirizzo non sembra valido").max(500).optional().nullable(),
  /** Il coupon che parte da solo a chi si collega. */
  couponEnabled: z.boolean().optional(),
  couponPercent: z.coerce.number().int().min(1).max(100).optional(),
  couponDays: z.coerce.number().int().min(1).max(365).optional(),
  /** Quali recapiti chiede il modulo. Il nome non è qui: serve sempre. */
  askEmail: z.boolean().optional(),
  askPhone: z.boolean().optional(),
  askMarketing: z.boolean().optional(),
  /**
   * Accendere o spegnere il portale **senza svuotare la configurazione**.
   *
   * Prima l'unico modo di chiuderlo era cancellare il nome della rete, cioè
   * buttare via la configurazione per sospendere il servizio. Assente, non
   * cambia niente: il portale resta acceso se è completo.
   */
  attivo: z.boolean().optional(),
  /**
   * La spunta con cui il locale dichiara di aver collegato il portale al
   * router. Non è un rilevamento — vedi il campo nello schema.
   */
  routerCollegato: z.boolean().optional(),
});

export class WifiError extends Error {
  constructor(public code: "not_found" | "not_configured" | "no_contact" | "no_field") {
    super(code);
  }
}

/**
 * Salva la configurazione e segna quando il portale è stato acceso.
 *
 * `wifiSetupAt` si scrive alla prima configurazione **completa** — nome della
 * rete e password — perché è quella che rende la pagina pubblica utile. Fino a
 * lì il portale resta chiuso, e in Impostazioni c'è scritto cosa manca.
 *
 * Da settembre 2026 c'è anche un modo di **sospenderlo senza disfarlo**:
 * `attivo: false` spegne la pagina pubblica lasciando la configurazione dove
 * sta. Prima l'unica maniera era cancellare il nome della rete, cioè buttare
 * via mezz'ora di lavoro per chiudere il portale una settimana.
 *
 * ## Un campo che non arriva non viene toccato
 *
 * Finché il salvataggio era un modulo unico, la richiesta portava sempre tutto
 * e «assente» poteva significare «vuotalo». Adesso non è più vero: dal
 * pannello partono richieste da un campo solo — sospendi, riattiva, spunta il
 * router — e con la vecchia regola un interruttore avrebbe cancellato il nome
 * della rete e la password. Quindi `undefined` significa **non toccare** e
 * `null` significa **svuota**, per ogni campo.
 */
export async function setPortale(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = PortaleInput.parse(raw);

  const prima = await db.venue.findUnique({
    where: { id: venueId },
    select: {
      wifiSetupAt: true,
      wifiNetworkName: true,
      wifiPassword: true,
      wifiAskEmail: true,
      wifiAskPhone: true,
      wifiRouterConfirmedAt: true,
    },
  });
  if (!prima) throw new WifiError("not_found");

  const networkName = data.networkName !== undefined ? data.networkName?.trim() || null : prima.wifiNetworkName;
  // La password si confronta **cifrata**: quella in chiaro qui non c'è, e non
  // serve — l'unica domanda è se ce n'è una.
  const password =
    data.password !== undefined ? (data.password?.trim() ? cifra(data.password.trim()) : null) : prima.wifiPassword;
  const completo = !!networkName && !!password;

  // I due interruttori si controllano **sul risultato**, non su ciò che è
  // arrivato: una chiamata che spegne solo l'email può lasciare il modulo
  // senza nessun recapito, e quel modulo raccoglie nomi che non servono a
  // nessuno.
  const askEmail = data.askEmail ?? prima.wifiAskEmail;
  const askPhone = data.askPhone ?? prima.wifiAskPhone;
  if (!askEmail && !askPhone) throw new WifiError("no_field");

  const venue = await db.venue.update({
    where: { id: venueId },
    data: {
      wifiNetworkName: networkName,
      // Sotto chiave: nel database non finisce più il testo leggibile.
      wifiPassword: password,
      ...(data.welcome !== undefined ? { wifiPortalWelcome: data.welcome?.trim() || null } : {}),
      ...(data.legal !== undefined ? { wifiPortalLegal: data.legal?.trim() || null } : {}),
      ...(data.accent !== undefined ? { wifiPortalAccent: data.accent?.trim() || null } : {}),
      ...(data.redirectUrl !== undefined ? { wifiRedirectUrl: data.redirectUrl?.trim() || null } : {}),
      ...(data.logoUrl !== undefined ? { wifiPortalLogoUrl: data.logoUrl?.trim() || null } : {}),
      ...(data.couponEnabled != null ? { wifiAutoCouponEnabled: data.couponEnabled } : {}),
      ...(data.couponPercent != null ? { wifiAutoCouponPercent: data.couponPercent } : {}),
      ...(data.couponDays != null ? { wifiAutoCouponDays: data.couponDays } : {}),
      wifiAskEmail: askEmail,
      wifiAskPhone: askPhone,
      ...(data.askMarketing != null ? { wifiAskMarketing: data.askMarketing } : {}),
      // La spunta del router: la data è quella in cui qualcuno l'ha messa, e
      // togliendola torna a «da verificare».
      ...(data.routerCollegato != null
        ? {
            wifiRouterConfirmedAt: data.routerCollegato
              ? (prima.wifiRouterConfirmedAt ?? new Date())
              : null,
          }
        : {}),
      // Acceso la prima volta che è configurato per davvero; se il locale
      // svuota i campi, il portale torna chiuso. E `attivo: false` lo sospende
      // senza toccare niente di ciò che è stato scritto.
      wifiSetupAt: completo && data.attivo !== false ? (prima.wifiSetupAt ?? new Date()) : null,
    },
  });

  await recordAudit(opts.actor, "venue.wifi_update", "venue", venueId, {
    rete: venue.wifiNetworkName,
    couponAutomatico: venue.wifiAutoCouponEnabled,
    percentuale: venue.wifiAutoCouponPercent,
    giorni: venue.wifiAutoCouponDays,
    campi: [venue.wifiAskEmail && "email", venue.wifiAskPhone && "telefono"].filter(Boolean),
    attivo: venue.wifiSetupAt != null,
  });
  return venue;
}

export type PortaleConfig = {
  venueId: string;
  venueName: string;
  slug: string;
  logoUrl: string | null;
  accent: string | null;
  welcome: string | null;
  legal: string | null;
  networkName: string;
  redirectUrl: string | null;
  /** Vero se chi si collega riceve anche uno sconto. */
  conCoupon: boolean;
  couponPercent: number;
  couponDays: number;
  /** Quali recapiti chiede il modulo. Il nome si chiede sempre. */
  chiediEmail: boolean;
  chiediTelefono: boolean;
  /** Se la spunta facoltativa del marketing compare. */
  chiediMarketing: boolean;
};

/**
 * La configurazione che serve alla pagina pubblica.
 *
 * **La password non torna qui**: la pagina la mostra solo dopo che qualcuno ha
 * lasciato il contatto, quindi non deve arrivare al browser prima. Sarebbe
 * bastato aprire gli strumenti da sviluppatore per leggerla senza compilare
 * niente — e allora tanto valeva scriverla sul menu.
 */
export async function getPortale(slug: string): Promise<PortaleConfig | null> {
  const venue = await db.venue.findFirst({
    where: { slug, active: true, wifiSetupAt: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      brandLogoUrl: true,
      wifiPortalLogoUrl: true,
      wifiPortalAccent: true,
      wifiPortalWelcome: true,
      wifiPortalLegal: true,
      wifiNetworkName: true,
      wifiRedirectUrl: true,
      wifiAutoCouponEnabled: true,
      wifiAutoCouponPercent: true,
      wifiAutoCouponDays: true,
      wifiAskEmail: true,
      wifiAskPhone: true,
      wifiAskMarketing: true,
    },
  });
  if (!venue || !venue.wifiNetworkName) return null;

  return {
    venueId: venue.id,
    venueName: venue.name,
    slug: venue.slug,
    logoUrl: venue.wifiPortalLogoUrl ?? venue.brandLogoUrl,
    accent: venue.wifiPortalAccent,
    welcome: venue.wifiPortalWelcome,
    legal: venue.wifiPortalLegal,
    networkName: venue.wifiNetworkName,
    redirectUrl: venue.wifiRedirectUrl,
    conCoupon: venue.wifiAutoCouponEnabled,
    couponPercent: venue.wifiAutoCouponPercent,
    couponDays: venue.wifiAutoCouponDays,
    chiediEmail: venue.wifiAskEmail,
    chiediTelefono: venue.wifiAskPhone,
    chiediMarketing: venue.wifiAskMarketing,
  };
}

/* -------------------------------------------------------------------------- */
/*  L'iscrizione                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Il modulo pubblico, validato **secondo ciò che quel locale chiede davvero**.
 *
 * Il recapito richiesto non è più un'unica regola per tutti: un locale che ha
 * spento l'email deve sentirsi dire «Lascia un numero di telefono», non
 * «Lascia un'email o un numero» per un campo che sul suo portale non esiste.
 * Chi è qui ha il telefono in mano e sta in piedi: l'errore deve nominare il
 * campo che ha davanti.
 */
export function schemaIscrizione(campi: { chiediEmail: boolean; chiediTelefono: boolean }) {
  const richieste = [campi.chiediEmail && "un'email", campi.chiediTelefono && "un numero di telefono"]
    .filter(Boolean)
    .join(" o ");

  return z
    .object({
      name: z.string().trim().min(2, "Scrivi il tuo nome").max(120),
      email: z
        .string()
        .trim()
        .email("Questa email non sembra valida")
        .max(200)
        .optional()
        .nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      /** Le note legali vanno accettate: senza, non si raccoglie niente. */
      consentPrivacy: z.literal(true, {
        errorMap: () => ({ message: "Serve accettare l'informativa per collegarsi" }),
      }),
      consentMarketing: z.boolean().optional().default(false),
    })
    // Un campo spento non si legge nemmeno se arriva: chi manomette il modulo
    // non deve poter scrivere nel CRM un dato che il locale ha deciso di non
    // raccogliere.
    .transform((d) => ({
      ...d,
      email: campi.chiediEmail ? d.email : null,
      phone: campi.chiediTelefono ? d.phone : null,
    }))
    .refine((d) => !!d.email?.trim() || !!d.phone?.trim(), {
      message: `Lascia ${richieste}`,
      path: [campi.chiediEmail ? "email" : "phone"],
    });
}

/** Il modulo completo: è quello che vede chi non ha toccato niente. */
export const WifiSignupInput = schemaIscrizione({ chiediEmail: true, chiediTelefono: true });

export type WifiSignupResult = {
  networkName: string;
  password: string;
  redirectUrl: string | null;
  /** Il codice dello sconto, se il locale ne regala uno. */
  coupon: { code: string; percent: number; validUntil: Date } | null;
  /** Vero se questa persona era già nel CRM del locale. */
  giaConosciuto: boolean;
};

/** Un codice sconto per chi si collega, creato dentro la transazione. */
async function couponWifi(
  tx: Prisma.TransactionClient,
  args: { venueId: string; guestId: string; percent: number; days: number },
): Promise<{ code: string; percent: number; validUntil: Date }> {
  const validUntil = new Date(Date.now() + args.days * 86_400_000);

  // Se questa persona ha già un coupon Wi-Fi valido e non usato, si riusa: due
  // codici per la stessa promessa sono uno sconto doppio, ed è la stessa
  // regola degli omaggi automatici.
  const gia = await tx.coupon.findFirst({
    where: {
      venueId: args.venueId,
      guestId: args.guestId,
      category: "WIFI",
      status: "ACTIVE",
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      CouponRedemption: { none: { deletedAt: null } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (gia) return { code: gia.code, percent: gia.value, validUntil: gia.validUntil ?? validUntil };

  for (let tentativo = 0; tentativo < 20; tentativo++) {
    const code = `WIFI-${codiceCasuale(6)}`;
    const preso = await tx.coupon.findUnique({ where: { code }, select: { id: true } });
    if (preso) continue;
    const creato = await tx.coupon.create({
      data: {
        venueId: args.venueId,
        guestId: args.guestId,
        code,
        name: `Sconto Wi-Fi ${args.percent}%`,
        description: "Sconto per chi si è collegato alla rete del locale.",
        kind: "PERCENT",
        value: args.percent,
        category: "WIFI",
        status: "ACTIVE",
        maxRedemptions: 1,
        maxPerGuest: 1,
        validUntil,
      },
    });
    return { code: creato.code, percent: creato.value, validUntil };
  }
  throw new Error("coupon_code_unavailable");
}

/**
 * Registra chi si collega e restituisce la password.
 *
 * Tutto in una transazione: il contatto, il consenso registrato e — se il
 * locale ne regala uno — il codice sconto. La password si mostra solo dopo che
 * questa scrittura è andata a buon fine, altrimenti si darebbe accesso alla
 * rete senza aver preso il contatto, che è l'unica cosa che il locale riceve
 * in cambio.
 *
 * Il consenso marketing si registra sempre, sia quando c'è sia quando manca:
 * il valore di un consenso è sapere **quando** e **da dove** è stato dato, e
 * un rifiuto è un'informazione, non un vuoto. Ma un rifiuto qui **non
 * cancella** un consenso dato altrove: chi si è iscritto alla newsletter dal
 * sito non deve trovarsi disiscritto per aver saltato una casella mentre
 * cercava la rete.
 */
export async function registraLead(
  slug: string,
  raw: unknown,
  meta: { ip?: string | null; userAgent?: string | null; source?: string | null } = {},
): Promise<WifiSignupResult> {
  const venue = await db.venue.findFirst({
    where: { slug, active: true },
    select: {
      id: true,
      wifiSetupAt: true,
      wifiNetworkName: true,
      wifiPassword: true,
      wifiRedirectUrl: true,
      wifiAutoCouponEnabled: true,
      wifiAutoCouponPercent: true,
      wifiAutoCouponDays: true,
      wifiAskEmail: true,
      wifiAskPhone: true,
      wifiAskMarketing: true,
    },
  });
  if (!venue) throw new WifiError("not_found");
  if (!venue.wifiSetupAt || !venue.wifiNetworkName || !venue.wifiPassword) {
    throw new WifiError("not_configured");
  }

  // Il modulo si valida **dopo** aver letto il locale: quali recapiti siano
  // obbligatori lo decide chi ha configurato il portale, non questo file.
  const data = schemaIscrizione({
    chiediEmail: venue.wifiAskEmail,
    chiediTelefono: venue.wifiAskPhone,
  }).parse(raw);

  // Un consenso che il portale non chiede non si registra come rifiutato: chi
  // ha spento la spunta non sta raccogliendo dei no, non sta raccogliendo
  // niente.
  const consensoMarketing = venue.wifiAskMarketing ? data.consentMarketing : false;

  const [firstName, ...resto] = data.name.trim().split(/\s+/);
  const lastName = resto.join(" ") || null;

  const esito = await db.$transaction(async (tx) => {
    const { guestId, giaConosciuto } = await trovaOCreaOspite(
      venue.id,
      { firstName, lastName, email: data.email ?? null, phone: data.phone ?? null },
      tx,
    );

    const lead = await tx.wifiLead.create({
      data: {
        venueId: venue.id,
        guestId,
        name: data.name.trim(),
        email: data.email?.trim().toLowerCase() || null,
        phone: data.phone?.trim() || null,
        source: meta.source ?? "PORTAL",
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        consentPrivacy: true,
        consentMarketing: consensoMarketing,
      },
    });

    await tx.consentLog.createMany({
      data: [
        {
          venueId: venue.id,
          guestId,
          leadId: lead.id,
          channel: "PRIVACY",
          granted: true,
          source: "WIFI_PORTAL",
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
        // Il rifiuto si registra, la **domanda non fatta** no: se il locale ha
        // spento la spunta del marketing, scrivere `granted: false` vorrebbe
        // dire mettere agli atti un no che questa persona non ha mai dato.
        ...(venue.wifiAskMarketing
          ? [
              {
                venueId: venue.id,
                guestId,
                leadId: lead.id,
                channel: "MARKETING_GENERAL" as const,
                granted: consensoMarketing,
                source: "WIFI_PORTAL",
                ipAddress: meta.ip ?? null,
                userAgent: meta.userAgent ?? null,
              },
            ]
          : []),
      ],
    });

    // Il consenso si accende, non si spegne: vedi il commento sopra.
    if (consensoMarketing) {
      await tx.guest.update({ where: { id: guestId }, data: { marketingOptIn: true } });
    }

    const coupon = venue.wifiAutoCouponEnabled
      ? await couponWifi(tx, {
          venueId: venue.id,
          guestId,
          percent: venue.wifiAutoCouponPercent,
          days: venue.wifiAutoCouponDays,
        })
      : null;

    return { coupon, giaConosciuto };
  });

  // Solo i contatti **nuovi**: un cliente abituale che si ricollega ogni
  // venerdì non è una notizia, e sei persone dello stesso tavolo che si
  // collegano una dopo l'altra non devono far suonare sei volte la campanella.
  if (!esito.giaConosciuto) {
    await createNotification(venue.id, {
      kind: "WIFI_LEAD",
      title: `${data.name.trim()} si è collegato al Wi-Fi`,
      body: consensoMarketing
        ? "Contatto nuovo, con il consenso a essere ricontattato."
        : "Contatto nuovo, senza consenso al marketing: si può chiamare, non scrivere.",
      link: "/marketing/wifi",
    });
  }

  return {
    networkName: venue.wifiNetworkName,
    // A questo punto `wifiPassword` c'è (controllato sopra, altrimenti il
    // portale è chiuso): quello che può mancare è la **chiave** per
    // rileggerla, e in quel caso `decifra` solleva invece di consegnare al
    // cliente una password sbagliata.
    password: decifra(venue.wifiPassword)!,
    redirectUrl: venue.wifiRedirectUrl,
    coupon: esito.coupon,
    giaConosciuto: esito.giaConosciuto,
  };
}

/* -------------------------------------------------------------------------- */
/*  Chi si è collegato                                                        */
/* -------------------------------------------------------------------------- */

const LEAD_PER_PAGINA = 50;

export type WifiLeadView = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  consentMarketing: boolean;
  createdAt: Date;
  guestId: string | null;
  /** Quante volte questa persona è venuta, secondo le prenotazioni. */
  visite: number;
};

export type ElencoLead = {
  items: WifiLeadView[];
  totale: number;
  pagina: number;
  pagine: number;
  perPagina: number;
};

/**
 * Chi ha lasciato il contatto, dal più recente.
 *
 * Con il totale scritto e le pagine: una lista tagliata a cinquanta senza dire
 * quanti sono in tutto è una bugia per omissione.
 */
export async function listWifiLeads(
  venueId: string,
  opts: { pagina?: number; soloMarketing?: boolean } = {},
): Promise<ElencoLead> {
  const where = {
    venueId,
    ...(opts.soloMarketing ? { consentMarketing: true } : {}),
  };

  const totale = await db.wifiLead.count({ where });
  const pagine = Math.max(1, Math.ceil(totale / LEAD_PER_PAGINA));
  const pagina = Math.min(Math.max(1, Math.floor(opts.pagina ?? 1)), pagine);

  const righe = await db.wifiLead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (pagina - 1) * LEAD_PER_PAGINA,
    take: LEAD_PER_PAGINA,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      consentMarketing: true,
      createdAt: true,
      guestId: true,
      Guest: { select: { _count: { select: { bookings: true } } } },
    },
  });

  return {
    items: righe.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      consentMarketing: r.consentMarketing,
      createdAt: r.createdAt,
      guestId: r.guestId,
      visite: r.Guest?._count.bookings ?? 0,
    })),
    totale,
    pagina,
    pagine,
    perPagina: LEAD_PER_PAGINA,
  };
}

export type WifiStats = {
  contatti: number;
  conMarketing: number;
  ultimi30: number;
  /** Contatti che hanno anche una prenotazione: il portale che porta a tavola. */
  conPrenotazione: number;
  couponEmessi: number;
  couponUsati: number;
  /**
   * L'ultima volta che qualcuno ha compilato il modulo.
   *
   * È il solo segnale che il portale **sta funzionando davvero** — nessuno ci
   * dice se il router lo sta usando, ma una persona che si è collegata
   * dodici minuti fa dice che qualcosa, dall'altra parte, funziona.
   */
  ultimoAccesso: Date | null;
};

/**
 * I numeri del portale.
 *
 * `conPrenotazione` è l'unico che dice se questa cosa serve a qualcosa: un
 * indirizzo email raccolto non è un cliente. E i coupon **usati** stanno
 * accanto a quelli emessi, perché il secondo numero da solo racconta solo
 * quanto abbiamo promesso.
 */
export async function getWifiStats(venueId: string): Promise<WifiStats> {
  const trentaGiorni = new Date(Date.now() - 30 * 86_400_000);

  const [contatti, conMarketing, ultimi30, conPrenotazione, couponEmessi, couponUsati, ultimo] =
    await Promise.all([
      db.wifiLead.count({ where: { venueId } }),
      db.wifiLead.count({ where: { venueId, consentMarketing: true } }),
      db.wifiLead.count({ where: { venueId, createdAt: { gte: trentaGiorni } } }),
      db.wifiLead.count({ where: { venueId, Guest: { bookings: { some: { deletedAt: null } } } } }),
      db.coupon.count({ where: { venueId, category: "WIFI" } }),
      db.couponRedemption.count({ where: { venueId, deletedAt: null, Coupon: { category: "WIFI" } } }),
      db.wifiLead.findFirst({
        where: { venueId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  return {
    contatti,
    conMarketing,
    ultimi30,
    conPrenotazione,
    couponEmessi,
    couponUsati,
    ultimoAccesso: ultimo?.createdAt ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Lo stato, detto per intero                                                */
/* -------------------------------------------------------------------------- */

/**
 * In che stato è il portale di questo locale.
 *
 * Sono tre, e vanno distinti perché chiedono cose diverse a chi legge:
 *
 * - `da_configurare` — non c'è ancora niente: si comincia;
 * - `sospeso` — la configurazione c'è tutta, ma la pagina pubblica è spenta;
 * - `attivo` — la pagina pubblica risponde.
 *
 * Quello che **non** c'è, ed è la cosa più importante di questo tipo, è uno
 * stato «collegato al router»: dal router non arriva nessun segnale. Il
 * collegamento è una dichiarazione del locale (`routerCollegatoIl`), e sta in
 * un campo a parte proprio perché non va confuso con ciò che sappiamo.
 */
export type StatoPortale = {
  stato: "da_configurare" | "sospeso" | "attivo";
  /** Rete e password ci sono entrambe. */
  configurato: boolean;
  networkName: string | null;
  attivoDal: Date | null;
  routerCollegatoIl: Date | null;
};

export function statoPortale(venue: {
  wifiNetworkName: string | null;
  wifiPassword: string | null;
  wifiSetupAt: Date | null;
  wifiRouterConfirmedAt: Date | null;
}): StatoPortale {
  const configurato = !!venue.wifiNetworkName && !!venue.wifiPassword;
  return {
    stato: venue.wifiSetupAt ? "attivo" : configurato ? "sospeso" : "da_configurare",
    configurato,
    networkName: venue.wifiNetworkName,
    attivoDal: venue.wifiSetupAt,
    routerCollegatoIl: venue.wifiRouterConfirmedAt,
  };
}
