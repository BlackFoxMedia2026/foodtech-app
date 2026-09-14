import type { Metadata } from "next";
import Link from "next/link";
import { leggiReset } from "@/server/staff-account";
import { ReimpostaPasswordForm } from "@/components/staff/scheda/reimposta-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Reimposta la password · Tavolo",
};

/**
 * La pagina che apre chi riceve un link per reimpostare la password.
 *
 * Come l'invito: un link non valido — scaduto, già usato, inventato — riceve
 * la stessa risposta, senza dire quale delle tre. Distinguere direbbe a chi
 * prova token a caso quando ha indovinato.
 */
export default async function PaginaReimpostaPassword({ params }: { params: { token: string } }) {
  const reset = await leggiReset(params.token);

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md">
        {reset ? (
          <ReimpostaPasswordForm token={params.token} email={reset.email} />
        ) : (
          <div className="surface p-6 text-center">
            <h1 className="text-display text-2xl">Questo link non è più valido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Può essere scaduto, già usato, o non essere mai esistito. Chiedi al responsabile del locale di
              generarne un altro: ci vogliono dieci secondi.
            </p>
            <p className="mt-4 text-sm">
              <Link href="/sign-in" className="underline">
                Ricordi la password? Entra
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
