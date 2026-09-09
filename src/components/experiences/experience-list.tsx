"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { readApiError } from "@/lib/api-client";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { ExperienceDialog } from "@/components/experiences/experience-dialog";
import type { ExperienceView } from "@/server/experiences";

/**
 * Il programma del locale.
 *
 * Prima c'era la stessa lista con un pulsante «Nuova esperienza» che non
 * apriva niente, e una barra di riempimento sui biglietti venduti — sempre a
 * zero, perché nessuno può venderli da qui. Le due cose insieme facevano
 * sembrare finito quello che non era nemmeno iniziato.
 *
 * Ora si creano, si modificano e si pubblicano; i biglietti si comprano dove
 * li vende il locale, col suo link, e questa pagina lo dice invece di
 * mostrare un contatore vuoto.
 */
export function ExperienceList({
  items,
  currency,
  canEdit,
  adesso,
}: {
  items: ExperienceView[];
  currency: string;
  canEdit: boolean;
  /** L'ora del server, in ISO: vedi il commento nella pagina. */
  adesso: string;
}) {
  const router = useRouter();
  const [nuova, setNuova] = useState(false);
  const [inModifica, setInModifica] = useState<ExperienceView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function chiama(id: string, init: RequestInit, fallback: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/experiences/${id}`, init);
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, fallback));
      return;
    }
    router.refresh();
  }

  const pubblica = (e: ExperienceView, published: boolean) =>
    chiama(
      e.id,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published }),
      },
      "Non siamo riusciti a cambiare lo stato.",
    );

  const elimina = (e: ExperienceView) =>
    chiama(e.id, { method: "DELETE" }, "Non siamo riusciti a eliminare l'esperienza.");

  /*
    Una scheda sola, per la serata che conta: quella in corso o la prima che
    arriva. Tutto il resto sono righe.

    Prima erano tutte schede uguali in una griglia, e la griglia le allungava
    fino all'altezza della più alta: due esperienze occupavano due riquadri da
    novecento pixel di cui seicento vuoti, e per sapere quando fosse la
    prossima si leggevano le date una per una. La differenza fra «giovedì c'è
    la degustazione» e «a marzo c'era la serata Piemonte» non è una differenza
    di dettaglio: è tutta l'informazione che questa pagina deve dare.

    E le righe passate stanno in fondo, non in cima. L'elenco arriva ordinato
    per data crescente — giusto per un archivio, sbagliato per un programma,
    dove la prima cosa che si legge era la serata più vecchia.
  */
  const ora = new Date(adesso).getTime();
  const daVenire = items.filter((e) => new Date(e.endsAt).getTime() >= ora);
  const passate = items
    .filter((e) => new Date(e.endsAt).getTime() < ora)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const prossima = daVenire[0] ?? null;
  const altreDaVenire = daVenire.slice(1);

  return (
    <>
      <header className="fissa flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Programma</p>
          <h1 className="text-display text-3xl">Esperienze</h1>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "Nessuna esperienza in calendario"
              : `${items.length} ${items.length === 1 ? "esperienza" : "esperienze"} in calendario`}
          </p>
        </div>
        {canEdit && (
          <Button variant="accent" onClick={() => setNuova(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuova esperienza
          </Button>
        )}
      </header>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <div className="fill mt-6">
          <EmptyState
            icon={Sparkles}
            title="Nessuna esperienza"
            action={
              canEdit ? (
                <Button variant="accent" onClick={() => setNuova(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Crea la prima
                </Button>
              ) : undefined
            }
          >
            Una cena a tema, una degustazione, una serata con il produttore: qui si tiene il programma, e si
            pubblica quando è pronto.
          </EmptyState>
        </div>
      ) : (
        <div className="fill-scroll mt-4 space-y-4 pr-0.5">
          {prossima && (
            /* Larghezza contenuta: una scheda che attraversa millenovecento
               pixel per quattro righe di contenuto è per tre quarti vuota. */
            <Card className="lg:max-w-3xl">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {new Date(prossima.startsAt).getTime() <= ora ? "In corso" : "La prossima"}
                    {!prossima.published && " · bozza"}
                  </div>
                  {canEdit && <InterruttorePubblica e={prossima} busy={busy} pubblica={pubblica} />}
                </div>
                <CardTitle>{prossima.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{formatDateTime(prossima.startsAt)}</p>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 text-sm">
                {prossima.description && <p className="text-muted-foreground">{prossima.description}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gold">{formatCurrency(prossima.priceCents, currency)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {prossima.capacity} {prossima.capacity === 1 ? "posto" : "posti"}
                  </span>
                  {prossima.ticketsSold > 0 && (
                    <span className="text-xs text-muted-foreground">· {prossima.ticketsSold} venduti</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {prossima.ticketUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={prossima.ticketUrl} target="_blank" rel="noopener noreferrer">
                        Biglietti <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-tertiary-foreground">Nessun link ai biglietti</span>
                  )}
                  {canEdit && <Comandi e={prossima} busy={busy} onModifica={setInModifica} onElimina={elimina} />}
                </div>
              </CardContent>
            </Card>
          )}

          {altreDaVenire.length > 0 && (
            <Gruppo titolo="In programma">
              {altreDaVenire.map((e) => (
                <Riga
                  key={e.id}
                  e={e}
                  currency={currency}
                  canEdit={canEdit}
                  busy={busy}
                  pubblica={pubblica}
                  onModifica={setInModifica}
                  onElimina={elimina}
                />
              ))}
            </Gruppo>
          )}

          {passate.length > 0 && (
            <Gruppo titolo={passate.length === 1 ? "Una passata" : `${passate.length} passate`}>
              {passate.map((e) => (
                <Riga
                  key={e.id}
                  e={e}
                  currency={currency}
                  canEdit={canEdit}
                  busy={busy}
                  passata
                  pubblica={pubblica}
                  onModifica={setInModifica}
                  onElimina={elimina}
                />
              ))}
            </Gruppo>
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-tertiary-foreground">
        I biglietti non si vendono da Tavolo: servono i pagamenti, che arriveranno con le caparre. Nel frattempo
        il link porta dove li vendi tu.
      </p>

      {nuova && <ExperienceDialog open onOpenChange={(v) => !v && setNuova(false)} />}
      {inModifica && (
        <ExperienceDialog
          open
          onOpenChange={(v) => !v && setInModifica(null)}
          experience={inModifica}
        />
      )}
    </>
  );
}

/** Il gruppo di righe, con la sua intestazione. */
function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="t-etichetta mb-1.5">{titolo}</h2>
      <ul className="riquadro divide-y divide-border">{children}</ul>
    </section>
  );
}

/**
 * Una serata in una riga: data, titolo, prezzo, posti, stato.
 *
 * Da `md` è una griglia e non un flex che va a capo, così le date e i prezzi
 * si incolonnano e l'elenco si legge per colonna invece che riga per riga.
 */
function Riga({
  e,
  currency,
  canEdit,
  busy,
  passata = false,
  pubblica,
  onModifica,
  onElimina,
}: {
  e: ExperienceView;
  currency: string;
  canEdit: boolean;
  busy: string | null;
  passata?: boolean;
  pubblica: (e: ExperienceView, published: boolean) => void;
  onModifica: (e: ExperienceView) => void;
  onElimina: (e: ExperienceView) => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 md:grid md:grid-cols-[11rem_minmax(0,1fr)_6rem_5rem_auto] md:items-center md:gap-x-3",
        // Una serata passata non si tinge di grigio per punizione: pesa meno
        // perché non c'è più niente da decidere.
        passata && "text-muted-foreground",
      )}
    >
      <span className="t-dato shrink-0">{formatDateTime(e.startsAt)}</span>

      <span className="min-w-0 basis-full md:basis-auto">
        <span className="t-titolo-scheda">{e.title}</span>
        {!e.published && <span className="t-nota"> · bozza</span>}
      </span>

      <span className="t-dato shrink-0 text-accent">{formatCurrency(e.priceCents, currency)}</span>

      <span className="t-nota shrink-0">
        {e.capacity} {e.capacity === 1 ? "posto" : "posti"}
        {e.ticketsSold > 0 && ` · ${e.ticketsSold} venduti`}
      </span>

      <span className="flex shrink-0 items-center gap-1">
        {e.ticketUrl && (
          <Button asChild variant="ghost" size="sm">
            <a
              href={e.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Biglietti di ${e.title}`}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        )}
        {canEdit && (
          <>
            <InterruttorePubblica e={e} busy={busy} pubblica={pubblica} />
            <Comandi e={e} busy={busy} onModifica={onModifica} onElimina={onElimina} />
          </>
        )}
      </span>
    </li>
  );
}

