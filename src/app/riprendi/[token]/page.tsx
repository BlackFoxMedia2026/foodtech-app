import type { Metadata } from "next";
import { RiprendiPrenotazione } from "@/components/telefono/riprendi-prenotazione";
import { leggiRipresa } from "@/server/voice/recupero-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Riprendi la prenotazione",
};

/**
 * La pagina che apre chi ha riattaccato a metà e riceve il link.
 *
 * Come l'invito e il reset della password: un link che non vale — scaduto,
 * già usato, inventato — riceve **la stessa risposta**, senza dire quale delle
 * tre. Distinguere direbbe a chi prova token a caso quando ha indovinato.
 *
 * E la via d'uscita non è un vicolo cieco: chi trova un link scaduto ha
 * ancora un ristorante da chiamare, e questa pagina glielo dice invece di
 * lasciarlo lì.
 */
export default async function RiprendiPage({ params }: { params: { token: string } }) {
  const ripresa = await leggiRipresa(params.token);

  return (
    <div className="min-h-screen bg-background px-4 py-12 text-foreground">
      <div className="mx-auto max-w-lg">
        {ripresa ? (
          <RiprendiPrenotazione
            token={params.token}
            nomeLocale={ripresa.nomeLocale}
            nome={ripresa.nome}
            persone={ripresa.persone}
            quando={ripresa.quando?.toISOString() ?? null}
          />
        ) : (
          <div className="surface p-6 text-center">
            <h1 className="text-display text-2xl">Questo link non è più valido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Può essere scaduto, o la prenotazione può essere già stata completata. Se ti serve un
              tavolo, una telefonata al ristorante è la strada più breve.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
