import { z } from "zod";
import { db } from "@/lib/db";
import { isValidUrl, normalizeUrl } from "@/lib/url-utils";

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
