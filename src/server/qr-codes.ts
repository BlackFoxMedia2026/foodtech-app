import { z } from "zod";
import { db } from "@/lib/db";
import { isValidUrl, normalizeUrl } from "@/lib/url-utils";
import { superficiPubbliche, type Superficie } from "@/lib/qr-superfici";

export const QrCodeInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  destinationUrl: z
    .string()
    .min(1)
    .transform(normalizeUrl)
    .refine(isValidUrl, { message: "URL non valido" }),
  category: z.enum(["MENU", "BOOKING", "EVENT", "REVIEW", "CAMPAIGN", "SOCIAL", "OTHER"]).optional(),
  isActive: z.boolean().optional(),
});
export type QrCodeInputType = z.infer<typeof QrCodeInput>;

export async function listQrCodes(venueId: string) {
  return db.qrCode.findMany({ where: { venueId }, orderBy: { createdAt: "desc" } });
}

export async function createQrCode(venueId: string, raw: unknown) {
  const data = QrCodeInput.parse(raw);
  return db.qrCode.create({
    data: {
      venueId,
      name: data.name,
      description: data.description,
      destinationUrl: data.destinationUrl,
      category: data.category ?? "OTHER",
    },
  });
}

export async function updateQrCode(venueId: string, id: string, raw: unknown) {
  const data = QrCodeInput.partial().parse(raw);
  const existing = await db.qrCode.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.qrCode.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.destinationUrl !== undefined && { destinationUrl: data.destinationUrl }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

export async function deleteQrCode(venueId: string, id: string) {
  const existing = await db.qrCode.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.qrCode.delete({ where: { id } });
}

/**
 * Le superfici pubbliche del locale, con lo stato di ciascuna.
 *
 * Legge i fatti e li passa a `superficiPubbliche`, che è pura e provata a
 * parte. I due conti che servono davvero al database sono due:
 *
 *  - **quanti piatti vedrebbe un cliente adesso**, con la stessa regola con
 *    cui `getMenuPubblico` decide cosa mostrare (categoria attiva, piatto
 *    disponibile): un menu «pieno» di piatti tutti esauriti non è una
 *    superficie pronta, e proporne il QR sarebbe una bugia;
 *  - **il primo collegamento di recensione attivo**, perché è quello che
 *    riceve il cliente.
 */
export async function superficiDelLocale(
  venue: { id: string; slug: string; wifiSetupAt: Date | null },
  origine: string,
): Promise<Superficie[]> {
  const [piattiVisibili, recensione, qr] = await Promise.all([
    db.menuItem.count({
      where: { available: true, MenuCategory: { venueId: venue.id, active: true } },
    }),
    db.reviewLink.findFirst({
      where: { venueId: venue.id, active: true },
      orderBy: { ordering: "asc" },
      select: { url: true, label: true, platform: true },
    }),
    db.qrCode.findMany({ where: { venueId: venue.id }, select: { destinationUrl: true } }),
  ]);

  return superficiPubbliche({
    slug: venue.slug,
    origine,
    wifiPronto: venue.wifiSetupAt != null,
    piattiVisibili,
    linkRecensione: recensione
      ? { url: recensione.url, etichetta: recensione.label ?? etichettaPiattaforma(recensione.platform) }
      : null,
    giaCreati: qr.map((q) => q.destinationUrl),
  });
}

/** Il nome della piattaforma come lo scriverebbe una persona. */
function etichettaPiattaforma(p: string): string {
  const nomi: Record<string, string> = {
    GOOGLE: "Google",
    TRIPADVISOR: "TripAdvisor",
    TRUSTPILOT: "Trustpilot",
    THEFORK: "TheFork",
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    YELP: "Yelp",
    /* «Lascia una recensione su Altro» non si può leggere: senza un'etichetta
       scritta dal locale, la superficie resta senza piattaforma nel nome. */
    OTHER: "",
  };
  return nomi[p] ?? p.charAt(0) + p.slice(1).toLowerCase();
}
