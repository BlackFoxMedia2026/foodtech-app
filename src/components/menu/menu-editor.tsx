"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { readApiError } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import {
  nomeAllergene,
  nomeRegime,
  type MenuCategoryView,
  type MenuItemView,
} from "@/server/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Il menu, da dentro.
 *
 * **La lista mostra il piatto, non il conto.** Il margine stava sulla riga
 * accanto al prezzo — «margine 11,50 € · 72%» — ed è il numero di
 * un'altra domanda: quando si apre la carta si cerca un piatto per cambiarne
 * il prezzo o per segnarlo finito, non per valutarne la resa. Costo e margine
 * restano dove si scrivono e dove si leggono davvero: nella scheda del piatto
 * e in Analisi. Il filtro «Senza costo» continua a funzionare — legge lo
 * stesso dato, che qui non si stampa.
 *
 * **Due comandi per riga.** Erano quattro — su, giù, modifica, elimina — e il
 * cestino accanto alla matita è il modo in cui si cancella un piatto volendo
 * cambiargli il prezzo. Restano l'interruttore della disponibilità, che è il
 * gesto che si fa ogni sera in cucina, e «Modifica», che porta alla scheda:
 * lì stanno ordine, foto, allergeni ed eliminazione.
 *
 * L'ordine delle **categorie** si cambia ancora con due frecce e non
 * trascinando: durante un servizio si lavora col pollice su un tablet, e il
 * trascinamento è il gesto che sbaglia più spesso. Le frecce sono anche
 * l'unica versione che funziona con la tastiera.
 *
 * **Cercare e filtrare compaiono solo quando servono.** Su dodici piatti si
 * legge tutto; su centoventi, trovare «tagliata» scorrendo è il momento in cui
 * si smette di tenere aggiornato il menu. E quando un filtro è acceso le
 * frecce delle categorie spariscono: riordinare un elenco parziale manderebbe
 * al server un ordine che non è quello vero.
 */

/** Da quanti piatti in su la ricerca serve più di quanto ingombri. */
const SOGLIA_RICERCA = 12;

