"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
 * una mano: si scrive una parola e si tocca il piatto. Niente categorie da
 * aprire, niente menu a tendina — la ricerca è più veloce di qualunque albero,
 * e su un tavolo da otto la differenza sono minuti.
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
 */
export function BillDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
  currency,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  guestName: string;
  currency: string;
  onChanged: () => void;
}) {
  const [conto, setConto] = useState<OrderView | null>(null);
  const [menu, setMenu] = useState<MenuCategoryView[] | null>(null);
  const [cerca, setCerca] = useState("");
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
        setError(await readApiError(c, "Non siamo riusciti ad aprire il conto."));
        return;
      }
      setConto(await c.json());
      if (m.ok) setMenu(await m.json());
    })();

    return () => {
      annullato = true;
    };
  }, [open, bookingId]);

  /** Tutti i piatti in una lista piatta: la ricerca non ha categorie. */
  const piatti = useMemo(() => {
    if (!menu) return [];
    return menu.flatMap((c) => c.items.map((i) => ({ ...i, categoria: c.name })));
  }, [menu]);

  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return piatti.slice(0, 8);
    return piatti.filter((p) => p.name.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q));
  }, [piatti, cerca]);

  async function chiama(chiave: string, url: string, init: RequestInit, fallback: string) {
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
    const res = await fetch(`/api/orders/${conto!.id}/close`, { method: "POST" });
    setInCorso(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a chiudere il conto."));
      return;
    }
    // Non si chiude la finestra di colpo: se il cliente ha guadagnato dei
    // punti, il cameriere deve poterglielo dire prima che si alzi da tavola.
    const esito: ContoChiuso = await res.json();
    setConto(esito);
    setChiuso(esito);
    onChanged();
  }

  const totale = conto?.totalCents ?? 0;
  const pagamenti = conto?.pagamenti;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-accent" aria-hidden="true" /> Conto di {guestName}
          </DialogTitle>
          <DialogDescription>
            {conto ? (
              <>
                {conto.reference}
                {conto.tableLabel ? ` · tavolo ${conto.tableLabel}` : ""}
              </>
            ) : (
              "Apro il conto…"
            )}
          </DialogDescription>
        </DialogHeader>

        {conto === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Un istante…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Le righe già battute */}
            {conto.righe.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ancora niente sul conto. Cerca un piatto qui sotto e toccalo.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {conto.righe.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(r.priceCents, currency)} × {r.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Uno in meno di ${r.name}`}
                        disabled={inCorso !== null || !conto.aperto}
                        onClick={() => quantita(r.id, r.quantity - 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10 disabled:opacity-30"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{r.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Uno in più di ${r.name}`}
                        disabled={inCorso !== null || !conto.aperto}
                        onClick={() => quantita(r.id, r.quantity + 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10 disabled:opacity-30"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="ml-2 w-16 text-right text-sm tabular-nums">
                        {formatCurrency(r.totalCents, currency)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1 border-t border-border pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Totale</span>
                <span
                  className={cn(
                    "tabular-nums",
                    pagamenti && pagamenti.daIncassareCents !== totale
                      ? "text-base"
                      : "text-display text-2xl",
                  )}
                >
                  {formatCurrency(totale, currency)}
                </span>
              </div>

              {pagamenti && pagamenti.giftCardCents > 0 && (
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Gift card</span>
                  <span className="tabular-nums text-sage">
                    −{formatCurrency(pagamenti.giftCardCents, currency)}
                  </span>
                </div>
              )}

              {pagamenti && pagamenti.puntiCents > 0 && (
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">
                    Punti fedeltà{pagamenti.punti > 0 ? ` (${pagamenti.punti})` : ""}
                  </span>
                  <span className="tabular-nums text-sage">
                    −{formatCurrency(pagamenti.puntiCents, currency)}
                  </span>
                </div>
              )}

              {pagamenti && pagamenti.daIncassareCents !== totale && (
                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <span className="text-sm text-muted-foreground">Da incassare</span>
                  <span className="text-display text-2xl tabular-nums">
                    {formatCurrency(pagamenti.daIncassareCents, currency)}
                  </span>
                </div>
              )}
            </div>

            {chiuso && (
              <div className="rounded-md border border-sage/40 bg-sage/10 p-3 text-sm">
                <p className="font-medium">Conto chiuso, {formatCurrency(totale, currency)}.</p>
                {chiuso.puntiAccreditati ? (
                  <p className="mt-1">
                    {guestName} ha guadagnato{" "}
                    <strong className="tabular-nums">
                      {chiuso.puntiAccreditati.punti}{" "}
                      {chiuso.puntiAccreditati.punti === 1 ? "punto" : "punti"}
                    </strong>{" "}
                    · saldo {chiuso.puntiAccreditati.saldo}. Diglielo.
                  </p>
                ) : null}
              </div>
            )}

            {conto.aperto && conto.righe.length > 0 && (
              <BillPayments conto={conto} currency={currency} onChanged={setConto} />
            )}

            {/* La ricerca: il gesto vero */}
            {conto.aperto && (
              <div className="space-y-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={cerca}
                    onChange={(e) => setCerca(e.target.value)}
                    placeholder="Cerca un piatto"
                    aria-label="Cerca un piatto da aggiungere"
                    className="pl-9"
                  />
                </div>

                {menu === null ? (
                  <p className="text-xs text-muted-foreground">Carico il menu…</p>
                ) : piatti.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Il menu è vuoto: le voci si aggiungono da Menu, e poi si battono qui.
                  </p>
                ) : (
                  <ul className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {trovati.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={!p.available || inCorso !== null}
                          onClick={() => aggiungi(p.id)}
                          title={p.available ? undefined : "Segnato finito"}
                          className={cn(
                            "flex min-h-[48px] w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                            p.available
                              ? "border-border hover:bg-current/5"
                              : "cursor-not-allowed border-dashed border-border opacity-40",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{p.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {p.categoria}
                              {p.available ? "" : " · finito"}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">{formatCurrency(p.priceCents, currency)}</span>
                        </button>
                      </li>
                    ))}
                    {trovati.length === 0 && (
                      <li className="text-xs text-muted-foreground">Nessun piatto con questo nome.</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant={chiuso ? "accent" : "ghost"}
            onClick={() => onOpenChange(false)}
            disabled={inCorso !== null}
          >
            {chiuso ? "Fine" : "Chiudi la finestra"}
          </Button>
          {conto?.aperto && (
            <>
              <Button
                variant="outline"
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
              <Button variant="accent" onClick={chiudi} disabled={inCorso !== null || conto.righe.length === 0}>
                {inCorso === "chiudi"
                  ? "Un istante…"
                  : conto.pagamenti.daIncassareCents === 0 && totale > 0
                    ? "Chiudi il conto"
                    : `Incassa ${formatCurrency(conto.pagamenti.daIncassareCents, currency)}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
