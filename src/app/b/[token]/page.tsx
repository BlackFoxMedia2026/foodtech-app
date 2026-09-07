import type { Metadata } from "next";
import { readBookingByToken } from "@/server/guest-actions";
import { GuestBookingActions } from "@/components/bookings/guest-booking-actions";

export const dynamic = "force-dynamic";

/** Un link privato non deve finire nei motori di ricerca. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "La tua prenotazione · Tavolo",
};

/**
 * La pagina che l'ospite apre dal promemoria.
 *
 * Mostra e non agisce: l'azione parte solo da un gesto esplicito (POST). I
 * client di posta precaricano i link, e un annullamento innescato da
 * un'anteprima sarebbe una cena persa senza che nessuno abbia cliccato.
 */
export default async function GuestBookingPage({ params }: { params: { token: string } }) {
  const prenotazione = await readBookingByToken(params.token);

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md">
        {prenotazione ? (
          <GuestBookingActions token={params.token} booking={prenotazione} />
        ) : (
          <div className="surface rounded-md border border-border p-6 text-center">
            <h1 className="text-display text-2xl">Link non più valido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Questo link è scaduto o non è corretto. Se ti serve modificare una prenotazione, chiama
              direttamente il locale: ti aiutano in un attimo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
