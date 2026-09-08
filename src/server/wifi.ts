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
  /** Il coupon che parte da solo a chi si collega. */
  couponEnabled: z.boolean().optional(),
  couponPercent: z.coerce.number().int().min(1).max(100).optional(),
  couponDays: z.coerce.number().int().min(1).max(365).optional(),
});

export class WifiError extends Error {
  constructor(public code: "not_found" | "not_configured" | "no_contact") {
    super(code);
  }
}

/**
 * Salva la configurazione e segna quando il portale è stato acceso.
 *
 * `wifiSetupAt` si scrive alla prima configurazione **completa** — nome della
 * rete e password — perché è quella che rende la pagina pubblica utile. Fino a
 * lì il portale resta chiuso, e in Impostazioni c'è scritto cosa manca.
 */
export async function setPortale(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = PortaleInput.parse(raw);

  const prima = await db.venue.findUnique({
    where: { id: venueId },
    select: { wifiSetupAt: true, wifiNetworkName: true, wifiPassword: true },
  });
  if (!prima) throw new WifiError("not_found");

  const networkName = data.networkName?.trim() || null;
  const password = data.password?.trim() || null;
  const completo = !!networkName && !!password;

  const venue = await db.venue.update({
    where: { id: venueId },
    data: {
      wifiNetworkName: networkName,
      // Sotto chiave: nel database non finisce più il testo leggibile.
      wifiPassword: cifra(password),
      wifiPortalWelcome: data.welcome?.trim() || null,
      wifiPortalLegal: data.legal?.trim() || null,
      wifiPortalAccent: data.accent?.trim() || null,
      wifiRedirectUrl: data.redirectUrl?.trim() || null,
      ...(data.couponEnabled != null ? { wifiAutoCouponEnabled: data.couponEnabled } : {}),
      ...(data.couponPercent != null ? { wifiAutoCouponPercent: data.couponPercent } : {}),
      ...(data.couponDays != null ? { wifiAutoCouponDays: data.couponDays } : {}),
      // Acceso la prima volta che è configurato per davvero; se il locale
      // svuota i campi, il portale torna chiuso.
      wifiSetupAt: completo ? (prima.wifiSetupAt ?? new Date()) : null,
    },
  });

  await recordAudit(opts.actor, "venue.wifi_update", "venue", venueId, {
    rete: venue.wifiNetworkName,
    couponAutomatico: venue.wifiAutoCouponEnabled,
    percentuale: venue.wifiAutoCouponPercent,
    giorni: venue.wifiAutoCouponDays,
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
  };
}

/* -------------------------------------------------------------------------- */
/*  L'iscrizione                                                              */
/* -------------------------------------------------------------------------- */

export const WifiSignupInput = z
  .object({
    name: z.string().trim().min(2, "Scrivi il tuo nome").max(120),
    email: z.string().trim().email("Questa email non sembra valida").max(200).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    /** Le note legali vanno accettate: senza, non si raccoglie niente. */
    consentPrivacy: z.literal(true, {
      errorMap: () => ({ message: "Serve accettare l'informativa per collegarsi" }),
    }),
    consentMarketing: z.boolean().optional().default(false),
  })
  .refine((d) => !!d.email?.trim() || !!d.phone?.trim(), {
    message: "Lascia un'email o un numero di telefono",
    path: ["email"],
  });

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
  const data = WifiSignupInput.parse(raw);

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
    },
  });
  if (!venue) throw new WifiError("not_found");
  if (!venue.wifiSetupAt || !venue.wifiNetworkName || !venue.wifiPassword) {
    throw new WifiError("not_configured");
  }

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
        consentMarketing: data.consentMarketing,
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
        {
          venueId: venue.id,
          guestId,
          leadId: lead.id,
          channel: "MARKETING_GENERAL",
          granted: data.consentMarketing,
          source: "WIFI_PORTAL",
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      ],
    });

    // Il consenso si accende, non si spegne: vedi il commento sopra.
    if (data.consentMarketing) {
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
      body: data.consentMarketing
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

  const [contatti, conMarketing, ultimi30, conPrenotazione, couponEmessi, couponUsati] = await Promise.all([
    db.wifiLead.count({ where: { venueId } }),
    db.wifiLead.count({ where: { venueId, consentMarketing: true } }),
    db.wifiLead.count({ where: { venueId, createdAt: { gte: trentaGiorni } } }),
    db.wifiLead.count({ where: { venueId, Guest: { bookings: { some: { deletedAt: null } } } } }),
    db.coupon.count({ where: { venueId, category: "WIFI" } }),
    db.couponRedemption.count({ where: { venueId, deletedAt: null, Coupon: { category: "WIFI" } } }),
  ]);

  return { contatti, conMarketing, ultimi30, conPrenotazione, couponEmessi, couponUsati };
}
