import { getContestoStaff } from "@/lib/staff-auth";
import { puo } from "@/lib/permessi-staff";
import { comandeVive } from "@/server/comande/comande";
import { ElencoComande } from "@/components/staff-app/elenco-comande";
import { TestataSezione } from "@/components/staff-app/testata-staff";

export const dynamic = "force-dynamic";

/** §29: le comande, divise per stato. Chi non ha `view_all_tables` vede solo
 * le proprie — il filtro è nella query, non nell'interfaccia. */
export default async function ComandePage() {
  const ctx = await getContestoStaff("view_kitchen_status");

  const comande = await comandeVive(ctx.venueId, {
    waiterId: puo(ctx.permessi, "view_all_tables") ? null : ctx.persona.waiterId,
    /* Le servite di oggi restano in elenco: servono a rispondere a «l'ho già
       portato?», che è la domanda che si fa chi torna al passe. */
    stati: ["INVIATA", "RICEVUTA", "IN_PREPARAZIONE", "PRONTA", "SERVITA"],
  });

  return (
    <div className="schermo">
      <TestataSezione
        titolo="Comande"
        sottotitolo={puo(ctx.permessi, "view_all_tables") ? "Tutta la sala" : "Le tue"}
      />

      <ElencoComande iniziali={comande} permessi={ctx.permessi} />
    </div>
  );
}
