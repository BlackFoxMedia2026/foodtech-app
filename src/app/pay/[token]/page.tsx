import type { Metadata } from "next";
import { ContoTavoloError, leggiContoTavolo, tavoloDaToken } from "@/server/conto-tavolo";
import { PagaAlTavolo } from "@/components/pay/paga-al-tavolo";
import { SchermoMessaggio } from "@/components/pay/schermo-messaggio";

/**
 * La pagina che si apre inquadrando il QR sul tavolo.
 *
 * **Non è il gestionale.** Chi la apre non è un cliente di Tavolo: è una
 * persona seduta a cena, con una mano sola libera e la fretta di andarsene.
 * Niente barra di navigazione, niente accesso, niente installazioni — una
 * colonna sola, cifre grandi, e un pulsante alla volta.
 *
 * Resta però riconoscibilmente Tavolo nei materiali — verde bosco, crema,
 * terracotta — perché il locale ha scelto questo prodotto anche per come si
 * presenta ai suoi ospiti.
 *
 * ## Cosa fa il server e cosa fa il telefono
 *
 * Qui si legge il conto **una volta**, perché la prima schermata arrivi già
 * piena: un conto che compare dopo mezzo secondo di rotella, su una rete di
 * ristorante, è un conto che sembra rotto. Da lì in poi comanda il componente
 * client, che tiene la cifra aggiornata mentre gli altri commensali pagano.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Il conto di un tavolo non finisce in un motore di ricerca.
  robots: { index: false, follow: false },
  title: "Il tuo conto",
  // Su iOS senza questo la schermata di pagamento balla quando compare la
  // tastiera del campo importo.
  viewport: { width: "device-width", initialScale: 1, maximumScale: 1 },
};

export default async function PayPage({ params }: { params: { token: string } }) {
  let conto;
  let locale: { nome: string; logoUrl: string | null; accento: string | null } | null = null;

  try {
    conto = await leggiContoTavolo(params.token);
    locale = conto.locale;
  } catch (err) {
    if (!(err instanceof ContoTavoloError)) throw err;

    // «Non c'è ancora niente da pagare» non è un errore: il QR è permanente e
    // resta sul tavolo anche prima che qualcuno si sieda. Per dirlo con il
    // nome del locale in testa serve comunque il tavolo, che qui esiste.
    if (err.code === "nessun_conto" || err.code === "conto_chiuso") {
      const tavolo = await tavoloDaToken(params.token).catch(() => null);
      return (
        <SchermoMessaggio
          locale={tavolo?.venue.name ?? null}
          logoUrl={tavolo?.venue.brandLogoUrl ?? null}
          tavolo={tavolo?.label ?? null}
          titolo={err.code === "nessun_conto" ? "Non c'è ancora un conto" : "Il conto è stato chiuso"}
          testo={
            err.code === "nessun_conto"
              ? "Quando il personale aprirà il conto di questo tavolo, lo troverai qui. Puoi tenere aperta questa pagina."
              : "Questo conto è già stato chiuso in cassa. Se pensi ci sia un errore, chiedi al personale."
          }
        />
      );
    }

    if (err.code === "qr_disattivato") {
      return (
        <SchermoMessaggio
          locale={null}
          logoUrl={null}
          tavolo={null}
          titolo="Pagamento non attivo"
          testo="Questo locale non accetta pagamenti dal tavolo in questo momento. Chiedi il conto al personale."
        />
      );
    }

    // Token sconosciuto o locale disattivato: la stessa risposta, perché
    // distinguerli direbbe a chi prova codici a caso quali sono validi.
    return (
      <SchermoMessaggio
        locale={null}
        logoUrl={null}
        tavolo={null}
        titolo="Link non valido"
        testo="Questo codice non corrisponde a nessun tavolo. Controlla di aver inquadrato il codice giusto, o chiedi al personale."
      />
    );
  }

  return <PagaAlTavolo token={params.token} iniziale={conto} locale={locale!} />;
}
