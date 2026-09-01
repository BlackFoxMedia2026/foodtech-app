import { z } from "zod";
import { db } from "@/lib/db";

export const ServiceModeInput = z.object({
  mode: z.enum(["ROOMS", "TABLES"]),
});

export async function setServiceAssignmentMode(venueId: string, raw: unknown) {
  const { mode } = ServiceModeInput.parse(raw);
  return db.venue.update({ where: { id: venueId }, data: { serviceAssignmentMode: mode } });
}
