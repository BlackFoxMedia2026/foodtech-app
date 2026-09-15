import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { can, getActiveVenue } from "@/lib/tenant";
import { pianiPubblici } from "@/server/dem/piani";
import { abbonamentoDi } from "@/server/dem/abbonamento";
import { SceltaPiano } from "@/components/dem/scelta-piano";

export const dynamic = "force-dynamic";

/**
 * Il confronto dei piani.
 *
 * I piani arrivano dal database e non da una costante: è il Super Admin a
 * deciderli, e cambiare un prezzo non deve richiedere una pubblicazione.
 */
export default async function PianiDemPage() {
  const ctx = await getActiveVenue();
  const [piani, sub] = await Promise.all([pianiPubblici(), abbonamentoDi(ctx.venueId)]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 animate-fade-in">
      <header className="space-y-2">
        <Link
          href="/settings/marketing/piano"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Il tuo piano DEM
        </Link>
        <h1 className="t-titolo-pagina">Scegli il tuo piano</h1>
        <p className="t-corpo text-muted-foreground">
          Gli invii si contano per destinatario. Passando a un piano superiore la nuova quota vale
          subito, e quello che hai già inviato resta contato — non si riparte da zero.
        </p>
      </header>

      <SceltaPiano
        piani={piani.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          monthlyEmails: p.monthlyEmails,
          priceCents: p.priceCents,
          description: p.description,
          badge: p.badge,
        }))}
        pianoAttuale={sub.plan.slug}
        pianoProgrammato={sub.scheduledPlan?.slug ?? null}
        puoAcquistare={can(ctx.role, "manage_venue")}
      />

      <p className="t-nota">
        Se scegli un piano più piccolo, quello attuale resta attivo fino alla fine del periodo già
        pagato: il nuovo parte dal rinnovo successivo.
      </p>
    </div>
  );
}
