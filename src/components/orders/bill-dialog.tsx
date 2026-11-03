"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Minus,
  Plus,
  Receipt,
  Search,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import type { MenuCategoryView } from "@/server/menu";
import type { ContoChiuso, OrderView } from "@/server/orders";
import { BillPayments } from "@/components/orders/bill-payments";

/**
 * Il conto del tavolo.
 *
 * Il gesto che conta è **battere un piatto**, e durante un servizio si fa con
 * una mano: si tocca la foto del piatto, o si scrive una parola. Le linguette
 * delle categorie restringono la griglia, la ricerca la restringe di più.
 *
 * I piatti finiti si vedono **spenti**, non nascosti: chi cerca «tagliatelle»
 * deve capire che ci sono ma sono terminate, non pensare che manchino dal
 * menu e chiamare la cucina per chiedere.
 *
 * Il totale è la somma delle righe, e cambia sotto gli occhi a ogni tocco. Il
 * conto si chiude quando le persone pagano: da quel momento quel totale è un
 * **incasso**, e finisce nei numeri della giornata.
 *
 * Gift card e punti fedeltà non entrano fra le righe: le righe sono quello che
 * è stato mangiato, e serve così com'è al calcolo del costo del cibo. Sono
 * **modi di pagare**, e stanno sotto il totale insieme alla cifra che conta per
 * chi sta al tavolo: quanto resta da incassare.
 *
 * ## Il disegno (3 novembre 2026)
 *
 * Era una colonna da 512 px con tutto dentro — righe, totale, pagamenti,
 * ricerca, piatti — e su uno schermo stretto le cifre uscivano dal bordo e i
 * nomi dei piatti si tagliavano a metà. Adesso su scrivania e tablet sono
 * **due colonne**: a sinistra il conto, a destra i piatti con la loro foto,
 * ognuna che scorre per conto suo; il totale e il pulsante per incassare
 * restano sempre in vista. Sul telefono una colonna sola, col pulsante fisso
 * in fondo. I nomi vanno a capo su due righe invece di tagliarsi.
 */
