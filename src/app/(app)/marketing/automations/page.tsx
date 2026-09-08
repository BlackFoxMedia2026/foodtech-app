import { Info } from "lucide-react";
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

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing / Automazioni</p>
        <h1 className="text-display text-3xl">Automazioni</h1>
        <p className="text-sm text-muted-foreground">
          Tre messaggi che partono da soli, quando ha senso mandarli. Non sono un costruttore di regole: sono tre
          cose che funzionano, e che puoi spegnere in un tocco.
        </p>
      </header>

      {!emailPronta && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          L&apos;email non è configurata: le automazioni non manderanno niente finché non c&apos;è la chiave del
          fornitore. Puoi comunque prepararle e vedere chi toccherebbero.
        </div>
      )}

      <div className="flex items-start gap-2 riquadro p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Come stiamo alla larga dai guai</p>
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
  );
}
