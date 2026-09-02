import { Wine, Footprints, HandHelping, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TABLE_ASSIGNABLE_CAPABILITIES } from "@/lib/staff-roles";

/** Icons for the 4 table-assignable roles, shared between the assign-staff
 * dialog and the compact badges on the floor plan node. */
export const TABLE_ROLE_ICONS: Record<(typeof TABLE_ASSIGNABLE_CAPABILITIES)[number], LucideIcon> = {
  TABLE_RESPONSIBLE: UserRound,
  SOMMELIER: Wine,
  TABLE_SUPPORT: HandHelping,
  RUNNER: Footprints,
};
