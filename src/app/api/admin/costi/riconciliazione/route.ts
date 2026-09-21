import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { registraCostoReale, riconciliaCiclo, storicoRiconciliazioni } from "@/server/costi/riconciliazione";

export const dynamic = "force-dynamic";

/** Le riconciliazioni salvate, dalla più recente. */
export async function GET(req: Request) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  const ciclo = new URL(req.url).searchParams.get("ricalcola");
  if (ciclo) await riconciliaCiclo(ciclo, { forza: true }).catch(() => null);

  return NextResponse.json({ righe: await storicoRiconciliazioni() });
}

const Corpo = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  /** L'importo della fattura, nella valuta in cui Amazon fattura. */
  importo: z.number().nonnegative(),
  valuta: z.string().length(3),
  nota: z.string().max(300).optional(),
});

/**
 * Registra a mano il costo reale di un mese.
 *
 * Serve finché Cost Explorer non è collegato — e resta utile dopo: una fattura
 * letta da una persona è la verifica più affidabile che abbiamo, e la fonte
 * viene scritta accanto al numero proprio perché chi legge sappia da dove
 * arriva.
 */
export async function POST(req: Request) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  try {
    const corpo = Corpo.parse(await req.json());
    const esito = await registraCostoReale({
      yearMonth: corpo.yearMonth,
      importo: corpo.importo,
      valuta: corpo.valuta.toUpperCase(),
      nota: corpo.nota,
    });
    return NextResponse.json(esito);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
