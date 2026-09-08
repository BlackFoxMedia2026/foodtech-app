import type { Metadata } from "next";
import Link from "next/link";
import { leggiInvito } from "@/server/team";
import { AcceptInviteForm } from "@/components/team/accept-invite-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Invito · Tavolo",
};

/**
 * La pagina che apre chi riceve un invito.
 *
 * Dice tre cose e non una di più: **dove** sta entrando, **con che ruolo**, e
 * **cosa deve fare adesso**. Non il numero di tavoli, non chi altro lavora
 * là: sono cose di un locale in cui questa persona non è ancora dentro.
 *
 * Un link non valido — inventato, scaduto, già usato — riceve la stessa
 * risposta: non esiste. Distinguere «scaduto» da «mai esistito» direbbe a chi
 * prova segreti a caso quando ha indovinato.
 */
export default async function PaginaInvito({ params }: { params: { token: string } }) {
  const invito = await leggiInvito(params.token);

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md">
        {invito ? (
          <AcceptInviteForm invito={invito} />
        ) : (
          <div className="surface riquadro p-6 text-center">
            <h1 className="text-display text-2xl">Questo invito non è più valido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Può essere scaduto, già usato, o non essere mai esistito. Chiedi al locale di crearne un
              altro: ci vogliono dieci secondi.
            </p>
            <p className="mt-4 text-sm">
              <Link href="/sign-in" className="underline">
                Hai già un accesso? Entra
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
