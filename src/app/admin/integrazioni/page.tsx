import Link from "next/link";
import { panoramicaCertificazione } from "@/server/integrations/certificazione/accesso";
import { richiesteAperte } from "@/server/integrations/richieste";
import { CATALOGO } from "@/server/integrations/registry";
import { PannelloIntegrazioniAdmin } from "@/components/integrations/pannello-integrazioni-admin";
import { RichiesteIntegrazioni } from "@/components/integrations/richieste-integrazioni";

export const dynamic = "force-dynamic";

/**
 * Le integrazioni viste da Foodtech: per ogni fornitore, **implementazione**
 * (il codice c'è?) e **certificazione** (che cosa è stato provato, e dove)
 * separate, la fase di rilascio, e i locali con l'accesso beta.
 *
 * I dati vengono dalle evidenze registrate: niente qui è scritto a mano. La
 * vista tecnica di ogni fornitore, con la console di certificazione sul
 * locale attivo, è /admin/integrazioni/<slug>. In cima, le richieste dei
 * ristoranti («Richiedi attivazione», «Avvisami»).
 *
 * È l'unico posto in cui si vedono livelli di certificazione, fasi di
 * rilascio e dettagli degli adattatori: la pagina del cliente ne mostra solo
 * il risultato, in cinque stati.
 */
export default async function AdminIntegrazioniPage() {
  const [fornitori, richieste] = await Promise.all([
    panoramicaCertificazione().then((f) => JSON.parse(JSON.stringify(f))),
    richiesteAperte(),
  ]);
  const senzaAdattatore = CATALOGO.filter((v) => !v.nativa && !fornitori.some((f: { slug: string }) => f.slug === v.slug));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="t-titolo-pagina">Integrazioni: certificazione e rilascio</h1>
        <p className="t-nota mt-1">
          Un&apos;anteprima si installa solo sui locali con accesso beta. La beta pubblica richiede le capacità essenziali
          verificate contro l&apos;API, la disponibilità generale su un POS vero.
        </p>
      </header>
      <section className="riquadro comodo space-y-3">
        <h2 className="t-titolo-sezione">Richieste integrazioni</h2>
        <RichiesteIntegrazioni richieste={richieste} />
      </section>
      <PannelloIntegrazioniAdmin fornitori={fornitori} />
      <section className="riquadro comodo space-y-2">
        <h2 className="t-titolo-sezione">Solo catalogo</h2>
        <p className="t-nota">Voci senza adattatore: il cliente le vede come «Prossimamente».</p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {senzaAdattatore.map((v) => (
            <Link key={v.slug} href={`/admin/integrazioni/${v.slug}`} className="underline-offset-4 hover:underline">
              {v.nome}
            </Link>
          ))}
        </p>
      </section>
    </div>
  );
}
