import QRCode from "qrcode";
import { db } from "@/lib/db";
import { generaPayToken, urlPagamento } from "@/lib/pay-token";
import { cartoncinoQr } from "@/lib/qr-pdf";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Il QR di un tavolo: accenderlo, rigenerarlo, stamparlo.
 *
 * Il codice è **permanente**. Si stampa una volta e resta incollato al legno:
 * è la ragione per cui punta al tavolo e non a un conto, ed è anche la ragione
 * per cui rigenerarlo è un'operazione seria — da quel momento ogni adesivo già
 * stampato smette di funzionare, e un tavolo con un QR morto è un tavolo che
 * chiama il cameriere per pagare.
 */

export type StatoQrTavolo = {
  tableId: string;
  tavolo: string;
  attivo: boolean;
  /** Nullo finché il QR non è mai stato generato. */
  url: string | null;
  rigeneratoIl: Date | null;
  ultimoUtilizzo: Date | null;
  /** Quanti pagamenti sono arrivati da questo QR. */
  pagamenti: number;
  /** Quanto è stato incassato, mance comprese. */
  incassatoCents: number;
  manceCents: number;
};

/** Lo stato del QR di ogni tavolo del locale, per la scheda di configurazione. */
export async function statoQrDeiTavoli(venueId: string): Promise<StatoQrTavolo[]> {
  const [tavoli, incassi] = await Promise.all([
    db.table.findMany({
      where: { venueId },
      orderBy: { label: "asc" },
      select: {
        id: true,
        label: true,
        payQrToken: true,
        payQrEnabled: true,
        payQrRotatedAt: true,
        payQrLastSeenAt: true,
      },
    }),
    // Una sola aggregazione per tutti i tavoli invece di una per riga: la
    // pagina della sala ne mostra anche cinquanta insieme.
    db.payment.groupBy({
      by: ["tableId"],
      where: { venueId, kind: "TABLE_QR", status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, deletedAt: null },
      _sum: { amountCents: true, tipCents: true },
      _count: true,
    }),
  ]);

  const perTavolo = new Map(incassi.map((i) => [i.tableId ?? "", i]));

  return tavoli.map((t) => {
    const i = perTavolo.get(t.id);
    return {
      tableId: t.id,
      tavolo: t.label,
      attivo: t.payQrEnabled && !!t.payQrToken,
      url: t.payQrToken ? urlPagamento(t.payQrToken) : null,
      rigeneratoIl: t.payQrRotatedAt,
      ultimoUtilizzo: t.payQrLastSeenAt,
      pagamenti: i?._count ?? 0,
      incassatoCents: (i?._sum.amountCents ?? 0) - (i?._sum.tipCents ?? 0),
      manceCents: i?._sum.tipCents ?? 0,
    };
  });
}

/**
 * Accende il pagamento al tavolo, generando il segreto se manca.
 *
 * Il token si crea alla prima accensione e **non cambia** spegnendo e
 * riaccendendo: altrimenti sospendere la funzione per una sera vorrebbe dire
 * ristampare tutti i cartoncini il giorno dopo.
 */
export async function accendiQr(
  venueId: string,
  tableId: string,
  attivo: boolean,
  opts: { actor?: AuditActor } = {},
): Promise<StatoQrTavolo> {
  const tavolo = await db.table.findFirstOrThrow({ where: { id: tableId, venueId } });

  const aggiornato = await db.table.update({
    where: { id: tableId },
    data: {
      payQrEnabled: attivo,
      ...(attivo && !tavolo.payQrToken
        ? { payQrToken: generaPayToken(), payQrRotatedAt: new Date() }
        : {}),
    },
  });

  await recordAudit(opts.actor, attivo ? "table.qr_on" : "table.qr_off", "table", tableId, {
    tavolo: tavolo.label,
  });

  return unoSolo(venueId, aggiornato);
}

