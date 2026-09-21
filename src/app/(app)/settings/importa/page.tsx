import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { ImportaClienti } from "@/components/settings/importa-clienti";

export const dynamic = "force-dynamic";

/**
 * Portare dentro i clienti del gestionale di prima.
 *
 * ## Perché ha una pagina sua
 *
 * Perché è **la prima cosa che si fa** quando si arriva, e non una riga fra le
 * impostazioni: si fa una volta, con un file in mano, e in mezzo c'è un passo
 * — guardare l'anteprima — che una scheda di impostazioni non sa ospitare.
 *
 * ## Perché conta più di quanto sembri
 *
 * Quandoo spegne tutto il 31 dicembre 2026 e lascia circa seimila ristoranti
 * italiani senza sistema, con i dati da esportare a mano. Chi cambia
 * gestionale non si preoccupa delle prenotazioni di domani — quelle le
 * riscrive — si preoccupa dei **clienti**: nomi, numeri, quante volte sono
 * venuti. È l'unica cosa che non si ricompra, ed è la ragione per cui un
 * ristoratore insoddisfatto resta dove sta per anni.
 */
export default async function ImportaPage() {
  const ctx = await getActiveVenue();
  /* `manage_venue`: un'importazione scrive nella rubrica e nell'agenda di
     tutti. Non è il potere di chi prende le prenotazioni della sera. */
  if (!can(ctx.role, "manage_venue")) notFound();

  return (
    <div className="schermo animate-fade-in mx-auto w-full max-w-3xl gap-4">
      <div className="fissa">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" /> Torna alle impostazioni
          </Link>
        </Button>
      </div>

      <header className="fissa">
        <p className="t-etichetta">Dati</p>
        <h1 className="text-display text-2xl">Importa da un altro gestionale</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un file CSV esportato da dove eri prima. Riconosciamo le colonne scritte in italiano o in
          inglese, il punto e virgola di Excel e le date scritte all&apos;italiana.
        </p>
      </header>

      <div className="fill-scroll pr-0.5">
        <ImportaClienti canManage={can(ctx.role, "manage_venue")} />
      </div>
    </div>
  );
}