/** Pubblica o riporta in bozza. L'etichetta dice quale delle due, per nome. */
function InterruttorePubblica({
  e,
  busy,
  pubblica,
}: {
  e: ExperienceView;
  busy: string | null;
  pubblica: (e: ExperienceView, published: boolean) => void;
}) {
  return (
    <label
      htmlFor={`pub-${e.id}`}
      className="flex min-h-[44px] cursor-pointer items-center gap-2 px-1"
      title={e.published ? "Riporta in bozza" : "Pubblica"}
    >
      <Switch
        id={`pub-${e.id}`}
        checked={e.published}
        disabled={busy === e.id}
        aria-label={e.published ? `Riporta in bozza ${e.title}` : `Pubblica ${e.title}`}
        onCheckedChange={(v) => void pubblica(e, v)}
      />
    </label>
  );
}

function Comandi({
  e,
  busy,
  onModifica,
  onElimina,
}: {
  e: ExperienceView;
  busy: string | null;
  onModifica: (e: ExperienceView) => void;
  onElimina: (e: ExperienceView) => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onModifica(e)}
        disabled={busy === e.id}
        aria-label={`Modifica ${e.title}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onElimina(e)}
        disabled={busy === e.id}
        aria-label={`Elimina ${e.title}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </>
  );
}
