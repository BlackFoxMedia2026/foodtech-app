"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ALLERGENI, REGIMI, type Allergene, type MenuItemView, type Regime } from "@/server/menu";
import { fraseMargine, statoMargine } from "@/lib/margine";

/**
 * Un piatto.
 *
 * Gli allergeni si spuntano da un elenco chiuso — i quattordici obbligatori
 * per legge — e non si scrivono a mano. Un campo libero produce «glutine»,
 * «Glutine» e «farina di grano» nella stessa carta, e un cliente celiaco non
 * può fidarsi di una ricerca che non trova la parola giusta.
 *
 * Il costo di produzione è facoltativo e sta in fondo: serve al margine, che
 * è l'unico numero in euro di questa applicazione a non essere una stima —
 * prezzo e costo li dichiara il locale, non li deduciamo noi.
 */
export function MenuItemDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  categoryName: string;
  /** Assente quando si crea. */
  item?: MenuItemView;
}) {
  const router = useRouter();
  const modifica = !!item;

  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [prezzo, setPrezzo] = useState(item ? String(item.priceCents / 100) : "");
  const [costo, setCosto] = useState(item?.costCents != null ? String(item.costCents / 100) : "");

  /**
   * Il margine dei numeri che sono nel modulo adesso.
   *
   * `null` quando uno dei due manca o non è un numero: un'anteprima su un
   * campo mezzo scritto direbbe cose che cambiano a ogni tasto.
   */
  const anteprimaMargine = (() => {
    const p = Number(prezzo.replace(",", "."));
    const c = Number(costo.replace(",", "."));
    if (costo.trim() === "" || !Number.isFinite(p) || !Number.isFinite(c) || p <= 0) return null;
    const margineCents = Math.round(p * 100) - Math.round(c * 100);
    const pct = Math.round((margineCents / Math.round(p * 100)) * 100);
    return {
      stato: statoMargine(margineCents),
      frase: fraseMargine(margineCents, pct, (cents) =>
        new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100),
      ),
    };
  })();
  const [available, setAvailable] = useState(item?.available ?? true);
  const [allergeni, setAllergeni] = useState<Allergene[]>(item?.allergens ?? []);
  const [regimi, setRegimi] = useState<Regime[]>(item?.dietary ?? []);
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spunta = <T extends string>(elenco: T[], set: (v: T[]) => void, valore: T) =>
    set(elenco.includes(valore) ? elenco.filter((x) => x !== valore) : [...elenco, valore]);

  async function salva() {
    setInCorso(true);
    setError(null);

    const corpo = {
      categoryId,
      name,
      description: description.trim() || null,
      priceCents: Math.round(Number(prezzo.replace(",", ".")) * 100),
      available,
      allergens: allergeni,
      dietary: regimi,
      // Stringa vuota vuol dire «non lo so», e va distinta da «costa zero».
      costCents: costo.trim() === "" ? null : Math.round(Number(costo.replace(",", ".")) * 100),
    };

    const res = await fetch(modifica ? `/api/menu/items/${item!.id}` : "/api/menu/items", {
      method: modifica ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare il piatto."));
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modifica ? "Modifica piatto" : "Nuovo piatto"}</DialogTitle>
          <DialogDescription>In {categoryName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-nome">Nome</Label>
            <Input
              id="p-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Tagliatelle al ragù"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-descrizione">Descrizione</Label>
            <Textarea
              id="p-descrizione"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Gli ingredienti, come li racconti al tavolo"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-prezzo">Prezzo (€)</Label>
              <Input
                id="p-prezzo"
                inputMode="decimal"
                value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
                placeholder="14"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-costo">Costo materie prime (€)</Label>
              <Input
                id="p-costo"
                inputMode="decimal"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                placeholder="facoltativo"
              />
              {/* Il margine si vede **mentre si scrive**, non dopo aver
                  salvato. Il costo lo digita una persona su un tastierino, e
                  un costo più alto del prezzo è un piatto venduto in
                  perdita che finisce nelle analisi del food cost: se è un
                  errore di battitura va detto adesso, se è voluto resta
                  scritto e nessuno si allarma. */}
              {anteprimaMargine ? (
                <p
                  className={
                    anteprimaMargine.stato === "perdita"
                      ? "text-xs font-medium text-destructive-soft"
                      : anteprimaMargine.stato === "pari"
                        ? "text-xs text-accent-strong"
                        : "t-nota"
                  }
                >
                  {anteprimaMargine.frase}
                </p>
              ) : (
                <p className="t-nota">Se lo metti, vedi il margine sul piatto.</p>
              )}
            </div>
          </div>

          <label htmlFor="p-disponibile" className="flex min-h-[44px] cursor-pointer items-center gap-2">
            <Switch id="p-disponibile" checked={available} onCheckedChange={setAvailable} />
            <span className="text-sm">
              {available ? "Disponibile" : "Finito — non compare nel menu del cliente"}
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Allergeni</legend>
            <p className="text-xs text-muted-foreground">
              I quattordici a dichiarazione obbligatoria. Si spuntano, non si scrivono: su questo un cliente
              celiaco deve potersi fidare.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(ALLERGENI) as [Allergene, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={allergeni.includes(k)}
                  onClick={() => spunta(allergeni, setAllergeni, k)}
                  className={cn(
                    "min-h-[36px] rounded-full border px-3 text-xs transition-colors",
                    allergeni.includes(k)
                      ? "border-accent/50 bg-accent/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-current/5",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Come si mangia</legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(REGIMI) as [Regime, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={regimi.includes(k)}
                  onClick={() => spunta(regimi, setRegimi, k)}
                  className={cn(
                    "min-h-[36px] rounded-full border px-3 text-xs transition-colors",
                    regimi.includes(k)
                      ? "border-sage/50 bg-sage/15 text-sage-strong"
                      : "border-border text-muted-foreground hover:bg-current/5",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Annulla
          </Button>
          <Button variant="accent" onClick={salva} disabled={inCorso || !name.trim() || prezzo.trim() === ""}>
            {inCorso ? "Salvo…" : modifica ? "Salva" : "Aggiungi al menu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
