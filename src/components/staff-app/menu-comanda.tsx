"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/euro";
import { chiedi } from "@/lib/staff-fetch";
import { useAvvisi } from "@/components/ui/avvisi";
import type { MenuCategoryView, MenuItemView } from "@/server/menu";
import type { ComandaView, OspiteView } from "@/server/comande/comande";
import { Foglio } from "./foglio";
import { FoglioPiatto, type PiattoDaPersonalizzare, type ScelteRiga } from "./foglio-piatto";

/**
 * **Il menu da telefono** — §10, §11, §36.
 *
 * ## I due gesti sulla stessa card
 *
 * - **il «+»** aggiunge il piatto com'è, in un tap. È la strada per il
 *   novanta per cento delle righe di una serata: una carbonara è una
 *   carbonara;
 * - **la card** apre la personalizzazione. È la strada per il resto.
 *
 * Due gesti sullo stesso oggetto sono di solito un errore di interfaccia. Qui
 * no, e la ragione è il §36: «Tavolo → Nuovo ordine → Carbonara → quantità →
 * Ospite 2 → nota → invia, con pochissimi tap». Se il tap sulla card aprisse
 * sempre un foglio, ogni acqua costerebbe tre tap invece di uno; se non lo
 * aprisse mai, la tagliata al sangue non si potrebbe battere.
 *
 * Il «+» è grande 44 px e sta a destra, dove il pollice arriva senza coprire
 * il nome del piatto.
 *
 * ## La ricerca prima delle categorie
 *
 * Chi sa cosa cerca scrive tre lettere; chi sfoglia usa le linguette. La
 * ricerca sta in cima perché è la strada più corta, e cerca **nel nome e
 * nella descrizione** — «vongole» trova gli spaghetti allo scoglio se la
 * descrizione le nomina.
 *
 * ## I piatti finiti restano in elenco
 *
 * Barrati e non premibili, non nascosti. Un cameriere che non trova la
 * carbonara pensa di aver sbagliato a cercare e la cerca di nuovo; uno che la
 * trova barrata sa cosa dire al tavolo.
 */

