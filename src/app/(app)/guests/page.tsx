import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActiveVenue } from "@/lib/tenant";
import { listGuests, listDistinctTags } from "@/server/guests";
import { contaDoppioni } from "@/server/guest-merge";
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

  const [elenco, availableTags, doppioni] = await Promise.all([
    listGuests(ctx.venueId, { q: searchParams.q, tag: searchParams.tag, pagina }),
    listDistinctTags(ctx.venueId),
    contaDoppioni(ctx.venueId),
  ]);

  const primo = elenco.totale === 0 ? 0 : (elenco.pagina - 1) * elenco.perPagina + 1;
  const ultimo = (elenco.pagina - 1) * elenco.perPagina + elenco.items.length;

  return (
    // Niente scroll di pagina: testata, avviso e paginazione restano fissi,
    // e la lista — che per natura non ha una lunghezza massima — scorre
    // dentro di sé.
    <div className="schermo animate-fade-in gap-4">
      <header className="fissa">
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

      {/*
        L'avviso compare **solo se ci sono doppioni**: una voce di menù sempre
        presente per un lavoro che si fa una volta ogni tanto sarebbe una voce
        che nessuno guarda. Così invece è una notizia.
      */}
      {doppioni > 0 && (
        <Link
          href="/guests/doppioni"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm transition-colors hover:border-accent/60"
        >
          <span>
            <span className="font-medium">
              {doppioni === 1 ? "Una coppia di schede sembra" : `${doppioni} coppie di schede sembrano`} la
              stessa persona
            </span>
            <span className="block text-xs text-muted-foreground">
              Stessa email o stesso telefono. Tre copie di un cliente sono tre saldi punti che non si
              sommano.
            </span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            Guarda <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      )}

      {/* `spesaCents` è una Map, e una Map non attraversa il confine fra
          server e client: si passa come oggetto semplice. */}
      <GuestsTable
        rows={elenco.items}
        availableTags={availableTags}
        spesaCents={Object.fromEntries(elenco.spesaCents)}
      />

      {elenco.pagine > 1 && (
        <nav className="fissa flex items-center justify-between gap-3" aria-label="Pagine degli ospiti">
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
