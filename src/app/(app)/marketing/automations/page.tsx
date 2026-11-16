import { ChevronDown, Info } from "lucide-react";
import { can, getActiveVenue } from "@/lib/tenant";
import { listAutomations } from "@/server/automations/engine";
import { channelAvailable } from "@/server/messaging/send";
import { SILENZIO_GIORNI, TETTO_PER_ESECUZIONE } from "@/server/automations/catalogue";
import { AutomationCard } from "@/components/automations/automation-card";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const ctx = await getActiveVenue();
  const automazioni = await listAutomations(ctx.venueId);
  const canEdit = can(ctx.role, "edit_marketing");
  const emailPronta = channelAvailable("EMAIL");

  const intro = (
    <>
      <p className="t-etichetta">Marketing / Automazioni</p>
      <p className="text-[15px] text-muted-foreground md:text-sm">
        Tre messaggi che partono da soli, quando ha senso mandarli. Non sono un costruttore di regole: sono tre
        cose che funzionano, e che puoi spegnere in un tocco.
      </p>
    </>
  );
  const avviso = !emailPronta && (
    <div className="rounded-md border border-accent/40 bg-accent/10 p-4 text-sm text-foreground">
      L&apos;email non è configurata: le automazioni non manderanno niente finché non c&apos;è la chiave del
      fornitore. Puoi comunque prepararle e vedere chi toccherebbero.
    </div>
  );
  const regole = (
    <>
      <p>
        Ogni automazione guarda solo chi ha <strong>appena</strong> superato la soglia, non tutto
        l&apos;archivio: accenderla non fa partire un diluvio. La stessa persona la riceve una volta per periodo,
        e nessuno riceve niente se gli abbiamo già scritto negli ultimi {SILENZIO_GIORNI} giorni. Al massimo{" "}
        {TETTO_PER_ESECUZIONE} messaggi al giorno per automazione: il resto slitta a domani.
      </p>
      <p>
        Vale sempre il consenso: chi non ha dato il consenso marketing, o non ha un&apos;email, non viene
        contato né contattato.
      </p>
    </>
  );

  return (
    <div className="schermo animate-fade-in gap-3">
      {/* Da `md` intestazione e avviso restano fissi in cima. Su telefono
          scorrono con il resto: fissi, si prendevano tutto il primo schermo e
          le automazioni cominciavano sotto la piega. */}
      <header className="fissa hidden md:block">{intro}</header>
      {avviso && <div className="fissa hidden md:block">{avviso}</div>}

      {/* Una sola regione che assorbe l'altezza rimasta: il riquadro
          informativo e le tre automazioni scorrono qui dentro, non allungano
          la pagina. */}
      <div className="fill-scroll space-y-4 pr-0.5">
        <header className="md:hidden">{intro}</header>
        {avviso && <div className="md:hidden">{avviso}</div>}

        {/* Su telefono le regole sono una riga che si apre: si leggono una
            volta, e chiuse non spingono le automazioni fuori dallo schermo. */}
        <details className="group riquadro text-[15px] text-muted-foreground md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <Info className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
            <span className="flex-1">Come stiamo alla larga dai guai</span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-2 px-4 pb-4">{regole}</div>
        </details>

        <div className="hidden items-start gap-2 riquadro p-4 text-sm text-muted-foreground md:flex">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Come stiamo alla larga dai guai</p>
            {regole}
          </div>
        </div>

        <div className="grid gap-4">
          {automazioni.map((a) => (
            <AutomationCard key={a.key} automation={a} canEdit={canEdit} />
          ))}
        </div>

        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Il tuo ruolo può vedere le automazioni, non accenderle o modificarle.
          </p>
        )}
      </div>
    </div>
  );
}
