import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { can, getActiveVenue } from "@/lib/tenant";
import { trovaDoppioni } from "@/server/guest-merge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DoppioniList } from "@/components/guests/doppioni-list";

export const dynamic = "force-dynamic";

/**
 * Le schede che sembrano la stessa persona.
 *
 * Sta in una pagina sua e non nella lista clienti perché è un lavoro che si
 * fa una volta ogni tanto, con calma, guardando due schede vicine — non
 * durante un servizio.
 *
 * Chi non è Manager la vede in sola lettura: l'unione cancella una riga di
 * anagrafica, e non è un gesto da servizio.
 */
export default async function DoppioniPage() {
  const ctx = await getActiveVenue();
  const doppioni = await trovaDoppioni(ctx.venueId);
  const canManage = can(ctx.role, "manage_venue");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/guests">
            <ArrowLeft className="h-4 w-4" /> Tutti gli ospiti
          </Link>
        </Button>
      </div>

      <header>
        <p className="t-etichetta">CRM</p>
        <h1 className="text-display text-3xl">Possibili doppioni</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Due schede con la stessa email o lo stesso telefono sono quasi sempre la stessa persona: e tre
          copie di una persona sono tre saldi punti che non si sommano e tre conteggi di visite che dicono
          «prima volta» a un cliente abituale. Qui le proponiamo; unirle lo decidi tu.
        </p>
      </header>

      {doppioni.length === 0 ? (
        <EmptyState icon={Users} title="Nessun doppione da guardare">
          Nessuna coppia di schede condivide email o telefono. Le prenotazioni nuove riconoscono già chi è
          nel CRM, quindi questa pagina dovrebbe restare vuota.
        </EmptyState>
      ) : (
        <DoppioniList doppioni={doppioni} canManage={canManage} />
      )}
    </div>
  );
}
