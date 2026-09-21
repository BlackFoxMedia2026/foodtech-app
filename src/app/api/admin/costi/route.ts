import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { elencoCosti, filtraFine, kpiCosti, cicloCorrente } from "@/server/costi/piattaforma-costi";
import type { FiltroCosti } from "@/lib/stati-costo";

/**
 * L'elenco dei costi per cliente, con i totali.
 *
 * L'autorizzazione è **server-side e per conto suo**: non ci si affida al
 * fatto che la pagina non compaia nel menu. Chi non è nell'elenco dei Super
 * Admin riceve «non esiste» — non «non puoi» — perché l'esistenza di questo
 * indirizzo non è un'informazione da regalare a un cliente che prova.
 */
export const dynamic = "force-dynamic";

const FILTRI: FiltroCosti[] = ["tutti", "normali", "attenzione", "critici", "bloccati", "previsione", "override"];

export async function GET(req: Request) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  const url = new URL(req.url);
  const filtroGrezzo = url.searchParams.get("filtro") ?? "tutti";
  const filtro = (FILTRI as string[]).includes(filtroGrezzo) ? (filtroGrezzo as FiltroCosti) : "tutti";
  const ciclo = url.searchParams.get("ciclo") ?? cicloCorrente();

  const elenco = await elencoCosti({
    ciclo,
    filtro,
    ricerca: url.searchParams.get("q") ?? undefined,
    pianoSlug: url.searchParams.get("piano") ?? undefined,
    pagina: Number(url.searchParams.get("pagina") ?? "1"),
    perPagina: Number(url.searchParams.get("perPagina") ?? "25"),
  });

  return NextResponse.json({
    ...elenco,
    righe: filtraFine(elenco.righe, filtro),
    kpi: await kpiCosti(ciclo),
  });
}
