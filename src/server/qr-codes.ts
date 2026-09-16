import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidUrl, normalizeUrl } from "@/lib/url-utils";
import { urlPagamento } from "@/lib/pay-token";
import {
  CORNICI,
  DESIGN_PREDEFINITO,
  POSIZIONI_LOGO,
  STILI_ANGOLI,
  STILI_MODULI,
  type DesignQr,
} from "@/lib/qr-disegno";
import { contenutoQr, linkQr, type PayloadQr } from "@/lib/qr-contenuto";
import { controllaQr, qrSalvabile } from "@/lib/qr-validazione";
import { TIPI_QR, type TipoQr } from "@/lib/qr-tipi";

/**
 * I QR code del locale: crearli, leggerli, cambiarli.
 *
 * La cosa da tenere a mente qui è **dove sta la destinazione**, perché non è
 * sempre nello stesso posto e non è un dettaglio di implementazione:
 *
 *  - menu, prenotazione e link personalizzati **hanno** un indirizzo, e si
 *    salva. Un QR stampato deve puntare per sempre dove puntava il giorno in
 *    cui è uscito dalla stampante, quindi si congela l'indirizzo com'era —
 *    origine compresa;
 *  - il pagamento al tavolo **no**: lì l'indirizzo contiene il segreto del
 *    tavolo, e quel segreto si può revocare. Salvarlo qui vorrebbe dire avere
 *    due copie che il giorno della rigenerazione smettono di coincidere, e la
 *    copia sbagliata sarebbe quella che l'interfaccia mostra;
 *  - il Wi-Fi non ha un indirizzo affatto: ha una rete e una password, e la
 *    riga che il telefono legge la compone `lib/qr-contenuto.ts`.
 */

/* -------------------------------------------------------------------------- */
/*  Che cosa si accetta                                                       */
/* -------------------------------------------------------------------------- */

const ESADECIMALE = /^#[0-9a-fA-F]{6}$/;
const colore = z.string().regex(ESADECIMALE, "Colore non valido");

const DesignInput = z.object({
  coloreQr: colore,
  coloreSfondo: colore,
  /* Facoltativo, e non per gentilezza: i codici salvati prima che la
     trasparenza esistesse non hanno questo campo, e `designSalvato` li legge
     con `.partial()` — senza il valore predefinito diventerebbero
     `undefined`, che `componiQr` legge come «non trasparente» solo per
     fortuna. Dirlo qui lo rende una scelta. */
  sfondoTrasparente: z.boolean().default(false),
  stileModuli: z.enum(STILI_MODULI),
  stileAngoli: z.enum(STILI_ANGOLI),
  logoUrl: z.string().max(2000).nullable(),
  posizioneLogo: z.enum(POSIZIONI_LOGO),
  cornice: z.enum(CORNICI),
  testoCornice: z.string().max(120),
});

const PayloadInput = z.object({
  wifi: z
    .object({
      ssid: z.string().min(1).max(64),
      password: z.string().max(128),
      sicurezza: z.enum(["WPA", "WPA3", "NONE"]),
      nascosta: z.boolean(),
    })
    .optional(),
  custom: z
    .object({
      modo: z.enum(["url", "testo"]),
      valore: z.string().max(1500),
    })
    .optional(),
});

export const QrCodeInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  kind: z.enum(TIPI_QR),
  /** Un QR per tavolo: chi ne sceglie dieci ne crea dieci, tutti uguali. */
  tableIds: z.array(z.string()).max(200).optional(),
  destinationUrl: z.string().max(2000).optional(),
  design: DesignInput.optional(),
  payload: PayloadInput.optional(),
  isActive: z.boolean().optional(),
});
export type QrCodeInputType = z.infer<typeof QrCodeInput>;

/**
 * Un errore che l'interfaccia può **mostrare**.
 *
 * Senza un codice, `apiErrorResponse` non sa che farsene e risponde «qualcosa
 * è andato storto»: per «il pagamento non è acceso sul tavolo 12» sarebbe la
 * differenza fra sapere cosa fare e riprovare a caso.
 */
function rifiuta(messaggio: string): never {
  const e = new Error(messaggio) as Error & { code: string };
  e.code = "validation_failed";
  throw e;
}

/**
 * L'etichetta storica, tenuta in riga col tipo.
 *
 * `category` non decide più niente (vedi la nota nello schema): si scrive
 * perché la colonna c'è, non perché serva a qualcuno.
 */
