import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { storicoDelCliente } from "@/server/costi/dettaglio";

export const dynamic = "force-dynamic";

/** Lo storico mensile: dodici cicli, per vedere la marginalità nel tempo. */
export async function GET(_req: Request, { params }: { params: { venueId: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  return NextResponse.json({ righe: await storicoDelCliente(params.venueId) });
}