/**
 * Rigenera il segreto: da adesso il vecchio adesivo non funziona più.
 *
 * Serve quando il QR finisce in una fotografia pubblica, o quando un
 * cartoncino sparisce dal tavolo. Non tocca i pagamenti già ricevuti — quelli
 * restano legati al tavolo, non al token — e i clienti che in questo momento
 * sono sulla pagina vedranno il link scadere: è il prezzo della revoca, ed è
 * il motivo per cui la si chiede due volte nell'interfaccia.
 */
export async function rigeneraQr(
  venueId: string,
  tableId: string,
  opts: { actor?: AuditActor } = {},
): Promise<StatoQrTavolo> {
  const tavolo = await db.table.findFirstOrThrow({ where: { id: tableId, venueId } });
  const aggiornato = await db.table.update({
    where: { id: tableId },
    data: { payQrToken: generaPayToken(), payQrRotatedAt: new Date(), payQrLastSeenAt: null },
  });
  await recordAudit(opts.actor, "table.qr_rotate", "table", tableId, { tavolo: tavolo.label });
  return unoSolo(venueId, aggiornato);
}

async function unoSolo(
  venueId: string,
  t: { id: string; label: string; payQrToken: string | null; payQrEnabled: boolean; payQrRotatedAt: Date | null; payQrLastSeenAt: Date | null },
): Promise<StatoQrTavolo> {
  const i = await db.payment.aggregate({
    where: { venueId, tableId: t.id, kind: "TABLE_QR", status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, deletedAt: null },
    _sum: { amountCents: true, tipCents: true },
    _count: true,
  });
  return {
    tableId: t.id,
    tavolo: t.label,
    attivo: t.payQrEnabled && !!t.payQrToken,
    url: t.payQrToken ? urlPagamento(t.payQrToken) : null,
    rigeneratoIl: t.payQrRotatedAt,
    ultimoUtilizzo: t.payQrLastSeenAt,
    pagamenti: i._count,
    incassatoCents: (i._sum.amountCents ?? 0) - (i._sum.tipCents ?? 0),
    manceCents: i._sum.tipCents ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Stampare                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * La correzione d'errore del codice.
 *
 * `M` ricostruisce fino al 15% del codice danneggiato. Su un cartoncino che
 * vive su un tavolo di ristorante — dove prima o poi finiscono una goccia di
 * sugo e il fondo di un bicchiere — non è un lusso.
 */
const CORREZIONE = "M" as const;

/** Il QR come immagine, per l'anteprima e per «Scarica PNG». */
export async function qrPng(venueId: string, tableId: string, lato = 720): Promise<Buffer> {
  const url = await urlDelTavolo(venueId, tableId);
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: CORREZIONE,
    type: "png",
    width: lato,
    // Quattro moduli di bianco attorno: è il minimo perché un telefono
    // riconosca il codice, e chi incolla il PNG su una locandina non lo sa.
    margin: 4,
    color: { dark: "#13332CFF", light: "#FFFFFFFF" },
  });
}

/** Il cartoncino pronto da stampare. Vedi `lib/qr-pdf.ts`. */
export async function qrPdf(venueId: string, tableId: string): Promise<Buffer> {
  const tavolo = await db.table.findFirstOrThrow({
    where: { id: tableId, venueId },
    select: { label: true, payQrToken: true, venue: { select: { name: true } } },
  });
  if (!tavolo.payQrToken) throw new Error("qr_non_generato");

  const codice = QRCode.create(urlPagamento(tavolo.payQrToken), { errorCorrectionLevel: CORREZIONE });
  return cartoncinoQr({
    moduli: codice.modules as never,
    locale: tavolo.venue.name,
    tavolo: tavolo.label,
    invito: "Inquadra per pagare il conto",
    piede: "Pagamento sicuro · nessuna app da installare",
  });
}

async function urlDelTavolo(venueId: string, tableId: string): Promise<string> {
  const t = await db.table.findFirstOrThrow({
    where: { id: tableId, venueId },
    select: { payQrToken: true },
  });
  if (!t.payQrToken) throw new Error("qr_non_generato");
  return urlPagamento(t.payQrToken);
}
