import { can, getActiveVenue } from "@/lib/tenant";
import { db } from "@/lib/db";
import { statoCentralino } from "@/server/licenza-centralino";
import { risolviContestoStaff } from "@/server/contesto-staff";
import { PaginaAltro } from "@/components/shell/pagina-altro";

export const dynamic = "force-dynamic";

/**
 * «Altro» sul telefono: una pagina, non una tendina.
 *
 * La tendina che usciva dalla barra era un menu da sito: un elenco piatto
 * sopra un fondo scurito, con Marketing che si allungava a fisarmonica. In
 * un'app la quinta linguetta porta a una schermata vera — chi sei in cima,
 * sotto le sezioni a gruppi, in fondo le impostazioni e l'uscita. È anche la
 * casa del profilo sul telefono: l'avatar in testata lì non c'è più, così la
 * strada per le impostazioni è una sola.
 */
export default async function AltroPage() {
  const ctx = await getActiveVenue();
  const staff = await risolviContestoStaff();
  const telefono = await statoCentralino(ctx.venueId);
  /* La foto viene dal database e non dalla sessione: il token di accesso
     resta com'era al login, e una foto cambiata dopo non ci sarebbe. */
  const utente = ctx.session.user?.email
    ? await db.user.findUnique({
        where: { email: ctx.session.user.email },
        select: { image: true },
      })
    : null;

  return (
    <PaginaAltro
      user={{
        name: ctx.session.user?.name,
        email: ctx.session.user?.email,
        image: utente?.image ?? null,
      }}
      venueName={ctx.venue.name}
      role={ctx.role}
      telefonoAttivo={telefono.attivo && can(ctx.role, "use_phone")}
      conStaffApp={staff.stato === "ok"}
    />
  );
}