/** Senza accenti e in minuscolo: «purè» si trova scrivendo «pure». */
function normalizza(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const FILTRI = [
  { chiave: "tutti", etichetta: "Tutti" },
  { chiave: "finiti", etichetta: "Finiti" },
  { chiave: "senza_costo", etichetta: "Senza costo" },
  { chiave: "nascosti", etichetta: "Nascosti" },
] as const;

type Filtro = (typeof FILTRI)[number]["chiave"];
export function MenuEditor({
  categorie,
  venueSlug,
  currency,
  canEdit,
  filtroIniziale,
  letture,
}: {
  categorie: MenuCategoryView[];
  venueSlug: string;
  currency: string;
  canEdit: boolean;
  /**
   * Quante volte la carta è stata letta, e quante dal QR sul tavolo.
   *
   * Diviso in due perché sono due domande diverse: «la gente inquadra il
   * codice?» e «il link che ho messo su Instagram funziona?». Il numero c'è
   * solo da quando si è cominciato a contare (21 settembre 2026), e la
   * schermata lo dice invece di far credere che sia sempre stato così.
   */
  letture?: { totale: number; dalQr: number; giorni: number };
  /** Il filtro con cui aprire la carta, da `?filtro=` — vedi la nota sotto. */
  filtroIniziale?: string;
}) {
  const router = useRouter();
  const [nuovaCategoria, setNuovaCategoria] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState("");
  /*
    Il filtro iniziale può arrivare dall'indirizzo.

    Serve perché Analisi ora dice «cinque piatti non hanno un costo
    dichiarato → completali», e quel collegamento deve arrivare sulla carta
    **con il filtro già acceso**: un'azione che porta su una lista di quaranta
    piatti e lascia a chi legge il compito di ritrovare i cinque non è
    un'azione, è un rimando.

    Resta stato del client per l'interazione: cambiando filtro non si naviga.
    L'indirizzo è il punto di ingresso, non il padrone.
  */
  const [filtro, setFiltro] = useState<Filtro>(
    FILTRI.some((f) => f.chiave === filtroIniziale) ? (filtroIniziale as Filtro) : "tutti",
  );
  /* Il popover dei filtri si chiude appena se ne sceglie uno: la scelta è
     una sola, e restare aperto sopra la lista nasconde proprio il risultato
     che si è appena chiesto di vedere. */
  const [filtriAperti, setFiltriAperti] = useState(false);

  async function chiama(chiave: string, url: string, init: RequestInit, fallback: string) {
    setBusy(chiave);
    setError(null);
    const res = await fetch(url, init);
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, fallback));
      return false;
    }
    router.refresh();
    return true;
  }

  const json = (body: unknown): RequestInit => ({
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  async function aggiungiCategoria() {
    if (!nuovaCategoria.trim()) return;
    const ok = await chiama(
      "nuova",
      "/api/menu/categories",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nuovaCategoria.trim() }),
      },
      "Non siamo riusciti a creare la categoria.",
    );
    if (ok) setNuovaCategoria("");
  }

  /** Sposta un elemento di un posto, e manda l'ordine completo. */
  async function sposta(cosa: "categorie" | "piatti", ids: string[], da: number, verso: number) {
    if (verso < 0 || verso >= ids.length) return;
    const nuovo = [...ids];
    [nuovo[da], nuovo[verso]] = [nuovo[verso], nuovo[da]];
    await chiama(
      `ordine-${ids[da]}`,
      "/api/menu/reorder",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cosa, ids: nuovo }),
      },
      "Non siamo riusciti a cambiare l'ordine.",
    );
  }

  const idCategorie = categorie.map((c) => c.id);

  /* ------------------------------------------------------------------ */
  /*  Cercare e filtrare                                                */
  /* ------------------------------------------------------------------ */

  const totalePiatti = categorie.reduce((n, c) => n + c.items.length, 0);
  const cercabile = totalePiatti >= SOGLIA_RICERCA;
  const q = normalizza(ricerca.trim());
  const filtrando = q !== "" || filtro !== "tutti";

  function tieni(i: MenuItemView, categoriaAttiva: boolean) {
    if (q && !normalizza(`${i.name} ${i.description ?? ""}`).includes(q)) return false;
    if (filtro === "finiti") return !i.available;
    if (filtro === "senza_costo") return i.marginPct == null;
    if (filtro === "nascosti") return !categoriaAttiva;
    return true;
  }

  const visibili = filtrando
    ? categorie
        .map((c) => ({ ...c, items: c.items.filter((i) => tieni(i, c.active)) }))
        .filter((c) => c.items.length > 0)
    : categorie;

  const trovati = visibili.reduce((n, c) => n + c.items.length, 0);

  return (
    <>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/*
        Una riga sola: cerca a sinistra, comandi a destra.

        La barra è la prima cosa della pagina: il titolo lo dice la testata, e
        la frase che spiegava a cosa serve il menu era una riga che si legge
        una volta sola e poi si scavalca ogni giorno.

        Prima erano tre righe — ricerca, quattro pillole di filtro, il
        collegamento al menu pubblico in testata — e occupavano in verticale
        quanto due piatti. I quattro filtri stanno dentro un popover perché è
        raro che se ne cambi uno: il novanta per cento delle volte si scrive
        un nome. Quello che si usa sempre prende lo spazio, quello che si usa
        di rado prende un'icona.
      */}
      <TooltipProvider delayDuration={200}>
        <div className="fissa flex items-center gap-2">
          {cercabile ? (
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
                placeholder={`Cerca fra ${totalePiatti} piatti`}
                aria-label="Cerca un piatto"
                className="h-12 rounded-lg pl-10 pr-3 text-sm"
              />
            </div>
          ) : (
            /* Sotto la soglia la ricerca non serve, ma la riga resta: il
               menu pubblico si apre da qui in ogni caso. */
            <div className="min-w-0 flex-1" />
          )}

          {cercabile && (
            <Popover open={filtriAperti} onOpenChange={setFiltriAperti}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={
                        filtro === "tutti"
                          ? "Filtri"
                          : `Filtri — attivo: ${FILTRI.find((f) => f.chiave === filtro)?.etichetta}`
                      }
                      className={cn(
                        "relative grid h-12 w-12 shrink-0 place-items-center rounded-lg border transition-colors",
                        filtro === "tutti"
                          ? "border-border text-muted-foreground hover:border-cream/40 hover:text-foreground"
                          : "border-accent text-accent-strong",
                      )}
                    >
                      <SlidersHorizontal className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
                      {/* Un filtro acceso si vede anche senza aprire il popover. */}
                      {filtro !== "tutti" && (
                        <span
                          className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-accent-strong"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Filtri</TooltipContent>
              </Tooltip>

              <PopoverContent align="end" className="w-56 p-1.5">
                <p className="px-2 pb-1.5 pt-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Mostra
                </p>
                {FILTRI.map((f) => (
                  <button
                    key={f.chiave}
                    type="button"
                    aria-pressed={filtro === f.chiave}
                    onClick={() => {
                      setFiltro(f.chiave);
                      setFiltriAperti(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      filtro === f.chiave
                        ? "bg-cream text-clay-ink"
                        : "text-muted-foreground hover:bg-current/10 hover:text-foreground",
                    )}
                  >
                    {f.etichetta}
                    {filtro === f.chiave && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`/m/${venueSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Vedi il menu pubblico"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-cream/40 hover:text-foreground"
              >
                <ExternalLink className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Vedi il menu pubblico</TooltipContent>
          </Tooltip>
        </div>

        {letture && letture.totale > 0 && (
          /* Si mostra **solo quando c'è un numero**: «letta 0 volte» non è
             un'informazione, è una tabella vuota che sembra un fallimento. */
          <p className="t-nota">
            Letta <strong>{letture.totale}</strong>{" "}
            {letture.totale === 1 ? "volta" : "volte"} negli ultimi{" "}
            {letture.giorni} giorni
            {letture.dalQr > 0 && <> · {letture.dalQr} dal QR sul tavolo</>}.
            Una lettura per telefono al giorno: chi riapre la carta fra i
            secondi e il dolce conta una volta.
          </p>
        )}
      </TooltipProvider>

      {cercabile && filtrando && (
        <div className="fissa mt-2 space-y-1">
          <p className="text-sm text-muted-foreground">
            {trovati === 0
              ? "Nessun piatto"
              : `${trovati} ${trovati === 1 ? "piatto" : "piatti"} su ${totalePiatti}`}
            {" · "}
            <button
              type="button"
              onClick={() => {
                setRicerca("");
                setFiltro("tutti");
              }}
              className="underline"
            >
              mostra tutto
            </button>
          </p>
          <p className="t-nota">
            Mentre cerchi, l&apos;ordine non si cambia: spostare un piatto in un elenco parziale
            riscriverebbe l&apos;ordine vero con quello che vedi adesso.
          </p>
        </div>
      )}
      {categorie.length === 0 ? (
        <div className="mt-6 space-y-4">
          <EmptyState icon={UtensilsCrossed} title="Il menu è vuoto">
            Si comincia dalle categorie — antipasti, primi, dolci — e dentro ognuna si aggiungono i piatti con
            prezzo e allergeni. Quello che scrivi qui è quello che legge il cliente.
          </EmptyState>
          {canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                value={nuovaCategoria}
                onChange={(e) => setNuovaCategoria(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void aggiungiCategoria()}
                placeholder="Es. Antipasti"
                className="w-56"
                aria-label="Nome della prima categoria"
              />
              <Button variant="accent" onClick={aggiungiCategoria} disabled={busy === "nuova"}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Crea la prima categoria
              </Button>
            </div>
          )}
        </div>
      ) : (
        // L'elenco dei piatti non ha una lunghezza massima: scorre lui.
        <div className="fill-scroll mt-3 space-y-4 pr-0.5">
          {filtrando && visibili.length === 0 && (
            <p className="riquadro p-4 text-sm text-muted-foreground">
              Nessun piatto con questo nome o in questa condizione.
            </p>
          )}

          {visibili.map((c, indiceCategoria) => {
            const idPiatti = c.items.map((i) => i.id);
            return (
              <Card key={c.id}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                  <div className="flex items-center gap-2">
                    <CardTitle>{c.name}</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {c.items.length} {c.items.length === 1 ? "piatto" : "piatti"}
                    </span>
                    {!c.active && <Badge tone="neutral">Nascosta</Badge>}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      {!filtrando && (
                      <>
                      <button
                        type="button"
                        aria-label={`Sposta ${c.name} in su`}
                        disabled={indiceCategoria === 0 || busy !== null}
                        onClick={() => sposta("categorie", idCategorie, indiceCategoria, indiceCategoria - 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Sposta ${c.name} in giù`}
                        disabled={indiceCategoria === categorie.length - 1 || busy !== null}
                        onClick={() => sposta("categorie", idCategorie, indiceCategoria, indiceCategoria + 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      </>
                      )}

                      <label
                        htmlFor={`cat-attiva-${c.id}`}
                        className="flex min-h-[44px] cursor-pointer items-center gap-2 px-2"
                        title={c.active ? "Nascondi dal menu del cliente" : "Mostra nel menu del cliente"}
                      >
                        <Switch
                          id={`cat-attiva-${c.id}`}
                          checked={c.active}
                          disabled={busy !== null}
                          aria-label={c.active ? `Nascondi ${c.name}` : `Mostra ${c.name}`}
                          onCheckedChange={(v) =>
                            chiama(
                              c.id,
                              `/api/menu/categories/${c.id}`,
                              json({ active: v }),
                              "Non siamo riusciti a cambiare la categoria.",
                            )
                          }
                        />
                      </label>

                      <button
                        type="button"
                        aria-label={`Elimina ${c.name}`}
                        disabled={busy !== null}
                        onClick={() =>
                          chiama(
                            c.id,
                            `/api/menu/categories/${c.id}`,
                            { method: "DELETE" },
                            "Non siamo riusciti a eliminare la categoria.",
                          )
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-2">
                  {c.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nessun piatto in questa categoria.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {c.items.map((i) => (
                        <li key={i.id} className="flex items-start gap-3 py-4 sm:items-center sm:gap-4">
                          {/*
                            La foto, e perché è grande.

                            Una carta si gestisce riconoscendo i piatti, non
                            leggendoli: chi ci lavora dentro sa già cosa c'è
                            scritto. Una miniatura da 40 px non fa
                            riconoscere niente — è un'icona travestita da
                            foto — quindi qui è un rettangolo 4:3 che occupa
                            spazio davvero. Misura fissa per tutti: righe di
                            altezza diversa si scorrono peggio di righe
                            uguali.
                          */}
                          <div className="riquadro relative aspect-[4/3] w-24 shrink-0 overflow-hidden bg-secondary/40 sm:w-32 md:w-40 lg:w-44">
                            {i.imageUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={i.imageUrl}
                                alt=""
                                className={cn(
                                  "h-full w-full object-cover",
                                  !i.available && "opacity-45 grayscale",
                                )}
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-muted-foreground">
                                <UtensilsCrossed className="h-6 w-6 opacity-40" aria-hidden="true" />
                              </div>
                            )}
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                {/* Il nome è il titolo della riga: più grande
                                    di tutto il resto. Il prezzo gli sta
                                    accanto in terracotta — si legge subito,
                                    ma non compete. */}
                                <span
                                  className={cn(
                                    "t-titolo-scheda text-base md:text-lg",
                                    !i.available && "line-through opacity-60",
                                  )}
                                >
                                  {i.name}
                                </span>
                                <span className="tabular-nums text-accent-strong">
                                  {formatCurrency(i.priceCents, currency)}
                                </span>
                                {!i.available && <Badge tone="warning">Finito</Badge>}
                              </div>

                              {i.description && (
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                  {i.description}
                                </p>
                              )}

                              {/*
                                Nello stesso ordine e con le stesse parole della
                                pagina che legge il cliente (`/m/[slug]`): qui si
                                deve vedere **quello che vede lui**.

                                Prima era «Allergeni: Latte · Vegetariano, Senza
                                glutine»: i due elenchi erano attaccati sotto
                                l'unica etichetta «Allergeni», e vegetariano non
                                è un allergene. Su una faccenda dove la parola
                                sbagliata conta, la forma la decide la pagina
                                pubblica, non l'editor.
                              */}
                              {(i.dietary.length > 0 || i.allergens.length > 0) && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {i.dietary.map((d) => (
                                    <span
                                      key={d}
                                      className="rounded-full border border-sage/40 bg-sage/15 px-2.5 py-0.5 text-xs text-cream"
                                    >
                                      {nomeRegime(d)}
                                    </span>
                                  ))}
                                  {i.allergens.length > 0 && (
                                    <span className="t-nota">
                                      Contiene: {i.allergens.map(nomeAllergene).join(" · ")}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/*
                              Due comandi, non quattro.

                              Frecce ed eliminazione sono passate nella scheda
                              del piatto: qui restavano quattro bersagli per
                              riga, e il cestino accanto a «modifica» è il modo
                              in cui si cancella un piatto volendone cambiare
                              il prezzo. Quello che resta è quello che si fa
                              ogni giorno — segnare un piatto finito — e la
                              porta per tutto il resto.
                            */}
                            {canEdit && (
                              <div className="flex shrink-0 items-center gap-3">
                                <label
                                  htmlFor={`piatto-disp-${i.id}`}
                                  className="flex min-h-[44px] cursor-pointer items-center px-1"
                                  title={i.available ? "Segna come finito" : "Rimetti disponibile"}
                                >
                                  <Switch
                                    id={`piatto-disp-${i.id}`}
                                    checked={i.available}
                                    disabled={busy !== null}
                                    aria-label={
                                      i.available ? `Segna ${i.name} come finito` : `Rimetti ${i.name} disponibile`
                                    }
                                    onCheckedChange={() =>
                                      chiama(
                                        i.id,
                                        `/api/menu/items/${i.id}`,
                                        json({ available: !i.available }),
                                        "Non siamo riusciti ad aggiornare il piatto.",
                                      )
                                    }
                                  />
                                </label>

                                <Button asChild variant="outline" size="sm">
                                  <Link href={`/menu/${i.id}`}>
                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Modifica
                                  </Link>
                                </Button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {canEdit && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/menu/nuovo?categoria=${c.id}`}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi un piatto
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {canEdit && (
            <div className="flex flex-wrap items-end gap-2 pt-2">
              <Input
                value={nuovaCategoria}
                onChange={(e) => setNuovaCategoria(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void aggiungiCategoria()}
                placeholder="Es. Dolci"
                className="w-56"
                aria-label="Nome della nuova categoria"
              />
              <Button variant="outline" onClick={aggiungiCategoria} disabled={busy === "nuova"}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Nuova categoria
              </Button>
            </div>
          )}
        </div>
      )}

    </>
  );
}
