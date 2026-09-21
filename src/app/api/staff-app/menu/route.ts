import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { getMenu } from "@/server/menu";

/**
 * La carta, per battere la comanda.
 *
 * È `getMenu` del back office, senza una riga in più: la carta è una sola, e
 * un secondo modo di leggerla sarebbe il modo più rapido perché un prezzo
 * cambiato in Menu non arrivi in sala. Le categorie disattivate e i piatti
 * finiti tornano già segnati da lì, e la schermata li mostra spenti invece di
 * nasconderli — un cameriere che non trova la carbonara in elenco pensa di
 * aver sbagliato a cercare, uno che la trova barrata sa cosa dire al tavolo.
 */
export async function GET(req: Request) {
  const ctx = await requireStaffApi("create_orders");
  if (!ctx.ok) return ctx.response;

  try {
    const menuKey = new URL(req.url).searchParams.get("menu") ?? "main";
    return NextResponse.json({ categorie: await getMenu(ctx.venueId, menuKey) });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
