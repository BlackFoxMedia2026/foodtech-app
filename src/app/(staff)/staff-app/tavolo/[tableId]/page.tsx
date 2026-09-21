import { notFound, redirect } from "next/navigation";
import { getContestoStaff } from "@/lib/staff-auth";
import { puo } from "@/lib/permessi-staff";
import { apriTavolo, TavoloError } from "@/server/staff-app/tavolo";
import { TavoloOperativo } from "@/components/staff-app/tavolo-operativo";

export const dynamic = "force-dynamic";

/**
 * **Il tavolo, a schermo intero** — §7.
 *
 * Una pagina e non un riquadro: ha un indirizzo suo, quindi il pulsante
 * indietro del telefono funziona, il link si può mandare a un collega e la
 * notifica «due piatti pronti» può portarci dentro con un tap.
 *
 * Il controllo di appartenenza sta **qui e nell'API**, e non è una
 * ripetizione inutile: qui decide cosa vedi, là cosa puoi fare. Chi scrive a
 * mano l'identificativo di un tavolo di un collega, senza `view_all_tables`,
 * finisce sulla sua sala — non su una pagina d'errore, perché quasi sempre è
 * un link vecchio dopo un cambio di assegnazione, non un tentativo.
 */
export default async function TavoloPage({ params }: { params: { tableId: string } }) {
  const ctx = await getContestoStaff("view_tables");

  let tavolo;
  try {
    tavolo = await apriTavolo(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      params.tableId,
    );
  } catch (err) {
    if (err instanceof TavoloError && err.code === "not_found") notFound();
    throw err;
  }

  if (!tavolo.mio && !puo(ctx.permessi, "view_all_tables")) redirect("/staff-app/sala");

  return <TavoloOperativo iniziale={tavolo} permessi={ctx.permessi} />;
}
