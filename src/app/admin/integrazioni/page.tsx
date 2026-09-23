import { panoramicaCertificazione } from "@/server/integrations/certificazione/accesso";
import { PannelloIntegrazioniAdmin } from "@/components/integrations/pannello-integrazioni-admin";

export const dynamic = "force-dynamic";

/**
 * Le integrazioni viste da Foodtech: per ogni fornitore, **implementazione**
 * (il codice c'è?) e **certificazione** (che cosa è stato provato, e dove)
 * separate, la fase di rilascio, e i locali con l'accesso beta.
 *
 * I dati vengono dalle evidenze registrate: niente qui è scritto a mano. La
 * certificazione vera si fa dalla console del locale di prova
 * (Impostazioni → Integrazioni → fornitore → Certificazione).
 */
export default async function AdminIntegrazioniPage() {
  const fornitori = JSON.parse(JSON.stringify(await panoramicaCertificazione()));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="t-titolo-pagina">Integrazioni: certificazione e rilascio</h1>
        <p className="t-nota mt-1">
          Un&apos;anteprima si installa solo sui locali con accesso beta. La beta pubblica richiede le capacità essenziali
          verificate contro l&apos;API, la disponibilità generale su un POS vero.
        </p>
      </header>
      <PannelloIntegrazioniAdmin fornitori={fornitori} />
    </div>
  );
}
