import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { resolveActiveVenue } from "@/lib/tenant";
import { CartaAccesso } from "@/components/staff-app/carta-accesso";

export const dynamic = "force-dynamic";

/**
 * Chi è entrato ma non ha un locale.
 *
 * Sta nel gruppo dell'accesso e **non** in `(app)`: il guscio del gestionale
 * chiede un locale (`getActiveVenue`), e chi non ne ha uno viene mandato
 * proprio qui. Finché la pagina stava dentro quel guscio, una persona con
 * tutte le appartenenze disattivate rimbalzava fra `/onboarding` e
 * `/onboarding` fino a `ERR_TOO_MANY_REDIRECTS`, senza leggere niente.
 *
 * Qui il locale non si chiede: si guarda soltanto se c'è. Chi ne ha uno torna
 * al gestionale, chi non è entrato va all'accesso, e gli altri leggono perché
 * sono fermi — con un modo per uscire, che senza guscio non ci sarebbe.
 */
export default async function Onboarding() {
  const esito = await resolveActiveVenue();
  if (esito.state === "unauthenticated") redirect("/sign-in");
  if (esito.state === "ok") redirect("/overview");

  /* Due situazioni diverse, e una frase sola le confonderebbe: chi non è
     mai stato aggiunto aspetta un invito, chi è stato tolto deve chiedere
     di essere riattivato. */
  const disattivate = await db.venueMembership.count({
    where: { userId: esito.userId, disabledAt: { not: null } },
  });

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface max-w-md p-8 text-center">
        {disattivate > 0 ? (
          <>
            <h1 className="text-display text-2xl">Accesso sospeso</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Il tuo accesso ai locali in cui lavoravi è stato disattivato. Se
              pensi sia un errore, chiedi al titolare o al manager di
              riattivarlo dalla pagina del personale.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-display text-2xl">Account creato</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Non risultano locali associati al tuo profilo. Chiedi al tuo
              manager di aggiungerti come membro: appena lo fa, rientrando
              troverai il tuo locale.
            </p>
          </>
        )}
        <div className="mt-6">
          <CartaAccesso />
        </div>
      </div>
    </main>
  );
}
