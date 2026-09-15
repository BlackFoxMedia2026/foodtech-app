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
import type { CouponView } from "@/server/coupons";

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
  daDuplicare,
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
  /**
   * Il coupon da cui copiare, per «Duplica».
   *
   * Un ristoratore che rifà il martedì di ottobre non sta creando un coupon
   * nuovo: sta rifacendo quello di settembre con un'altra scadenza. Con la
   * sola creazione da vuoto quelle otto caselle si ridigitano a mano tutte
   * le volte, e una sbagliata è uno sconto che vale quando non deve.
   *
   * Non si copiano due cose: il **codice**, che è unico su tutta
   * l'installazione e va rigenerato, e il **destinatario**, perché un coupon
   * riservato a Ilaria Bosisio duplicato in silenzio per Ilaria Bosisio è un
   * secondo sconto alla stessa persona.
   */
  daDuplicare?: CouponView | null;
}) {
  const router = useRouter();
  const d = daDuplicare ?? null;
  const [name, setName] = useState(d ? `${d.name} (copia)` : "");
  const [description, setDescription] = useState(d?.description ?? "");
  const [kind, setKind] = useState<"PERCENT" | "FIXED" | "FREE_ITEM" | "MENU_OFFER">(
    (d?.kind as "PERCENT" | "FIXED" | "FREE_ITEM" | "MENU_OFFER") ?? "PERCENT",
  );
  const [valore, setValore] = useState(
    d == null ? "10" : d.kind === "FIXED" ? (d.value / 100).toFixed(2).replace(".", ",") : String(d.value),
  );
  const [freeItem, setFreeItem] = useState(d?.freeItem ?? "");
  const [code, setCode] = useState("");
  const [validUntil, setValidUntil] = useState(d?.validUntil ? isoGiorno(new Date(d.validUntil)) : "");
  const [maxRedemptions, setMaxRedemptions] = useState(
    d?.maxRedemptions != null ? String(d.maxRedemptions) : "",
  );
  const [maxPerGuest, setMaxPerGuest] = useState(String(d?.maxPerGuest ?? 1));
  const [minSpend, setMinSpend] = useState(
    d?.minSpendCents != null ? (d.minSpendCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [giorni, setGiorni] = useState<number[]>(d ? (d.validWeekdays ?? []) : giorniIniziali);
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
      {/*
        Due colonne, e non una incolonnata al centro.

        Undici campi in una colonna da 512 px facevano un modulo alto 900 px in
        una finestra da 1014: «Crea coupon» finiva **sotto il bordo dello
        schermo**, e il pulsante che conclude il lavoro si trovava scorrendo.
        Intanto ai lati restavano quattrocento pixel per parte, vuoti.

        Il taglio non è a metà per far quadrare l'altezza: è la stessa
        divisione che il pannello «Gestisci» usa per rileggerlo — **cosa dà** da
        una parte, **quando vale** dall'altra. Chi crea un coupon compila la
        prima colonna sempre e la seconda quasi mai: metterle affiancate rende
        visibile che le condizioni sono facoltative, cosa che in una colonna
        sola, dove tutto scorre uguale, non si capiva.
      */}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{d ? `Duplica «${d.name}»` : "Nuovo coupon"}</DialogTitle>
          <DialogDescription>
            {d
              ? "Le condizioni sono già quelle dell'originale. Il codice è nuovo: due coupon non possono averlo uguale."
              : "Il codice lo generiamo noi, leggibile al telefono. Puoi scriverne uno tuo se preferisci."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          {/* ── Che cos'è ─────────────────────────────────────────────── */}
          <div className="space-y-3.5">
            <p className="t-etichetta">Il coupon</p>

            <div className="space-y-1.5">
              <Label htmlFor="c-nome">Nome</Label>
              <Input
                id="c-nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Benvenuto, Compleanno, Torna a trovarci"
              />
              <p className="t-nota">È quello che legge il cliente.</p>
            </div>

            {/* Il menu prende più spazio del valore: «Percentuale di sconto»
                in una colonna da 225 px andava a capo, e un select alto due
                righe accanto a un campo alto una sfalsa tutta la riga. */}
            <div className="grid gap-3 sm:grid-cols-[1.45fr_1fr]">
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

            <div className="space-y-1.5">
              <Label htmlFor="c-descrizione">Note per il personale</Label>
              <Textarea
                id="c-descrizione"
                rows={3}
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

          {/* ── Quando vale ───────────────────────────────────────────── */}
          {/* Il filo verticale fa quello che lo spazio da solo non riesce a
              fare: dire che sono due gruppi e non otto campi in fila. Sparisce
              quando le colonne si impilano, dove non separerebbe più niente. */}
          <div className="space-y-3.5 md:border-l md:border-border md:pl-6">
            <p className="t-etichetta">Quando vale</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-scadenza">Valido fino al</Label>
                <Input
                  id="c-scadenza"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              {/* Senza questa, uno sconto del 20% si applica anche a un caffè.
                  Si chiama come nel pannello «Gestisci», che è dove la stessa
                  regola si rilegge: «Vale da (euro di conto)» andava a capo e
                  spingeva il campo un gradino sotto quello accanto. */}
              <div className="space-y-1.5">
                <Label htmlFor="c-minimo">Spesa minima (€)</Label>
                <Input
                  id="c-minimo"
                  inputMode="decimal"
                  value={minSpend}
                  onChange={(e) => setMinSpend(e.target.value)}
                  placeholder="nessun minimo"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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

            {/* Senza questa, un coupon nato per riempire il martedì viene
                speso di sabato, che era già pieno. */}
            <div className="space-y-1.5">
              <Label>Giorni in cui vale</Label>
              {/* Sette caselle uguali, non sette pillole che vanno a capo: una
                  settimana si legge come una striscia. */}
              <div className="grid grid-cols-7 gap-1">
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
                      className={`min-h-[36px] rounded-md border text-xs capitalize transition-colors ${
                        scelto
                          ? "border-accent bg-accent/20 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
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
              <p className="t-nota">
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

/** `yyyy-mm-dd` nel fuso di chi guarda: `toISOString()` qui darebbe il giorno
 *  prima per ogni scadenza fissata dopo le 22:00 d'estate. */
function isoGiorno(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
