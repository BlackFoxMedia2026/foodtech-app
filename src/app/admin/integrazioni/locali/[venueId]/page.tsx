import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { schedaLocaleAdmin } from "@/server/integrations/vista-assistenza";
import { voceDi } from "@/server/integrations/registry";
import { vistaVoceCliente } from "@/server/integrations/cliente";
import { PannelloAssistenzaAdmin, type VoceAdmin } from "@/components/integrations/pannello-assistenza-admin";

export const dynamic = "force-dynamic";

/**
 * **Le integrazioni di un ristorante, viste dall'assistenza Foodtech.**
 * Solo Super Admin (il layout di /admin risponde «non esiste» agli altri).
 *
 * Il locale è quello dell'indirizzo, non il locale attivo di chi guarda:
 * l'amministratore non deve essere membro del ristorante per aiutarlo. Che
 * cosa può fare senza la delega del cliente, e che cosa no, lo decide
 * `server/integrations/azioni-admin.ts`. I segreti non ci sono: la scheda
 * legge solo tipo, permessi e scadenze delle credenziali.
 */
export default async function AdminLocaleIntegrazioniPage({ params }: { params: { venueId: string } }) {
  const scheda = await schedaLocaleAdmin(params.venueId);
  if (!scheda) notFound();

  // I campi che l'assistenza deve compilare quando configura per il cliente: gli stessi del wizard.
  const voci: Record<string, VoceAdmin> = {};
  for (const r of scheda.righe) {
    const v = voceDi(r.slug);
    if (!v) continue;
    const c = vistaVoceCliente(v);
    voci[r.slug] = {
      accesso: c.accesso,
      titoloSede: c.titoloSede,
      campiSede: c.campiSede.map((x) => ({ chiave: x.chiave, etichetta: x.etichetta, tipo: x.tipo, opzioniDa: x.opzioniDa ?? null, opzioni: x.opzioni, obbligatorio: x.obbligatorio })),
      gruppi: c.gruppi.map((g) => ({ chiave: g.chiave, etichetta: g.etichetta })),
    };
  }

  return (
    <div className="space-y-5">
      <Link href="/admin/integrazioni/locali" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Locali
      </Link>

      <header className="space-y-1">
        <p className="t-etichetta">
          {scheda.locale.gruppo} · <code>{scheda.locale.slug}</code> · <code>{scheda.locale.venueId}</code>
        </p>
        <h1 className="t-titolo-pagina">{scheda.locale.nome}</h1>
        {scheda.locale.referenti.length > 0 && (
          <p className="t-nota">
            Referenti: {scheda.locale.referenti.map((r) => `${r.nome ?? r.email} <${r.email}>`).join(" · ")}
          </p>
        )}
      </header>

      <div className="riquadro comodo space-y-1 text-sm">
        <p className="font-medium">Come si aiuta un cliente senza ricevere le sue credenziali</p>
        <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>Se è un&apos;anteprima, abilita la beta per questo locale.</li>
          <li>
            Prepara un <strong>collegamento per le credenziali</strong> e mandalo al referente: lo apre nella sua sessione e le
            inserisce lui nel wizard. Mai chiavi o password per email, chat o telefono.
          </li>
          <li>Con la delega del cliente («Chiedi aiuto a Foodtech» → autorizzo) puoi scegliere sede, sincronizzazione e attivare.</li>
          <li>La verifica della connessione si può fare sempre, e finisce nel registro di audit.</li>
        </ol>
      </div>

      <PannelloAssistenzaAdmin venueId={scheda.locale.venueId} righe={JSON.parse(JSON.stringify(scheda.righe))} voci={voci} />
    </div>
  );
}
