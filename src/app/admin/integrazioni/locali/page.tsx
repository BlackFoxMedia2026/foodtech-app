import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cercaLocali } from "@/server/integrations/vista-assistenza";

export const dynamic = "force-dynamic";

/**
 * **Trovare il ristorante da aiutare.** Per nome, indirizzo breve (slug),
 * gruppo o identificativo. Solo Super Admin (lo garantisce il layout).
 *
 * Ogni riga dice subito se c'è qualcosa da fare: integrazioni con problemi,
 * richieste di assistenza aperte, richieste di attivazione.
 */
export default async function AdminLocaliIntegrazioniPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim() ?? "";
  const locali = await cercaLocali(q);

  return (
    <div className="space-y-5">
      <Link href="/admin/integrazioni" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Integrazioni
      </Link>
      <header>
        <h1 className="t-titolo-pagina">Assistenza: trova il ristorante</h1>
        <p className="t-nota mt-1">Cerca per nome del locale, del gruppo, indirizzo breve o identificativo.</p>
      </header>

      <form className="flex max-w-lg gap-2" action="/admin/integrazioni/locali">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input name="q" defaultValue={q} placeholder="Nome, gruppo, slug o id" aria-label="Cerca un locale" className="pl-9" />
        </div>
        <Button type="submit" variant="accent">
          Cerca
        </Button>
      </form>

      {locali.length === 0 ? (
        <p className="riquadro tratteggiato comodo text-center text-sm text-muted-foreground">Nessun locale trovato.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card/40">
          {locali.map((l) => (
            <li key={l.venueId}>
              <Link
                href={`/admin/integrazioni/locali/${l.venueId}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-card"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{l.nome}</span>
                  <span className="t-nota block">
                    {l.gruppo} · {l.slug}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{l.installate} installate</span>
                  {l.conProblemi > 0 && <span className="font-medium text-accent-strong">{l.conProblemi} con problemi</span>}
                  {l.assistenzeAperte > 0 && <span className="font-medium text-accent-strong">{l.assistenzeAperte} assistenza</span>}
                  {l.richiesteAperte > 0 && <span className="text-muted-foreground">{l.richiesteAperte} richieste</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
