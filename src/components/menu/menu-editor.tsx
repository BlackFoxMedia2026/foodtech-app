"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  EyeOff,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
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
import { formatCurrency } from "@/lib/utils";
import { ALLERGENI, REGIMI, type MenuCategoryView, type MenuItemView } from "@/server/menu";
import { MenuItemDialog } from "@/components/menu/menu-item-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Il menu, da dentro.
 *
 * L'ordine si cambia con due frecce e non trascinando: durante un servizio si
 * lavora col pollice su un tablet, e il trascinamento è il gesto che sbaglia
 * più spesso. Le frecce sono anche l'unica versione che funziona con la
 * tastiera.
 *
 * Il margine compare solo dove il costo è dichiarato. È l'unico numero in euro
 * di questa applicazione che non è una stima: prezzo e costo li scrive il
 * locale, non li deduciamo noi.
 *
 * **Cercare e filtrare compaiono solo quando servono.** Su dodici piatti si
 * legge tutto; su centoventi, trovare «tagliata» scorrendo è il momento in cui
 * si smette di tenere aggiornato il menu. E quando un filtro è acceso le
 * frecce spariscono: riordinare un elenco parziale manderebbe al server un
 * ordine che non è quello vero.
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
}: {
  categorie: MenuCategoryView[];
  venueSlug: string;
  currency: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [nuovaCategoria, setNuovaCategoria] = useState("");
  const [dialogo, setDialogo] = useState<{ categoryId: string; categoryName: string; item?: MenuItemView } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutti");

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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Menu</h1>
          <p className="text-sm text-muted-foreground">
            Quello che i clienti leggono dal QR sul tavolo. Un piatto finito si segna non disponibile e sparisce
            dalla loro carta.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/m/${venueSlug}`} target="_blank" rel="noopener noreferrer">
            Vedi il menu pubblico <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </Button>
      </header>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {cercabile && (
        <div className="mt-5 space-y-2">
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              placeholder={`Cerca fra ${totalePiatti} piatti`}
              aria-label="Cerca un piatto"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTRI.map((f) => (
              <button
                key={f.chiave}
                type="button"
                aria-pressed={filtro === f.chiave}
                onClick={() => setFiltro(f.chiave)}
                className={`min-h-[36px] rounded-full border px-3 text-sm transition-colors ${
                  filtro === f.chiave
                    ? "border-cream bg-cream text-clay-ink"
                    : "border-border text-muted-foreground hover:bg-current/10"
                }`}
              >
                {f.etichetta}
              </button>
            ))}
            {filtrando && (
              <span className="text-sm text-muted-foreground">
                {trovati === 0
                  ? "Nessun piatto"
                  : `${trovati} ${trovati === 1 ? "piatto" : "piatti"} su ${totalePiatti}`}
                {" · "}
                <button type="button" onClick={() => { setRicerca(""); setFiltro("tutti"); }} className="underline">
                  mostra tutto
                </button>
              </span>
            )}
          </div>

          {filtrando && (
            <p className="text-xs text-tertiary-foreground">
              Mentre cerchi, l&apos;ordine non si cambia: spostare un piatto in un elenco parziale
              riscriverebbe l&apos;ordine vero con quello che vedi adesso.
            </p>
          )}
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
        <div className="mt-6 space-y-4">
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
                      {c.items.map((i, indice) => (
                        <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={i.available ? "font-medium" : "font-medium line-through opacity-60"}>
                                {i.name}
                              </span>
                              <span className="tabular-nums">{formatCurrency(i.priceCents, currency)}</span>
                              {!i.available && <Badge tone="warning">Finito</Badge>}
                              {i.marginPct != null && (
                                <span className="text-xs text-muted-foreground">
                                  margine {formatCurrency(i.marginCents!, currency)} · {i.marginPct}%
                                </span>
                              )}
                            </div>

                            {i.description && (
                              <p className="mt-0.5 text-sm text-muted-foreground">{i.description}</p>
                            )}

                            {(i.allergens.length > 0 || i.dietary.length > 0) && (
                              <p className="mt-1 text-xs text-tertiary-foreground">
                                {i.allergens.length > 0 && (
                                  <>Allergeni: {i.allergens.map((a) => ALLERGENI[a]).join(", ")}</>
                                )}
                                {i.allergens.length > 0 && i.dietary.length > 0 && " · "}
                                {i.dietary.map((d) => REGIMI[d]).join(", ")}
                              </p>
                            )}
                          </div>

                          {/*
                            Su telefono un piatto portava **quattro** pulsanti
                            a icona: su, giù, modifica, elimina. Quattro
                            bersagli da 36 px per riga su un elenco di
                            centoventi piatti è un muro di frecce, e il piatto
                            — che è la cosa importante — diventa il testo
                            fra le icone.
                            
                            Da telefono c'è un solo pulsante «⋯» con le stesse
                            azioni scritte a parole; da tablet in su restano in
                            fila, dove il mouse le raggiunge senza aprire
                            niente.
                          */}
                          {canEdit && (
                            <MenuAzioniPiatto
                              nome={i.name}
                              disponibile={i.available}
                              primo={indice === 0}
                              ultimo={indice === c.items.length - 1}
                              filtrando={filtrando}
                              occupato={busy !== null}
                              onModifica={() => setDialogo({ categoryId: c.id, categoryName: c.name, item: i })}
                              onSu={() => sposta("piatti", idPiatti, indice, indice - 1)}
                              onGiu={() => sposta("piatti", idPiatti, indice, indice + 1)}
                              onDisponibilita={() =>
                                chiama(
                                  i.id,
                                  `/api/menu/items/${i.id}`,
                                  json({ available: !i.available }),
                                  "Non siamo riusciti ad aggiornare il piatto.",
                                )
                              }
                              onElimina={() =>
                                chiama(
                                  i.id,
                                  `/api/menu/items/${i.id}`,
                                  { method: "DELETE" },
                                  "Non siamo riusciti a eliminare il piatto.",
                                )
                              }
                            />
                          )}

                          {canEdit && (
                            <div className="hidden items-center gap-1 md:flex">
                              {!filtrando && (
                              <>
                              <button
                                type="button"
                                aria-label={`Sposta ${i.name} in su`}
                                disabled={indice === 0 || busy !== null}
                                onClick={() => sposta("piatti", idPiatti, indice, indice - 1)}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10 disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Sposta ${i.name} in giù`}
                                disabled={indice === c.items.length - 1 || busy !== null}
                                onClick={() => sposta("piatti", idPiatti, indice, indice + 1)}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10 disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              </>
                              )}
                              <button
                                type="button"
                                aria-label={`Modifica ${i.name}`}
                                disabled={busy !== null}
                                onClick={() =>
                                  setDialogo({ categoryId: c.id, categoryName: c.name, item: i })
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Elimina ${i.name}`}
                                disabled={busy !== null}
                                onClick={() =>
                                  chiama(
                                    i.id,
                                    `/api/menu/items/${i.id}`,
                                    { method: "DELETE" },
                                    "Non siamo riusciti a eliminare il piatto.",
                                  )
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialogo({ categoryId: c.id, categoryName: c.name })}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi un piatto
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

      {dialogo && (
        <MenuItemDialog
          open
          onOpenChange={(v) => !v && setDialogo(null)}
          categoryId={dialogo.categoryId}
          categoryName={dialogo.categoryName}
          item={dialogo.item}
        />
      )}
    </>
  );
}

/**
 * Le azioni di un piatto, da telefono: un pulsante e le voci scritte.
 *
 * Le stesse quattro azioni della fila da scrivania, più una che da telefono
 * serve più di tutte: **segnare un piatto finito**. È il gesto che si fa in
 * cucina alle nove di sera con una mano, ed era raggiungibile solo aprendo
 * la scheda del piatto.
 *
 * Le voci sono **parole, non icone**: dentro un menù non c'è l'ambiguità di
 * un simbolo, e «Elimina il piatto» dice più di un cestino. Sta in fondo,
 * dopo una riga di separazione, perché è l'unica che non si disfa.
 *
 * Le frecce non compaiono mentre un filtro è acceso, per la stessa ragione
 * per cui spariscono dalla fila: riordinare un elenco parziale manderebbe al
 * server un ordine che non è quello vero.
 */
function MenuAzioniPiatto({
  nome,
  disponibile,
  primo,
  ultimo,
  filtrando,
  occupato,
  onModifica,
  onSu,
  onGiu,
  onDisponibilita,
  onElimina,
}: {
  nome: string;
  disponibile: boolean;
  primo: boolean;
  ultimo: boolean;
  filtrando: boolean;
  occupato: boolean;
  onModifica: () => void;
  onSu: () => void;
  onGiu: () => void;
  onDisponibilita: () => void;
  onElimina: () => void;
}) {
  return (
    <div className="md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Azioni per ${nome}`}
          disabled={occupato}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10 disabled:opacity-40"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onModifica} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDisponibilita} className="flex items-center gap-2">
            {disponibile ? (
              <>
                <EyeOff className="h-4 w-4" aria-hidden="true" /> Segna come finito
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Rimetti disponibile
              </>
            )}
          </DropdownMenuItem>
          {!filtrando && (
            <>
              <DropdownMenuItem onSelect={onSu} disabled={primo} className="flex items-center gap-2">
                <ArrowUp className="h-4 w-4" aria-hidden="true" /> Sposta in su
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onGiu} disabled={ultimo} className="flex items-center gap-2">
                <ArrowDown className="h-4 w-4" aria-hidden="true" /> Sposta in giù
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onElimina} className="flex items-center gap-2 text-accent">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina il piatto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
