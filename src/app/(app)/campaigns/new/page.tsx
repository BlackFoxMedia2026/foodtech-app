import { getActiveVenue } from "@/lib/tenant";
import { CampaignWizard } from "@/components/campaigns/wizard/campaign-wizard";

/**
 * Nuova campagna, eventualmente già impostata.
 *
 * Analytics sa quale giorno della settimana è più vuoto e sa quanti clienti
 * non vengono da un po'. Fino a ieri le due cose stavano in due pagine che non
 * si parlavano: si leggeva «il martedì sei al 54%» e poi si ricominciava da
 * zero in Campagne, scegliendo a mano un segmento che l'applicazione aveva già
 * calcolato.
 *
 * Ora quel numero porta con sé il segmento: `?segmento=inattivi&nome=…`. È il
 * passaggio da «dato» a «azione», e non richiede nessun dato nuovo — solo di
 * collegare due cose che c'erano già.
 */
const SEGMENTI = ["abituali", "a_rischio", "inattivi", "prima_volta", "assenze", "mai_venuti"] as const;

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: { segmento?: string; nome?: string };
}) {
  const ctx = await getActiveVenue();

  // Solo un'etichetta che esiste: un valore inventato nell'indirizzo non deve
  // creare una campagna con un segmento che nessuno sa leggere.
  const audienceTag = SEGMENTI.find((t) => t === searchParams.segmento);

  return (
    <CampaignWizard
      initialState={{
        senderName: process.env.BREVO_FROM_NAME || "Tavolo",
        senderEmail: process.env.BREVO_FROM_EMAIL || "marketing@tavolo.local",
        brandLogoUrl: ctx.venue.brandLogoUrl ?? "",
        brandPrimaryColor: ctx.venue.brandAccent ?? "",
        ...(audienceTag ? { segment: { audienceTag } } : {}),
        ...(searchParams.nome ? { name: searchParams.nome.slice(0, 80) } : {}),
      }}
    />
  );
}