export function MenuComanda({
  aperto,
  onChiudi,
  comandaId,
  ospiti,
  comanda,
  onComandaAggiornata,
  onApriRiepilogo,
}: {
  aperto: boolean;
  onChiudi: () => void;
  comandaId: string;
  ospiti: OspiteView[];
  comanda: ComandaView | null;
  onComandaAggiornata: (c: ComandaView) => void;
  onApriRiepilogo: () => void;
}) {
  const avvisi = useAvvisi();
  const [categorie, setCategorie] = useState<MenuCategoryView[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [categoriaAttiva, setCategoriaAttiva] = useState<string | null>(null);
  const [daPersonalizzare, setDaPersonalizzare] = useState<PiattoDaPersonalizzare | null>(null);
  const [inCorso, setInCorso] = useState(false);
  /* Quale piatto sta partendo: serve a spegnere **quel** «+», non tutti. */
  const [inVolo, setInVolo] = useState<string | null>(null);
  const caricato = useRef(false);

  useEffect(() => {
    if (!aperto || caricato.current) return;
    caricato.current = true;
    chiedi<{ categorie: MenuCategoryView[] }>("/api/staff-app/menu")
      .then((d) => {
        setCategorie(d.categorie);
        setCategoriaAttiva(d.categorie[0]?.id ?? null);
      })
      .catch((e) => setErrore(e instanceof Error ? e.message : "Non riesco a leggere la carta."));
  }, [aperto]);

  const filtrati = useMemo(() => {
    if (!categorie) return [];
    const q = ricerca.trim().toLowerCase();
    if (q.length > 0) {
      /* Cercando si attraversano **tutte** le categorie: chi digita «vongole»
         non sta pensando a quale sezione della carta. */
      return categorie.flatMap((c) =>
        c.items
          .filter(
            (i) =>
              i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q),
          )
          .map((i) => ({ categoria: c.name, item: i })),
      );
    }
    const categoria = categorie.find((c) => c.id === categoriaAttiva) ?? categorie[0];
    return (categoria?.items ?? []).map((i) => ({ categoria: categoria!.name, item: i }));
  }, [categorie, ricerca, categoriaAttiva]);

  async function aggiungi(item: MenuItemView, scelte?: ScelteRiga) {
    if (inVolo) return;
    setInVolo(item.id);
    setInCorso(true);
    try {
      const aggiornata = await chiedi<ComandaView>(`/api/staff-app/comande/${comandaId}/righe`, {
        metodo: "POST",
        corpo: {
          menuItemId: item.id,
          quantity: scelte?.quantity ?? 1,
          orderGuestId: scelte?.orderGuestId ?? null,
          modifiche: scelte?.modifiche ?? [],
          notes: scelte?.notes ?? null,
          allergeni: scelte?.allergeni ?? [],
          notaAllergia: scelte?.notaAllergia ?? null,
        },
      });
      onComandaAggiornata(aggiornata);
      setDaPersonalizzare(null);
      /* §37: feedback piccolo e chiaro, non una modale. Il nome del piatto
         perché in una sequenza rapida di tap è l'unica conferma di aver
         premuto quello giusto. */
      avvisi.mostra(
        scelte && scelte.quantity > 1 ? `${scelte.quantity} × ${item.name}` : item.name,
      );
    } catch (e) {
      avvisi.problema(e instanceof Error ? e.message : "Non è stato possibile aggiungere il piatto.");
    } finally {
      setInVolo(null);
      setInCorso(false);
    }
  }

  const articoli = comanda?.articoli ?? 0;
  const totale = comanda?.totalCents ?? 0;

  return (
    <>
      <Foglio
        aperto={aperto && !daPersonalizzare}
        onChiudi={onChiudi}
        titolo="Aggiungi ordine"
        altezza="alto"
        piede={
          /* §16: la barra della comanda è **sempre** raggiungibile durante la
             composizione. Spenta finché non c'è niente dentro, invece che
             assente: un pulsante che compare e scompare sposta tutto quello
             che gli sta sopra proprio mentre si tocca. */
          <button
            type="button"
            disabled={articoli === 0}
            onClick={onApriRiepilogo}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-full bg-cream px-5 text-base font-medium text-clay-ink transition-transform active:scale-[0.99] disabled:bg-secondary disabled:text-muted-foreground"
          >
            <span>
              {articoli === 0
                ? "Nessun articolo"
                : `Visualizza comanda · ${articoli} ${articoli === 1 ? "articolo" : "articoli"}`}
            </span>
            {articoli > 0 && <span className="tabular-nums">{euro(totale)}</span>}
          </button>
        }
      >
        <div className="space-y-3">
          <div className="sticky top-0 z-10 -mx-4 bg-card px-4 pb-2 pt-1">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
                placeholder="Cerca un piatto"
                aria-label="Cerca un piatto"
                className="min-h-[48px] w-full rounded-full border border-input bg-secondary pl-10 pr-10 text-base placeholder:text-muted-foreground"
              />
              {ricerca && (
                <button
                  type="button"
                  aria-label="Cancella la ricerca"
                  onClick={() => setRicerca("")}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {!ricerca && categorie && categorie.length > 0 && (
              /* Le categorie scorrono in orizzontale (§10). `-mx-4 px-4`
                 perché la fila arrivi fino al bordo dello schermo: una fila
                 che finisce prima del margine non sembra scorrevole. */
              <div
                role="tablist"
                aria-label="Categorie"
                className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {categorie.map((c) => (
                  <button
                    key={c.id}
                    role="tab"
                    type="button"
                    aria-selected={c.id === categoriaAttiva}
                    onClick={() => setCategoriaAttiva(c.id)}
                    className={cn(
                      "min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-4 text-sm transition-colors",
                      c.id === categoriaAttiva
                        ? "border-cream bg-cream font-medium text-clay-ink"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {errore && <p className="t-corpo text-destructive-soft">{errore}</p>}
          {!categorie && !errore && <p className="t-nota">Carico la carta…</p>}

          {categorie && filtrati.length === 0 && (
            <p className="t-nota py-6 text-center">
              {ricerca ? `Nessun piatto per «${ricerca}».` : "Questa categoria è vuota."}
            </p>
          )}

          <ul className="space-y-2">
            {filtrati.map(({ categoria, item }) => (
              <li key={item.id}>
                <CardPiatto
                  item={item}
                  categoria={ricerca ? categoria : null}
                  inVolo={inVolo === item.id}
                  onAggiungi={() => aggiungi(item)}
                  onApri={() =>
                    setDaPersonalizzare({
                      menuItemId: item.id,
                      nome: item.name,
                      descrizione: item.description,
                      priceCents: item.priceCents,
                      allergeniDelPiatto: item.allergens,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      </Foglio>

      <FoglioPiatto
        piatto={daPersonalizzare}
        ospiti={ospiti}
        inCorso={inCorso}
        onChiudi={() => setDaPersonalizzare(null)}
        onConferma={(scelte) => {
          const item = categorie
            ?.flatMap((c) => c.items)
            .find((i) => i.id === daPersonalizzare?.menuItemId);
          if (item) return aggiungi(item, scelte);
        }}
      />
    </>
  );
}

function CardPiatto({
  item,
  categoria,
  inVolo,
  onAggiungi,
  onApri,
}: {
  item: MenuItemView;
  categoria: string | null;
  inVolo: boolean;
  onAggiungi: () => void;
  onApri: () => void;
}) {
  const finito = !item.available;

  return (
    <div
      className={cn(
        "flex items-stretch gap-3 rounded-lg border border-border bg-card-sunken p-2.5",
        finito && "opacity-55",
      )}
    >
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      )}

      <button
        type="button"
        disabled={finito}
        onClick={onApri}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        {categoria && <span className="t-nota block">{categoria}</span>}
        <span className={cn("block text-sm font-medium", finito && "line-through")}>{item.name}</span>
        {item.description && (
          <span className="t-nota mt-0.5 line-clamp-2 block">{item.description}</span>
        )}
        <span className="t-dato mt-1 block">{euro(item.priceCents)}</span>
        {item.allergens.length > 0 && (
          <span className="t-nota mt-0.5 block truncate">
            Contiene: {item.allergens.join(", ").replace(/_/g, " ")}
          </span>
        )}
        {finito && <span className="t-nota mt-0.5 block text-accent-strong">Finito</span>}
      </button>

      <button
        type="button"
        aria-label={`Aggiungi ${item.name}`}
        disabled={finito || inVolo}
        onClick={onAggiungi}
        className="flex h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border border-border bg-secondary transition-transform active:scale-95 disabled:opacity-40"
      >
        <Plus className={cn("h-5 w-5", inVolo && "animate-pulse motion-reduce:animate-none")} aria-hidden="true" />
      </button>
    </div>
  );
}
