"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Euro,
  Gift,
  type LucideIcon,
  Percent,
  UtensilsCrossed,
} from "lucide-react";
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
import { Stepper } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { CouponView } from "@/server/coupons";

type Tipo = "PERCENT" | "FIXED" | "FREE_ITEM" | "MENU_OFFER";

const TIPI: { value: Tipo; label: string; nota: string; icona: LucideIcon }[] = [
  {
    value: "PERCENT",
    label: "Percentuale",
    nota: "Es. il 10% sul conto",
    icona: Percent,
  },
  {
    value: "FIXED",
    label: "Sconto in euro",
    nota: "Es. 15 € in meno",
    icona: Euro,
  },
  {
    value: "FREE_ITEM",
    label: "Un omaggio",
    nota: "Es. il dolce, un calice",
    icona: Gift,
  },
  {
    value: "MENU_OFFER",
    label: "Offerta dedicata",
    nota: "Es. menù a prezzo fisso",
    icona: UtensilsCrossed,
  },
];

const PASSI = [
  { id: "cosa", label: "Cosa dà" },
  { id: "nome", label: "Nome e codice" },
  { id: "quando", label: "Quando vale" },
];

const DOMANDE = ["Che cosa regala il coupon?", "Come lo chiamiamo?", "Quando si può usare?"];