function categoriaDi(kind: TipoQr) {
  switch (kind) {
    case "MENU":
      return "MENU" as const;
    case "BOOKING":
      return "BOOKING" as const;
    default:
      return "OTHER" as const;
  }
}

/** Quando la destinazione si salva, e quando invece si ricava ogni volta. */
function urlDaSalvare(input: QrCodeInputType): string | null {
  if (input.kind === "PAY_TABLE" || input.kind === "WIFI") return null;
  if (input.kind === "CUSTOM" && input.payload?.custom?.modo === "testo") return null;
  const grezzo = (input.destinationUrl ?? "").trim();
  if (!grezzo) return null;
  const normalizzato = normalizeUrl(grezzo);
  if (!isValidUrl(normalizzato)) rifiuta("L'indirizzo inserito non è valido.");
  return normalizzato;
}

/**
 * Il controllo che sta anche qui, e non solo nell'editor.
 *
 * L'editor lo fa per poterlo **dire** mentre si sceglie; questo lo fa perché
 * l'editor non è l'unico modo di arrivare a questa funzione. Un QR illeggibile
 * salvato da una richiesta costruita a mano finirebbe comunque su un tavolo.
 */
function verificaLeggibilita(design: DesignQr, contenuto: string) {
  const avvisi = controllaQr({ design, contenuto });
  if (!qrSalvabile(avvisi)) {
    const grave = avvisi.find((a) => a.grave);
    rifiuta(grave?.messaggio ?? "Questo QR non sarebbe leggibile.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Leggere                                                                   */
/* -------------------------------------------------------------------------- */

export type QrCodeLetto = {
  id: string;
  name: string;
  description: string | null;
  kind: TipoQr;
  tableId: string | null;
  /** L'etichetta del tavolo, quando ce n'è uno: «Tavolo 12». */
  tavolo: string | null;
  design: DesignQr;
  payload: PayloadQr | null;
  /** Quello che finisce dentro il codice. */
  contenuto: string;
  /** L'indirizzo da aprire e copiare, o `null` per Wi-Fi e testo libero. */
  link: string | null;
  isActive: boolean;
  createdAt: Date;
};

/** Il disegno salvato, completato con i valori predefiniti di quello che manca. */
export function designSalvato(grezzo: unknown): DesignQr {
  const letto = DesignInput.partial().safeParse(grezzo ?? {});
  return { ...DESIGN_PREDEFINITO, ...(letto.success ? letto.data : {}) };
}

function payloadSalvato(grezzo: unknown): PayloadQr | null {
  const letto = PayloadInput.safeParse(grezzo ?? {});
  if (!letto.success) return null;
  return letto.data.wifi || letto.data.custom ? letto.data : null;
}

type RigaQr = {
  id: string;
  name: string;
  description: string | null;
  destinationUrl: string | null;
  kind: TipoQr;
  tableId: string | null;
  design: unknown;
  payload: unknown;
  isActive: boolean;
  createdAt: Date;
  Table: { label: string; payQrToken: string | null; payQrEnabled: boolean } | null;
};

function leggi(r: RigaQr, origine: string): QrCodeLetto {
  /* Il QR del tavolo ricostruisce il suo indirizzo dal segreto **corrente**:
     se il locale l'ha rigenerato, l'elenco mostra il nuovo, non quello morto. */
  const destinazione =
    r.kind === "PAY_TABLE"
      ? r.Table?.payQrToken
        ? urlPagamento(r.Table.payQrToken, origine)
        : null
      : r.destinationUrl;

  const fonti = { kind: r.kind, destinationUrl: destinazione, payload: payloadSalvato(r.payload) };
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    kind: r.kind,
    tableId: r.tableId,
    tavolo: r.Table?.label ?? null,
    design: designSalvato(r.design),
    payload: fonti.payload,
    contenuto: contenutoQr(fonti),
    link: linkQr(fonti),
    isActive: r.isActive,
    createdAt: r.createdAt,
  };
}

const CON_TAVOLO = Prisma.validator<Prisma.QrCodeInclude>()({
  Table: { select: { label: true, payQrToken: true, payQrEnabled: true } },
});

/** Il Json che Prisma vuole quando il campo va messo a nullo davvero. */
function json(v: unknown) {
  return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

export async function listQrCodes(venueId: string, origine: string): Promise<QrCodeLetto[]> {
  const righe = await db.qrCode.findMany({
    where: { venueId },
    orderBy: { createdAt: "desc" },
    include: CON_TAVOLO,
  });
  return righe.map((r) => leggi(r as RigaQr, origine));
}

export async function getQrCode(venueId: string, id: string, origine: string): Promise<QrCodeLetto | null> {
  const riga = await db.qrCode.findFirst({ where: { id, venueId }, include: CON_TAVOLO });
  return riga ? leggi(riga as RigaQr, origine) : null;
}

/* -------------------------------------------------------------------------- */
/*  Scrivere                                                                  */
/* -------------------------------------------------------------------------- */

export async function createQrCode(venueId: string, raw: unknown, origine: string): Promise<QrCodeLetto[]> {
  const input = QrCodeInput.parse(raw);
  const design = { ...DESIGN_PREDEFINITO, ...(input.design ?? {}) };
  const url = urlDaSalvare(input);

  const comune = {
    venueId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    kind: input.kind,
    category: categoriaDi(input.kind),
    design: json(design),
    payload: json(input.payload),
  };

  if (input.kind === "PAY_TABLE") {
    const scelti = input.tableIds ?? [];
    if (scelti.length === 0) rifiuta("Scegli almeno un tavolo.");
    const tavoli = await tavoliDelLocale(venueId, scelti);

    /* Un tavolo su cui il pagamento non è acceso non ha un segreto, quindi non
       ha un indirizzo: il suo QR nascerebbe vuoto e si scoprirebbe al tavolo.
       Si dice qui quali sono, con il loro nome, invece di crearne uno morto. */
    const spenti = tavoli.filter((t) => !t.payQrEnabled || !t.payQrToken);
    if (spenti.length > 0) {
      const nomi = spenti.map((t) => t.label).join(", ");
      rifiuta(
        `Il pagamento col QR non è ancora acceso su ${spenti.length === 1 ? "questo tavolo" : "questi tavoli"}: ${nomi}.`,
      );
    }

    verificaLeggibilita(design, urlPagamento(tavoli[0].payQrToken!, origine));

    /* Un QR per tavolo, e il nome porta il tavolo con sé: dieci codici
       chiamati tutti «Pagamento tavolo» sono dieci codici che nessuno riesce
       più ad abbinare al legno giusto. */
    const creati = await Promise.all(
      tavoli.map((t) =>
        db.qrCode.create({
          data: {
            ...comune,
            name: tavoli.length > 1 ? `${comune.name} · ${t.label}` : comune.name,
            tableId: t.id,
            destinationUrl: null,
          },
          include: CON_TAVOLO,
        }),
      ),
    );
    return creati.map((r) => leggi(r as RigaQr, origine));
  }

  verificaLeggibilita(design, contenutoQr({ kind: input.kind, destinationUrl: url, payload: input.payload ?? null }));

  const creato = await db.qrCode.create({
    data: { ...comune, destinationUrl: url, tableId: null },
    include: CON_TAVOLO,
  });
  return [leggi(creato as RigaQr, origine)];
}

export async function updateQrCode(
  venueId: string,
  id: string,
  raw: unknown,
  origine: string,
): Promise<QrCodeLetto> {
  const esistente = await db.qrCode.findFirst({ where: { id, venueId }, include: CON_TAVOLO });
  if (!esistente) throw new Error("not_found");

  /* Una modifica può toccare solo il nome, o solo un colore: quello che non
     arriva resta com'era, invece di tornare al valore predefinito. */
  const parziale = QrCodeInput.partial().parse(raw);
  const kind = (parziale.kind ?? (esistente.kind as TipoQr)) as TipoQr;
  const design = { ...designSalvato(esistente.design), ...(parziale.design ?? {}) };
  const payload = parziale.payload ?? payloadSalvato(esistente.payload) ?? undefined;

  const completo: QrCodeInputType = {
    name: parziale.name ?? esistente.name,
    description: parziale.description,
    kind,
    tableIds: parziale.tableIds,
    destinationUrl: parziale.destinationUrl ?? esistente.destinationUrl ?? undefined,
    design,
    payload,
  };

  const url = urlDaSalvare(completo);
  const tableId =
    kind === "PAY_TABLE"
      ? ((parziale.tableIds?.[0] ?? esistente.tableId) || null)
      : null;

  const tavolo =
    kind === "PAY_TABLE" && tableId
      ? await db.table.findFirst({ where: { id: tableId, venueId }, select: { payQrToken: true } })
      : null;

  if (kind === "PAY_TABLE" && !tavolo?.payQrToken) {
    rifiuta("Il pagamento col QR non è acceso su questo tavolo.");
  }
  const contenuto =
    kind === "PAY_TABLE"
      ? urlPagamento(tavolo!.payQrToken!, origine)
      : contenutoQr({ kind, destinationUrl: url, payload: payload ?? null });
  verificaLeggibilita(design, contenuto);

  const aggiornato = await db.qrCode.update({
    where: { id },
    data: {
      name: completo.name.trim(),
      ...(parziale.description !== undefined && { description: parziale.description.trim() || null }),
      kind,
      category: categoriaDi(kind),
      tableId,
      destinationUrl: url,
      design: json(design),
      payload: json(payload),
      ...(parziale.isActive !== undefined && { isActive: parziale.isActive }),
    },
    include: CON_TAVOLO,
  });
  return leggi(aggiornato as RigaQr, origine);
}

export async function deleteQrCode(venueId: string, id: string) {
  const esistente = await db.qrCode.findFirst({ where: { id, venueId } });
  if (!esistente) throw new Error("not_found");
  return db.qrCode.delete({ where: { id } });
}

/** Lo stesso codice, con un nome che dice che è una copia. */
export async function duplicaQrCode(venueId: string, id: string, origine: string): Promise<QrCodeLetto> {
  const esistente = await db.qrCode.findFirst({ where: { id, venueId } });
  if (!esistente) throw new Error("not_found");
  const copia = await db.qrCode.create({
    data: {
      venueId,
      name: `${esistente.name} (copia)`,
      description: esistente.description,
      kind: esistente.kind,
      category: esistente.category,
      tableId: esistente.tableId,
      destinationUrl: esistente.destinationUrl,
      design: json(esistente.design),
      payload: json(esistente.payload),
    },
    include: CON_TAVOLO,
  });
  return leggi(copia as RigaQr, origine);
}

/* -------------------------------------------------------------------------- */
/*  Quello che serve all'editor                                               */
/* -------------------------------------------------------------------------- */

export type TavoloPerQr = {
  id: string;
  label: string;
  /** Il pagamento dal QR è acceso su questo tavolo. */
  pronto: boolean;
};

async function tavoliDelLocale(venueId: string, ids: string[]) {
  return db.table.findMany({
    where: { venueId, active: true, ...(ids.length > 0 ? { id: { in: ids } } : {}) },
    orderBy: { label: "asc" },
    select: { id: true, label: true, payQrToken: true, payQrEnabled: true },
  });
}

export async function tavoliPerQr(venueId: string): Promise<TavoloPerQr[]> {
  const tavoli = await tavoliDelLocale(venueId, []);
  return tavoli.map((t) => ({ id: t.id, label: t.label, pronto: t.payQrEnabled && !!t.payQrToken }));
}

export type ContestoEditor = {
  origine: string;
  slug: string;
  nomeLocale: string;
  logoLocale: string | null;
  tavoli: TavoloPerQr[];
  pagamentiAttivi: boolean;
  /** Chi guarda può accendere il pagamento su un tavolo (`manage_venue`). */
  puoGestireTavoli: boolean;
  ssidLocale: string | null;
};

/**
 * Tutto quello che l'editor deve sapere del locale per compilare da solo.
 *
 * Il logo del marchio, il nome della rete già configurata, i tavoli su cui il
 * pagamento è acceso: sono le tre cose che altrimenti il ristoratore
 * dovrebbe andare a copiare da un'altra pagina e riportare qui a mano — cioè
 * le tre occasioni per sbagliarle.
 */
export async function contestoEditor(
  venue: {
    id: string;
    slug: string;
    name: string;
    brandLogoUrl: string | null;
    qrPaymentsEnabled: boolean;
    wifiNetworkName: string | null;
  },
  origine: string,
  puoGestireTavoli: boolean,
): Promise<ContestoEditor> {
  return {
    origine,
    slug: venue.slug,
    nomeLocale: venue.name,
    logoLocale: venue.brandLogoUrl,
    tavoli: await tavoliPerQr(venue.id),
    pagamentiAttivi: venue.qrPaymentsEnabled,
    puoGestireTavoli,
    ssidLocale: venue.wifiNetworkName,
  };
}
