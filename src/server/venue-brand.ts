import { z } from "zod";
import { db } from "@/lib/db";
import { isValidUrl, normalizeUrl } from "@/lib/url-utils";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6,8}$/, { message: "Colore non valido" });

const optionalUrl = z
  .string()
  .transform((v) => (v.trim() ? normalizeUrl(v.trim()) : ""))
  .refine((v) => v === "" || isValidUrl(v), { message: "URL non valido" });

export const BrandSettingsInput = z.object({
  name: z.string().min(1).optional(),
  brandLogoUrl: z.string().optional(),
  coverImage: z.string().optional(),
  brandAccent: hexColor.optional(),
  brandSecondaryColor: hexColor.optional(),
  brandBackgroundColor: hexColor.optional(),
  brandTypography: z.enum(["ELEGANT", "MODERN", "CLASSIC", "CASUAL"]).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  websiteUrl: optionalUrl.optional(),
  instagramUrl: optionalUrl.optional(),
  facebookUrl: optionalUrl.optional(),
  googleBusinessUrl: optionalUrl.optional(),
});
export type BrandSettingsInputType = z.infer<typeof BrandSettingsInput>;

export async function getBrandSettings(venueId: string) {
  return db.venue.findUniqueOrThrow({ where: { id: venueId } });
}

/**
 * `action` distingue il salvataggio semplice (Impostazioni) dal completamento/
 * rinvio del setup iniziale (wizard): quando presente, aggiorna anche lo stato
 * di onboarding oltre ai campi eventualmente forniti.
 */
export async function updateBrandSettings(venueId: string, raw: unknown, action?: "complete" | "skip") {
  const data = BrandSettingsInput.partial().parse(raw);

  return db.venue.update({
    where: { id: venueId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.brandLogoUrl !== undefined && { brandLogoUrl: data.brandLogoUrl }),
      ...(data.coverImage !== undefined && { coverImage: data.coverImage }),
      ...(data.brandAccent !== undefined && { brandAccent: data.brandAccent }),
      ...(data.brandSecondaryColor !== undefined && { brandSecondaryColor: data.brandSecondaryColor }),
      ...(data.brandBackgroundColor !== undefined && { brandBackgroundColor: data.brandBackgroundColor }),
      ...(data.brandTypography !== undefined && { brandTypography: data.brandTypography }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.websiteUrl !== undefined && { websiteUrl: data.websiteUrl || null }),
      ...(data.instagramUrl !== undefined && { instagramUrl: data.instagramUrl || null }),
      ...(data.facebookUrl !== undefined && { facebookUrl: data.facebookUrl || null }),
      ...(data.googleBusinessUrl !== undefined && { googleBusinessUrl: data.googleBusinessUrl || null }),
      ...(action === "complete" && { onboardingStatus: "COMPLETED", onboardingCompletedAt: new Date() }),
      ...(action === "skip" && { onboardingStatus: "SKIPPED", onboardingSkippedAt: new Date() }),
    },
  });
}
