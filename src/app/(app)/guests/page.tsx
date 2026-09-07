import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActiveVenue } from "@/lib/tenant";
import { listGuests, listDistinctTags } from "@/server/guests";
import { GuestsTable } from "@/components/guests/guests-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** L'indirizzo della pagina N, tenendo la ricerca e il filtro. */
function href(params: { q?: string; tag?: string }, pagina: number) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.tag) qs.set("tag", params.tag);
  if (pagina > 1) qs.set("pagina", String(pagina));
  const s = qs.toString();
  return s ? `/guests?${s}` : "/guests";
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: { q?: string; tag?: string; pagina?: string };
}) {
  const ctx = await getActiveVenue();
  const pagina = Number(searchParams.pagina) || 1;

  const [elenco, availableTags] = await Promise.all([
    listGuests(ctx.venueId, { q: searchParams.q, tag: searchParams.tag, pagina }),
    listDistinctTags(ctx.venueId),
  ]);

  const primo = elenco.totale === 0 ? 0 : (elenco.pagina - 1) * elenco.perPagina + 1;
  const ultimo = (elenco.pagina - 1) * elenco.perPagina + elenco.items.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">CRM</p>
        <h1 className="text-display text-3xl">Ospiti</h1>
        <p className="text-sm text-muted-foreground">
          {/* Prima diceva soltanto «200 risultati» anche con cinquecento
              clienti in archivio: chi cercava i trecento mancanti pensava che
              la ricerca fosse rotta. */}
          {elenco.totale === 0
            ? "Nessun risultato"
            : elenco.pagine === 1
              ? `${elenco.totale} ${elenco.totale === 1 ? "ospite" : "ospiti"}`
              : `Da ${primo} a ${ultimo} di ${elenco.totale}`}
        </p>
      </header>

      <GuestsTable rows={elenco.items} availableTags={availableTags} />

      {elenco.pagine > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagine degli ospiti">
          <Button asChild variant="outline" size="sm" disabled={elenco.pagina === 1}>
            <Link
              href={href(searchParams, elenco.pagina - 1)}
              aria-disabled={elenco.pagina === 1}
              className={elenco.pagina === 1 ? "pointer-events-none opacity-50" : undefined}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Precedenti
            </Link>
          </Button>

          <span className="text-sm text-muted-foreground">
            Pagina {elenco.pagina} di {elenco.pagine}
          </span>

          <Button asChild variant="outline" size="sm">
            <Link
              href={href(searchParams, elenco.pagina + 1)}
              aria-disabled={elenco.pagina === elenco.pagine}
              className={elenco.pagina === elenco.pagine ? "pointer-events-none opacity-50" : undefined}
            >
              Successivi <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      )}
    </div>
  );
}
