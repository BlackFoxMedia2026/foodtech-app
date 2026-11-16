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

  /*
    «Da 1 a 50 di 65» — la stessa frase che stava in cima, scritta una volta.

    Si legge **dopo** aver guardato l'elenco, non prima: è la risposta a «ne
    manca altra?», che è una domanda che viene in fondo alla pagina. Lassù
    occupava la prima riga della schermata per dire una cosa che nessuno stava
    ancora chiedendo.
  */
  const conteggio =
    elenco.totale === 0
      ? "Nessun risultato"
      : elenco.pagine === 1
        ? `${elenco.totale} ${elenco.totale === 1 ? "ospite" : "ospiti"}`
        : `Da ${primo} a ${ultimo} di ${elenco.totale}`;

  return (
    // Niente scroll di pagina: comandi, avviso e paginazione restano fissi,
    // e la lista — che per natura non ha una lunghezza massima — scorre
    // dentro di sé.
    <div className="schermo animate-fade-in gap-4">
      {/*
        L'avviso compare **solo se ci sono doppioni**: una voce di menù sempre
        presente per un lavoro che si fa una volta ogni tanto sarebbe una voce
        che nessuno guarda. Così invece è una notizia.
      */}
      {doppioni > 0 && (
        <Link
          href="/guests/doppioni"
          className="fissa flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm transition-colors hover:border-accent/60"
        >
          <span>
            <span className="font-medium">
              {doppioni === 1 ? "Una coppia di schede sembra" : `${doppioni} coppie di schede sembrano`} la
              stessa persona
            </span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground sm:text-xs">
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

      {/*
        La riga di fondo, e c'è **sempre**.

        Prima esisteva solo con più di una pagina, perché serviva solo ai due
        pulsanti. Adesso porta anche il conteggio, che vale anche quando la
        pagina è una sola — «12 ospiti» dopo una ricerca è esattamente ciò che
        si stava cercando di sapere.

        La distribuzione: i pulsanti agli estremi, e in mezzo le due frasi
        vicine fra loro ma staccate dal bordo — il conteggio sta prima di
        «Successivi» come chiesto, senza appiccicarcisi. Sul telefono la riga
        si impila e il conteggio va in fondo, dove non contende lo spazio ai
        due bersagli che si toccano.
      */}
      {/* Sul telefono una riga sola, come le pagine di un'app: due frecce da
          44 px agli estremi e le due frasi in mezzo, una sotto l'altra. Le
          parole «Precedenti/Successivi» restano per chi usa un lettore di
          schermo e tornano visibili da `sm`. */}
      <nav
        className="fissa flex items-center gap-x-3 sm:gap-x-4"
        aria-label="Pagine degli ospiti"
      >
        {elenco.pagine > 1 ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-11 w-11 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3"
            disabled={elenco.pagina === 1}
          >
            <Link
              href={href(searchParams, elenco.pagina - 1)}
              aria-disabled={elenco.pagina === 1}
              className={elenco.pagina === 1 ? "pointer-events-none opacity-50" : undefined}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Precedenti</span>
            </Link>
          </Button>
        ) : (
          // Un segnaposto vuoto tiene il conteggio dove sta sempre: senza,
          // con una pagina sola scivolerebbe a sinistra e la riga di fondo
          // cambierebbe forma a ogni ricerca.
          <span aria-hidden="true" className="hidden sm:block" />
        )}

        <div className="flex min-w-0 flex-1 flex-col items-center text-[13px] leading-snug text-muted-foreground sm:ml-auto sm:flex-none sm:flex-row sm:justify-end sm:gap-6 sm:text-sm">
          {elenco.pagine > 1 && (
            <span>
              Pagina {elenco.pagina} di {elenco.pagine}
            </span>
          )}
          <span className="tabular-nums">{conteggio}</span>
        </div>

        {elenco.pagine > 1 && (
          <Button asChild variant="outline" size="sm" className="h-11 w-11 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3">
            <Link
              href={href(searchParams, elenco.pagina + 1)}
              aria-disabled={elenco.pagina === elenco.pagine}
              className={elenco.pagina === elenco.pagine ? "pointer-events-none opacity-50" : undefined}
            >
              <span className="sr-only sm:not-sr-only">Successivi</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        )}
      </nav>
    </div>
  );
}