const GIORNI_BREVI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/**
 * Creare un coupon, in tre passi.
 *
 * Prima era un modulo a due colonne con undici campi tutti visibili insieme:
 * per fare «il 10% a chi torna» si leggevano anche usi totali, spesa minima,
 * giorni e codice, cioè otto domande a cui quasi sempre si risponde «va bene
 * così». Adesso le domande arrivano nell'ordine in cui un ristoratore pensa
 * uno sconto:
 *
 * 1. **cosa dà** — quattro tessere invece di un menu a tendina, e il valore
 *    scritto grande accanto al suo simbolo;
 * 2. **come si chiama** — il nome, il codice (facoltativo: lo generiamo noi,
 *    leggibile al telefono) e le note per il personale;
 * 3. **quando vale** — scadenza e giorni, poi i limiti. Tutto facoltativo, e
 *    il passo lo dice: «Crea coupon» è già acceso.
 *
 * Sotto ogni passo una riga riassume il coupon com'è finora, così chi arriva
 * al terzo non deve tornare indietro per ricordarsi cosa sta creando.
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
   * Non si copiano due cose: il **codice**, che è unico su tutta
   * l'installazione e va rigenerato, e il **destinatario**, perché un coupon
   * riservato a una persona duplicato in silenzio è un secondo sconto alla
   * stessa persona.
   */
  daDuplicare?: CouponView | null;
}) {
  const router = useRouter();
  const d = daDuplicare ?? null;
  const [passo, setPasso] = useState(0);
  const [piuLontano, setPiuLontano] = useState(d ? PASSI.length - 1 : 0);
  const [name, setName] = useState(d ? `${d.name} (copia)` : "");
  const [description, setDescription] = useState(d?.description ?? "");
  const [kind, setKind] = useState<Tipo>((d?.kind as Tipo) ?? "PERCENT");
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
  const numero = Number(valore.replace(",", "."));

  // Cosa manca per andare avanti, detto in parole: un «Avanti» spento senza
  // motivo è un pulsante rotto.
  const mancaAlPasso = [
    conValore
      ? !(numero > 0)
        ? "Scrivi quanto vale lo sconto."
        : kind === "PERCENT" && numero > 100
          ? "Una percentuale arriva al massimo a 100."
          : null
      : !freeItem.trim()
        ? "Scrivi cosa si offre."
        : null,
    !name.trim() ? "Dai un nome al coupon." : null,
    null,
  ];
  const ultimo = passo === PASSI.length - 1;
  const bloccato = mancaAlPasso[passo];

  function vaiA(i: number) {
    setPasso(i);
    setPiuLontano((p) => Math.max(p, i));
    setError(null);
  }

  function avanti() {
    if (bloccato) return;
    if (ultimo) void salva();
    else vaiA(passo + 1);
  }

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
        ...(conValore ? { value: kind === "PERCENT" ? numero : Math.round(numero * 100) } : {}),
        ...(conOmaggio ? { freeItem: freeItem.trim() } : {}),
        ...(code.trim() ? { code: code.trim() } : {}),
        ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}),
        ...(maxRedemptions.trim() ? { maxRedemptions: Number(maxRedemptions) } : {}),
        maxPerGuest: Number(maxPerGuest) || 1,
        ...(minSpend.trim()
          ? {
              minSpendCents: Math.round(Number(minSpend.replace(",", ".")) * 100),
            }
          : {}),
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

  const beneficio = conValore
    ? numero > 0
      ? kind === "PERCENT"
        ? `${valore}% di sconto`
        : `${valore} € di sconto`
      : null
    : freeItem.trim() || null;
  const giorniTesto =
    giorni.length === 0
      ? "tutti i giorni"
      : `solo ${giorni
          .slice()
          .sort((a, b) => a - b)
          .map((i) => GIORNI[i])
          .join(", ")}`;
  const scadenzaTesto = validUntil
    ? `fino al ${new Date(`${validUntil}T00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`
    : "senza scadenza";
  const perCliente = Number(maxPerGuest) || 1;
  const condizioniTesto = [
    `${perCliente} per cliente`,
    giorniTesto,
    scadenzaTesto,
    minSpend.trim() ? `da ${minSpend.trim()} € di conto` : null,
    maxRedemptions.trim() ? `max ${maxRedemptions.trim()} usi` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Sotto ogni passo, nella colonna, la risposta già data.
  const rispostaDel = [
    beneficio ?? TIPI.find((t) => t.value === kind)?.label,
    name.trim() || "Da scrivere",
    `${giorniTesto} · ${scadenzaTesto}`,
  ];

  function vaiSePuoi(i: number) {
    // In avanti solo se i passi in mezzo sono a posto.
    if (i > passo && mancaAlPasso.slice(passo, i).some(Boolean)) return;
    vaiA(i);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Due colonne: a sinistra dove sei e cosa stai creando, a destra la
        domanda.

        In una finestra da 576 px tutto stava incolonnato al centro e ai lati
        restavano trecento pixel per parte di velo. La colonna di sinistra
        mette quello spazio al lavoro: i tre passi in verticale, ciascuno con
        la sua risposta già data, e il coupon com'è finora, disegnato come
        apparirà nell'elenco — matrice col codice compresa.
      */}
      <DialogContent className="gap-0 p-0 sm:max-w-4xl md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6 border-b border-border bg-[#c9a96a]/[0.07] p-6 md:border-b-0 md:border-r md:p-7">
          <DialogHeader>
            <DialogTitle>{d ? `Duplica «${d.name}»` : "Nuovo coupon"}</DialogTitle>
            <DialogDescription>
              {d
                ? "Le condizioni sono quelle dell'originale. Il codice sarà nuovo."
                : "Tre domande, e solo la prima è davvero necessaria."}
            </DialogDescription>
          </DialogHeader>

          {/* Sul telefono i passi restano in riga, come nelle campagne. */}
          <div className="md:hidden">
            <Stepper
              steps={PASSI}
              currentStepIndex={passo}
              furthestStepIndex={piuLontano}
              onStepClick={vaiSePuoi}
            />
          </div>

          <ol className="hidden flex-col md:flex">
            {PASSI.map((p, i) => {
              const corrente = i === passo;
              const fatto = i < piuLontano && i !== passo;
              const raggiungibile = i <= piuLontano;
              return (
                <li key={p.id} className="relative pb-5 last:pb-0">
                  {i < PASSI.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-[0.8125rem] top-8 bottom-1 w-px",
                        i < piuLontano ? "bg-primary/50" : "bg-border",
                      )}
                    />
                  )}
                  <button
                    type="button"
                    disabled={!raggiungibile}
                    onClick={() => vaiSePuoi(i)}
                    aria-current={corrente ? "step" : undefined}
                    className="flex w-full items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        "grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors",
                        corrente && "border-primary bg-primary text-primary-foreground",
                        fatto && "border-primary/50 text-primary",
                        !corrente && !fatto && "border-border text-muted-foreground",
                      )}
                    >
                      {fatto ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span
                        className={cn(
                          "block text-sm font-semibold leading-snug",
                          corrente ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {p.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-tertiary-foreground">
                        {rispostaDel[i]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Una riga, in fondo: dove finisce il coupon una volta creato. */}
          <p className="mt-auto hidden text-xs leading-relaxed text-tertiary-foreground md:block">
            Si usa al tavolo, dalla scheda della prenotazione in Servizio.
          </p>
        </aside>

        <form
          className="flex min-h-[28rem] min-w-0 flex-col p-6 md:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            avanti();
          }}
        >
          <p className="t-etichetta">
            Passo {passo + 1} di {PASSI.length}
          </p>
          <h3 className="mb-6 mt-1.5 text-display text-xl font-medium leading-tight text-foreground">
            {DOMANDE[passo]}
          </h3>
          <div className="flex-1">
            {/* ── 1. Cosa dà ──────────────────────────────────────────────── */}
            {passo === 0 && (
              <div className="space-y-5">
                <fieldset>
                  <legend className="sr-only">Che tipo di coupon</legend>
                  <div className="grid grid-cols-2 gap-2.5">
                    {TIPI.map((t) => {
                      const scelto = kind === t.value;
                      const Icona = t.icona;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          aria-pressed={scelto}
                          onClick={() => setKind(t.value)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            scelto
                              ? "border-primary/60 bg-primary/[0.06] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
                              : "border-border hover:border-border-strong hover:bg-veil-6",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors",
                              scelto
                                ? "bg-primary text-primary-foreground"
                                : "bg-veil-10 text-muted-foreground",
                            )}
                          >
                            <Icona className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                            <span className="block truncate text-xs text-tertiary-foreground">{t.nota}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/*
                  Il valore occupa la riga intera: il campo a sinistra, le
                  misure più usate a destra. Un campo da 176 px da solo lasciava
                  mezza finestra vuota, e chi crea uno sconto sceglie quasi
                  sempre fra cinque numeri.
                */}
                <div className="rounded-xl border border-border bg-veil-6 p-5">
                  {conValore ? (
                    <>
                      <Label htmlFor="c-valore">{kind === "PERCENT" ? "Quanto sconto" : "Quanti euro"}</Label>
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                        <div className="relative w-36 shrink-0">
                          <Input
                            id="c-valore"
                            autoFocus
                            inputMode="decimal"
                            value={valore}
                            onChange={(e) => setValore(e.target.value)}
                            placeholder={kind === "PERCENT" ? "10" : "15"}
                            className="h-14 pr-11 text-2xl font-semibold tabular-nums"
                          />
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl font-medium text-muted-foreground">
                            {kind === "PERCENT" ? "%" : "€"}
                          </span>
                        </div>
                        <Rapide
                          voci={(kind === "PERCENT" ? [5, 10, 15, 20, 25] : [5, 10, 15, 20, 30]).map(String)}
                          attiva={valore.replace(",", ".")}
                          etichetta={(v) => (kind === "PERCENT" ? `${v}%` : `${v} €`)}
                          onScegli={setValore}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <Label htmlFor="c-omaggio">
                        {kind === "FREE_ITEM" ? "Cosa si offre" : "Cosa comprende l'offerta"}
                      </Label>
                      <Input
                        id="c-omaggio"
                        autoFocus
                        value={freeItem}
                        onChange={(e) => setFreeItem(e.target.value)}
                        placeholder={
                          kind === "FREE_ITEM"
                            ? "Es. il dolce, un calice di bollicine"
                            : "Es. menù degustazione a 45 €"
                        }
                        className="mt-3 h-12 text-base"
                      />
                      <Rapide
                        className="mt-3"
                        voci={
                          kind === "FREE_ITEM"
                            ? ["Il dolce", "Un calice di bollicine", "Il caffè", "L'antipasto"]
                            : ["Menù degustazione", "Menù del giorno", "Aperitivo"]
                        }
                        attiva={freeItem}
                        onScegli={setFreeItem}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── 2. Nome e codice ────────────────────────────────────────── */}
            {passo === 1 && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="c-nome">Nome</Label>
                  <Input
                    id="c-nome"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Es. Benvenuto, Compleanno, Torna a trovarci"
                    className="h-12 text-base"
                  />
                  <p className="t-nota">È quello che legge il cliente.</p>
                </div>

                {/* Codice e note affiancati: due cose facoltative, dello
                    stesso peso, sotto l'unica che serve davvero. */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-codice">Codice</Label>
                    <Input
                      id="c-codice"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="Lo generiamo noi"
                      className="font-mono tracking-[0.06em] placeholder:font-sans placeholder:tracking-normal"
                    />
                    <p className="t-nota">
                      Facoltativo. Se lo lasci vuoto ne creiamo uno senza lettere che si confondono al
                      telefono.
                    </p>
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
                    <p className="t-nota">Le vede solo chi lavora in sala.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── 3. Quando vale ──────────────────────────────────────────── */}
            {passo === 2 && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-scadenza">Valido fino al</Label>
                    <Input
                      id="c-scadenza"
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                    />
                    <p className="t-nota">{validUntil ? "" : "Vuoto: non scade."}</p>
                  </div>

                  {/* Senza questa, un coupon nato per riempire il martedì viene
                    speso di sabato, che era già pieno. */}
                  <div className="space-y-1.5">
                    <Label>Giorni in cui vale</Label>
                    <div className="grid grid-cols-7 gap-1">
                      {GIORNI_BREVI.map((g, i) => {
                        const scelto = giorni.includes(i);
                        return (
                          <button
                            key={g}
                            type="button"
                            aria-pressed={scelto}
                            aria-label={GIORNI[i]}
                            onClick={() =>
                              setGiorni((prima) =>
                                prima.includes(i) ? prima.filter((x) => x !== i) : [...prima, i],
                              )
                            }
                            className={cn(
                              "h-10 rounded-lg border text-xs font-medium capitalize transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              scelto
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                            )}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                    <p className="t-nota">
                      {giorni.length === 0 ? "Nessuno scelto: vale tutti i giorni." : `Vale ${giorniTesto}.`}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="t-etichetta">Limiti</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                    {/* Senza questa, uno sconto del 20% si applica anche a un caffè. */}
                    <div className="space-y-1.5">
                      <Label htmlFor="c-minimo">Spesa minima (€)</Label>
                      <Input
                        id="c-minimo"
                        inputMode="decimal"
                        value={minSpend}
                        onChange={(e) => setMinSpend(e.target.value)}
                        placeholder="nessuna"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sul telefono l'anteprima non c'è: resta il riassunto in una riga. */}
          <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5 border-t border-border pt-3 text-xs text-tertiary-foreground md:hidden">
            <span className="font-medium text-foreground">{name.trim() || "Senza nome"}</span>
            {beneficio && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-accent-strong">{beneficio}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{condizioniTesto}</span>
          </p>

          {(error || bloccato) && (
            <p
              className={cn("mt-4 text-sm", error ? "text-destructive" : "text-muted-foreground")}
              role={error ? "alert" : undefined}
            >
              {error ?? bloccato}
            </p>
          )}

          <DialogFooter className="mt-6 border-t border-border pt-5 sm:justify-between">
            {passo === 0 ? (
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
                Annulla
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => vaiA(passo - 1)} disabled={inCorso}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Indietro
              </Button>
            )}
            <Button type="submit" variant={ultimo ? "accent" : "default"} disabled={inCorso || !!bloccato}>
              {ultimo ? (
                inCorso ? (
                  "Creo…"
                ) : (
                  "Crea coupon"
                )
              ) : (
                <>
                  Avanti <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Le misure più usate, come pillole: un tocco riempie il campo. */
function Rapide({
  voci,
  attiva,
  etichetta = (v) => v,
  onScegli,
  className,
}: {
  voci: string[];
  attiva: string;
  etichetta?: (v: string) => string;
  onScegli: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {voci.map((v) => {
        const scelta = attiva.trim().toLowerCase() === v.toLowerCase();
        return (
          <button
            key={v}
            type="button"
            aria-pressed={scelta}
            onClick={() => onScegli(v)}
            className={cn(
              "h-9 rounded-full border px-3.5 text-sm tabular-nums transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              scelta
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {etichetta(v)}
          </button>
        );
      })}
    </div>
  );
}

/** `yyyy-mm-dd` nel fuso di chi guarda: `toISOString()` qui darebbe il giorno
 *  prima per ogni scadenza fissata dopo le 22:00 d'estate. */
function isoGiorno(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
