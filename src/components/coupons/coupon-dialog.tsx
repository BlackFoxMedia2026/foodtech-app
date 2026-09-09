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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";

const TIPI = [
  { value: "PERCENT", label: "Percentuale di sconto" },
  { value: "FIXED", label: "Sconto in euro" },
  { value: "FREE_ITEM", label: "Qualcosa in omaggio" },
  { value: "MENU_OFFER", label: "Offerta dedicata" },
] as const;

/**
 * Creare un coupon.
 *
 * Il codice non si chiede: lo generiamo leggibile — senza le lettere e le
 * cifre che si confondono al telefono — e chi vuole il proprio lo scrive.
 * Un ristoratore non deve inventarsi una stringa unica per fare uno sconto.
 */
export function CouponDialog({
  open,
  onOpenChange,
  giorniIniziali = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * I giorni della settimana già selezionati.
   *
   * Serve all'intento «riempire il martedì» dell'hub marketing: chi arriva da
   * lì vuole uno sconto valido **quel** giorno, e riselezionarlo a mano è un
   * passaggio che il prodotto conosce già.
   */
  giorniIniziali?: number[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"PERCENT" | "FIXED" | "FREE_ITEM" | "MENU_OFFER">("PERCENT");
  const [valore, setValore] = useState("10");
  const [freeItem, setFreeItem] = useState("");
  const [code, setCode] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [maxPerGuest, setMaxPerGuest] = useState("1");
  const [minSpend, setMinSpend] = useState("");
  const [giorni, setGiorni] = useState<number[]>(giorniIniziali);
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conValore = kind === "PERCENT" || kind === "FIXED";
  const conOmaggio = kind === "FREE_ITEM" || kind === "MENU_OFFER";

  async function salva() {
    setInCorso(true);
    setError(null);

    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: description.trim() || null,
        kind,
        ...(conValore
          ? { value: kind === "PERCENT" ? Number(valore) : Math.round(Number(valore.replace(",", ".")) * 100) }
          : {}),
        ...(conOmaggio ? { freeItem: freeItem.trim() } : {}),
        ...(code.trim() ? { code: code.trim() } : {}),
        ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}),
        ...(maxRedemptions.trim() ? { maxRedemptions: Number(maxRedemptions) } : {}),
        maxPerGuest: Number(maxPerGuest) || 1,
        ...(minSpend.trim() ? { minSpendCents: Math.round(Number(minSpend.replace(",", ".")) * 100) } : {}),
        ...(giorni.length > 0 ? { validWeekdays: giorni } : {}),
      }),
    });

    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a creare il coupon."));
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo coupon</DialogTitle>
          <DialogDescription>
            Il codice lo generiamo noi, leggibile al telefono. Puoi scriverne uno tuo se preferisci.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-nome">Nome</Label>
            <Input
              id="c-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Benvenuto, Compleanno, Torna a trovarci"
            />
            <p className="text-xs text-tertiary-foreground">È quello che legge il cliente.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-tipo">Cosa dà</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger id="c-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPI.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {conValore && (
              <div className="space-y-1.5">
                <Label htmlFor="c-valore">{kind === "PERCENT" ? "Percentuale" : "Euro"}</Label>
                <Input
                  id="c-valore"
                  inputMode="decimal"
                  value={valore}
                  onChange={(e) => setValore(e.target.value)}
                  placeholder={kind === "PERCENT" ? "10" : "15"}
                />
              </div>
            )}

            {conOmaggio && (
              <div className="space-y-1.5">
                <Label htmlFor="c-omaggio">Cosa si offre</Label>
                <Input
                  id="c-omaggio"
                  value={freeItem}
                  onChange={(e) => setFreeItem(e.target.value)}
                  placeholder="Es. il dolce, un calice di bollicine"
                />
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-scadenza">Valido fino al</Label>
              <Input
                id="c-scadenza"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-max">Usi totali</Label>
              <Input
                id="c-max"
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="illimitati"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-per-cliente">Per cliente</Label>
              <Input
                id="c-per-cliente"
                type="number"
                min={1}
                value={maxPerGuest}
                onChange={(e) => setMaxPerGuest(e.target.value)}
              />
            </div>
          </div>

          {/* Le due condizioni che un ristoratore chiede per prime, e che fino
              a ieri non c'erano: senza la prima uno sconto del 20% si applica
              anche a un caffè, senza la seconda un coupon nato per riempire il
              martedì viene speso di sabato, che era già pieno. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-minimo">Vale da (euro di conto)</Label>
              <Input
                id="c-minimo"
                inputMode="decimal"
                value={minSpend}
                onChange={(e) => setMinSpend(e.target.value)}
                placeholder="nessun minimo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Giorni in cui vale</Label>
              <div className="flex flex-wrap gap-1">
                {["dom", "lun", "mar", "mer", "gio", "ven", "sab"].map((g, i) => {
                  const scelto = giorni.includes(i);
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={scelto}
                      onClick={() =>
                        setGiorni((prima) =>
                          prima.includes(i) ? prima.filter((x) => x !== i) : [...prima, i],
                        )
                      }
                      className={`min-h-[36px] rounded-full border px-2.5 text-xs capitalize transition-colors ${
                        scelto ? "border-accent bg-accent/20 text-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
              {/* La frase seguiva la selezione solo per metà: con «mar»
                  acceso continuava a dire «nessuno selezionato», che è il
                  contrario di quello che si vedeva. Adesso dice cosa vale. */}
              <p className="text-xs text-tertiary-foreground">
                {giorni.length === 0
                  ? "Nessuno selezionato: vale tutti i giorni."
                  : `Vale solo ${giorni
                      .slice()
                      .sort((a, b) => a - b)
                      .map((i) => ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"][i])
                      .join(", ")}.`}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-descrizione">Note per il personale</Label>
            <Textarea
              id="c-descrizione"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Es. non cumulabile con il menù degustazione"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-codice">Codice (facoltativo)</Label>
            <Input
              id="c-codice"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Lo generiamo noi"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Annulla
          </Button>
          <Button variant="accent" onClick={salva} disabled={inCorso || !name.trim()}>
            {inCorso ? "Creo…" : "Crea coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