export function BillDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
  currency,
  onChanged,
  onContoChiuso,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  guestName: string;
  currency: string;
  onChanged: () => void;
  /**
   * Il conto è stato chiuso. Il Servizio lo usa per liberare il tavolo
   * quando la finestra si chiude: chiudere il conto è il momento in cui il
   * tavolo ha finito, e premere anche «Libera» era un gesto in più.
   */
  onContoChiuso?: () => void;
}) {
  const [conto, setConto] = useState<OrderView | null>(null);
  const [menu, setMenu] = useState<MenuCategoryView[] | null>(null);
  const [cerca, setCerca] = useState("");
  /** La categoria scelta fra le linguette; nulla = tutte. */
  const [categoria, setCategoria] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cosa è appena successo chiudendo: i punti si annunciano, non si scoprono. */
  const [chiuso, setChiuso] = useState<ContoChiuso | null>(null);

  useEffect(() => {
    if (!open) return;
    let annullato = false;
    setError(null);
    setChiuso(null);

    (async () => {
      const [c, m] = await Promise.all([
        fetch("/api/orders/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bookingId }),
        }),
        fetch("/api/menu"),
      ]);
      if (annullato) return;

      if (!c.ok) {
        setError(
          await readApiError(c, "Non siamo riusciti ad aprire il conto."),
        );
        return;
      }
      setConto(await c.json());
      if (m.ok) setMenu(await m.json());
    })();

    return () => {
      annullato = true;
    };
  }, [open, bookingId]);

  /** Tutti i piatti in una lista piatta, con la loro categoria. */
  const piatti = useMemo(() => {
    if (!menu) return [];
    return menu.flatMap((c) =>
      c.items.map((i) => ({ ...i, categoria: c.name })),
    );
  }, [menu]);

  /* Tutti i piatti, filtrati per linguetta e per ricerca. Prima, senza
     ricerca, se ne vedevano otto: adesso la griglia scorre, e le foto rendono
     la scelta più veloce della lettura. */
  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return piatti.filter(
      (p) =>
        (categoria === null || p.categoria === categoria) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.categoria.toLowerCase().includes(q)),
    );
  }, [piatti, cerca, categoria]);

  const categorie = useMemo(
    () => (menu ?? []).filter((c) => c.items.length > 0).map((c) => c.name),
    [menu],
  );

  /** La foto di ogni piatto, per la miniatura accanto alla riga del conto. */
  const fotoDi = useMemo(
    () => new Map(piatti.map((p) => [p.id, p.imageUrl ?? null])),
    [piatti],
  );

  /** Quante porzioni di ogni piatto sono già sul conto: il badge sulla scheda. */
  const nelConto = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of conto?.righe ?? []) {
      if (r.menuItemId)
        m.set(r.menuItemId, (m.get(r.menuItemId) ?? 0) + r.quantity);
    }
    return m;
  }, [conto]);

  async function chiama(
    chiave: string,
    url: string,
    init: RequestInit,
    fallback: string,
  ) {
    setInCorso(chiave);
    setError(null);
    const res = await fetch(url, init);
    setInCorso(null);
    if (!res.ok) {
      setError(await readApiError(res, fallback));
      return null;
    }
    const aggiornato: OrderView = await res.json();
    setConto(aggiornato);
    onChanged();
    return aggiornato;
  }

  const aggiungi = (menuItemId: string) =>
    chiama(
      menuItemId,
      `/api/orders/${conto!.id}/lines`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ menuItemId, quantity: 1 }),
      },
      "Non siamo riusciti ad aggiungere il piatto.",
    );

  const quantita = (lineId: string, quantity: number) =>
    chiama(
      lineId,
      `/api/orders/${conto!.id}/lines/${lineId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity }),
      },
      "Non siamo riusciti a cambiare la quantità.",
    );

  async function chiudi() {
    setInCorso("chiudi");
    setError(null);
    const res = await fetch(`/api/orders/${conto!.id}/close`, {
      method: "POST",
    });
    setInCorso(null);
    if (!res.ok) {
      setError(
        await readApiError(res, "Non siamo riusciti a chiudere il conto."),
      );
      return;
    }
    // Non si chiude la finestra di colpo: se il cliente ha guadagnato dei
    // punti, il cameriere deve poterglielo dire prima che si alzi da tavola.
    const esito: ContoChiuso = await res.json();
    setConto(esito);
    setChiuso(esito);
    onChanged();
    onContoChiuso?.();
  }

  const totale = conto?.totalCents ?? 0;
  const pagamenti = conto?.pagamenti;
  const portate = conto?.righe.reduce((n, r) => n + r.quantity, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,860px)] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-[28px] p-0 lg:w-[calc(100vw-4rem)]">
        <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b border-border/60 px-5 py-4 pr-14 sm:px-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#2c5545] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <Receipt className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xl">
              Conto di {guestName}
            </DialogTitle>
            <DialogDescription className="mt-1 truncate">
              {conto ? (
                <>
                  {conto.tableLabel ? `Tavolo ${conto.tableLabel} · ` : ""}
                  {conto.reference}
                </>
              ) : (
                "Apro il conto…"
              )}
            </DialogDescription>
          </div>
        </DialogHeader>

        {conto === null ? (
          <div className="flex flex-1 items-center justify-center gap-2 px-6 text-sm text-muted-foreground">
            {error ? (
              <p className="text-destructive">{error}</p>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{" "}
                Un istante…
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:overflow-hidden">
            {/* ══ Il conto ══════════════════════════════════════════════ */}
            <section
              aria-label="Il conto"
              className="flex min-h-0 flex-col lg:border-r lg:border-border/60"
            >
              <div className="min-h-0 flex-1 px-5 pt-4 sm:px-6 lg:overflow-y-auto">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="t-etichetta">Sul conto</h3>
                  {portate > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {portate} {portate === 1 ? "portata" : "portate"}
                    </span>
                  )}
                </div>

                {conto.righe.length === 0 ? (
                  <div className="my-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
                    <UtensilsCrossed
                      className="h-6 w-6 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-muted-foreground">
                      Ancora niente sul conto. Tocca un piatto per aggiungerlo.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {conto.righe.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
                      >
                        <FotoPiatto
                          nome={r.name}
                          url={
                            r.menuItemId
                              ? (fotoDi.get(r.menuItemId) ?? null)
                              : null
                          }
                          className="h-12 w-12 shrink-0 rounded-xl"
                        />
                        {/* Il nome ha almeno 9rem: se accanto non ci stanno
                            quantità e prezzo, vanno sotto invece di schiacciarlo. */}
                        <div className="min-w-[9rem] flex-1">
                          <p className="line-clamp-2 text-[15px] font-semibold leading-snug">
                            {r.name}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            {formatCurrency(r.priceCents, currency)} cad.
                          </p>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                          <div className="flex items-center rounded-full bg-current/[0.06] p-1">
                            <button
                              type="button"
                              aria-label={`Uno in meno di ${r.name}`}
                              disabled={inCorso !== null || !conto.aperto}
                              onClick={() => quantita(r.id, r.quantity - 1)}
                              className="grid h-8 w-8 place-items-center rounded-full bg-white/85 shadow-sm transition hover:bg-white disabled:opacity-30"
                            >
                              <Minus
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </button>
                            <span className="w-8 text-center text-[15px] font-semibold tabular-nums">
                              {r.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`Uno in più di ${r.name}`}
                              disabled={inCorso !== null || !conto.aperto}
                              onClick={() => quantita(r.id, r.quantity + 1)}
                              className="grid h-8 w-8 place-items-center rounded-full bg-white/85 shadow-sm transition hover:bg-white disabled:opacity-30"
                            >
                              <Plus
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                          <span className="w-[4.75rem] text-right text-[15px] font-semibold tabular-nums">
                            {formatCurrency(r.totalCents, currency)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Il totale e i modi di pagare: fermi in fondo alla colonna. */}
              <div className="shrink-0 space-y-3 border-t border-border/60 px-5 py-4 sm:px-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-etichetta">Totale</span>
                  {/* La cifra che si legge al tavolo: sans semibold e tabellare. */}
                  <span
                    className={cn(
                      "tabular-nums",
                      pagamenti && pagamenti.daIncassareCents !== totale
                        ? "text-lg text-muted-foreground"
                        : "text-3xl font-semibold",
                    )}
                  >
                    {formatCurrency(totale, currency)}
                  </span>
                </div>

                {pagamenti && pagamenti.giftCardCents > 0 && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Gift card</span>
                    <span className="tabular-nums text-sage-strong">
                      −{formatCurrency(pagamenti.giftCardCents, currency)}
                    </span>
                  </div>
                )}

                {pagamenti && pagamenti.puntiCents > 0 && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">
                      Punti fedeltà
                      {pagamenti.punti > 0 ? ` (${pagamenti.punti})` : ""}
                    </span>
                    <span className="tabular-nums text-sage-strong">
                      −{formatCurrency(pagamenti.puntiCents, currency)}
                    </span>
                  </div>
                )}

                {pagamenti && pagamenti.daIncassareCents !== totale && (
                  <div className="flex items-baseline justify-between border-t border-border/60 pt-2">
                    <span className="t-etichetta">Da incassare</span>
                    <span className="text-3xl font-semibold tabular-nums">
                      {formatCurrency(pagamenti.daIncassareCents, currency)}
                    </span>
                  </div>
                )}

                {chiuso && (
                  <div className="rounded-2xl bg-sage/15 p-3 text-sm">
                    <p className="font-semibold">
                      Conto chiuso, {formatCurrency(totale, currency)}.
                    </p>
                    {chiuso.puntiAccreditati ? (
                      <p className="mt-1">
                        {guestName} ha guadagnato{" "}
                        <strong className="tabular-nums">
                          {chiuso.puntiAccreditati.punti}{" "}
                          {chiuso.puntiAccreditati.punti === 1
                            ? "punto"
                            : "punti"}
                        </strong>{" "}
                        · saldo {chiuso.puntiAccreditati.saldo}. Diglielo.
                      </p>
                    ) : null}
                  </div>
                )}

                {conto.aperto && conto.righe.length > 0 && (
                  <BillPayments
                    conto={conto}
                    currency={currency}
                    onChanged={setConto}
                  />
                )}
              </div>
            </section>

            {/* ══ I piatti da battere ═══════════════════════════════════ */}
            {conto.aperto && (
              <section
                aria-label="Aggiungi piatti"
                className="flex min-h-0 flex-col border-t border-border/60 bg-current/[0.02] lg:border-t-0"
              >
                <div className="shrink-0 space-y-3 px-5 pt-4 sm:px-6">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={cerca}
                      onChange={(e) => setCerca(e.target.value)}
                      placeholder="Cerca un piatto"
                      aria-label="Cerca un piatto da aggiungere"
                      className="h-11 rounded-full pl-10"
                    />
                  </div>
                  {categorie.length > 1 && (
                    <div
                      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
                      role="group"
                      aria-label="Categorie"
                    >
                      {[null, ...categorie].map((c) => (
                        <button
                          key={c ?? "tutti"}
                          type="button"
                          aria-pressed={categoria === c}
                          onClick={() => setCategoria(c)}
                          className={cn(
                            "h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
                            categoria === c
                              ? "bg-[#2c5545] text-white"
                              : "bg-white/60 text-foreground/80 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.08)] hover:bg-white",
                          )}
                        >
                          {c ?? "Tutti"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="min-h-0 flex-1 px-5 pb-5 pt-3 sm:px-6 lg:overflow-y-auto">
                  {menu === null ? (
                    <p className="text-sm text-muted-foreground">
                      Carico il menu…
                    </p>
                  ) : piatti.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Il menu è vuoto: le voci si aggiungono da Menu, e poi si
                      battono qui.
                    </p>
                  ) : trovati.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nessun piatto con questo nome.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {trovati.map((p) => {
                        const n = nelConto.get(p.id) ?? 0;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              disabled={!p.available || inCorso !== null}
                              onClick={() => aggiungi(p.id)}
                              aria-label={
                                p.available
                                  ? `Aggiungi ${p.name}`
                                  : `${p.name}: finito`
                              }
                              className={cn(
                                "group flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white/70 text-left shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.9),0_8px_20px_-12px_rgba(16,32,26,0.35)] transition",
                                p.available
                                  ? "hover:-translate-y-0.5 hover:bg-white"
                                  : "cursor-not-allowed opacity-45",
                                n > 0 && "ring-2 ring-[#2c5545]/70",
                              )}
                            >
                              <span className="relative block aspect-[4/3] w-full overflow-hidden">
                                <FotoPiatto
                                  nome={p.name}
                                  url={p.imageUrl ?? null}
                                  className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                                  grande
                                />
                                {n > 0 && (
                                  <span className="absolute left-2 top-2 rounded-full bg-[#2c5545] px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                                    ×{n}
                                  </span>
                                )}
                                {p.available ? (
                                  <span className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-[#2c5545] text-white shadow-md">
                                    {inCorso === p.id ? (
                                      <Loader2
                                        className="h-4 w-4 animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Plus
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </span>
                                ) : (
                                  <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                                    Finito
                                  </span>
                                )}
                              </span>
                              <span className="flex flex-1 flex-col gap-1 p-3">
                                <span className="line-clamp-2 text-sm font-semibold leading-snug">
                                  {p.name}
                                </span>
                                <span className="mt-auto flex items-baseline justify-between gap-2 text-xs">
                                  <span className="truncate text-muted-foreground">
                                    {p.categoria}
                                  </span>
                                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                                    {formatCurrency(p.priceCents, currency)}
                                  </span>
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {/* I gesti: sempre in vista, in fondo alla finestra. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 px-5 py-3.5 sm:px-6">
          {error && conto !== null && (
            <p className="w-full text-sm text-destructive">{error}</p>
          )}
          {conto?.aperto ? (
            <>
              {/* Una capsula rosso pastello: è il gesto che butta via il
                  conto, e deve leggersi diverso da «Incassa» senza gridare. */}
              <Button
                variant="ghost"
                className="h-12 rounded-full bg-[#f6dcd4] px-5 font-semibold text-[#9c3b22] hover:bg-[#f0cbbf] hover:text-[#86311b]"
                disabled={inCorso !== null}
                onClick={() =>
                  chiama(
                    "annulla",
                    `/api/orders/${conto.id}/cancel`,
                    { method: "POST" },
                    "Non siamo riusciti ad annullare il conto.",
                  ).then((e) => e && onOpenChange(false))
                }
              >
                Annulla il conto
              </Button>
              <Button
                variant="accent"
                className="h-12 flex-1 rounded-full px-6 text-base sm:ml-auto sm:min-w-[12rem] sm:flex-none"
                onClick={chiudi}
                disabled={inCorso !== null || conto.righe.length === 0}
              >
                {inCorso === "chiudi"
                  ? "Un istante…"
                  : conto.pagamenti.daIncassareCents === 0 && totale > 0
                    ? "Chiudi il conto"
                    : `Incassa ${formatCurrency(conto.pagamenti.daIncassareCents, currency)}`}
              </Button>
            </>
          ) : (
            <Button
              variant={chiuso ? "accent" : "ghost"}
              className="ml-auto h-12 rounded-full px-6"
              onClick={() => onOpenChange(false)}
              disabled={inCorso !== null}
            >
              {chiuso ? "Fine" : "Chiudi la finestra"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * La foto del piatto, o un segnaposto curato quando non c'è.
 *
 * Il segnaposto è una tinta piatta della casa — scelta dal nome, così lo
 * stesso piatto ha sempre lo stesso colore — con le iniziali: una griglia di
 * riquadri grigi tutti uguali si legge peggio di una lista di soli nomi. Le
 * foto si caricano dalla scheda del piatto, in Menu.
 */
const TINTE_SEGNAPOSTO = [
  ["#dfe9e1", "#2c5545"],
  ["#efe6d2", "#7d5510"],
  ["#d5e3da", "#1f4536"],
  ["#f3ead9", "#6b4f22"],
  ["#e3ece5", "#3b6b55"],
] as const;

function FotoPiatto({
  nome,
  url,
  className,
  grande = false,
}: {
  nome: string;
  url: string | null;
  className?: string;
  grande?: boolean;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={cn("object-cover", className)}
      />
    );
  }
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [fondo, inchiostro] = TINTE_SEGNAPOSTO[h % TINTE_SEGNAPOSTO.length];
  const iniziali = nome
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid place-items-center overflow-hidden",
        className,
      )}
      style={{ backgroundColor: fondo, color: inchiostro }}
    >
      <UtensilsCrossed
        className={cn(
          "absolute opacity-[0.12]",
          grande ? "-bottom-3 -right-3 h-24 w-24" : "h-8 w-8",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "relative text-display font-medium",
          grande ? "text-3xl" : "text-base",
        )}
      >
        {iniziali || nome.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}
