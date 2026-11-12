"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Activity, CalendarClock, Minus, Plus, RotateCcw, UserRound, X, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SegmentFilterType } from "@/server/campaigns";
import { filtriAttivi, segmentoAttivo, segmentoById } from "@/lib/campaign-segments";
import { useWizardDispatch, useWizardState } from "./wizard-context";
import { useSegmentPreview } from "./use-segment-preview";
import { RiepilogoPubblico } from "./riepilogo-pubblico";
import { quotaDelPiano } from "./quota-piano";

/*
 * I filtri che non esistono non stanno in pagina.
 *
 * Qui c'era un riquadro «Prossimamente» con sei voci — spesa del cliente,
 * coperti medi, fascia oraria, giorno della settimana, canale di acquisizione,
 * lingua — che occupava spazio per dire che sei cose non si possono fare.
 * Chi sceglie i destinatari non ha bisogno dell'elenco di ciò che manca:
 * lo legge come un prodotto a metà. Quando quei dati ci saranno, i filtri
 * compariranno qui insieme agli altri.
 */

type FutureBookingValue = "any" | "has" | "none";

function futureBookingValue(segment: SegmentFilterType): FutureBookingValue {
  if (segment.hasFutureBooking) return "has";
  if (segment.noFutureBooking) return "none";
  return "any";
}

/** Le chiavi che ogni sezione possiede: servono al conteggio e ad «Azzera». */
const CHIAVI_PROFILO = ["tags", "loyaltyTier"] as const;
const CHIAVI_COMPORTAMENTO = ["minTotalVisits", "inactiveDays", "minNoShowCount", "hadCancelledBooking"] as const;
const CHIAVI_PRENOTAZIONI = ["hasFutureBooking", "noFutureBooking"] as const;
type ChiaveFiltro =
  | (typeof CHIAVI_PROFILO)[number]
  | (typeof CHIAVI_COMPORTAMENTO)[number]
  | (typeof CHIAVI_PRENOTAZIONI)[number];

function impostata(segment: SegmentFilterType, k: ChiaveFiltro): boolean {
  const v = segment[k];
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false;
}

/**
 * Una sezione è una lastra, come le card degli obiettivi un passo prima: la
 * pagina cambia contenuto, non materiale. La pastiglia verde è quella delle
 * tessere (regola 2 di DESIGN.md: il verde pieno sta sull'icona di una
 * tessera), e in testata la sezione dice quanti filtri ha accesi — si vede
 * dove si è già intervenuti senza leggere ogni campo.
 */
function Sezione({
  titolo,
  descrizione,
  icon: Icon,
  attivi,
  onAzzera,
  children,
}: {
  titolo: string;
  descrizione: string;
  icon: LucideIcon;
  attivi: number;
  onAzzera: () => void;
  children: ReactNode;
}) {
  return (
    <section className="surface space-y-5 p-5 md:p-6">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="vetro kpi-pastiglia grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--kpi-icon-ink)]"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="t-titolo-sezione">{titolo}</h3>
            {attivi > 0 && (
              <span className="rounded-full bg-segment px-2 py-0.5 text-[0.7rem] font-medium text-segment-ink">
                {attivi === 1 ? "1 attivo" : `${attivi} attivi`}
              </span>
            )}
          </div>
          <p className="t-nota">{descrizione}</p>
        </div>
        {attivi > 0 && (
          <button
            type="button"
            onClick={onAzzera}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Azzera
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Etichetta di un campo, con la riga di aiuto sotto: sempre nello stesso ordine. */
function Campo({ etichetta, id, aiuto, children }: { etichetta: string; id?: string; aiuto?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      {id ? (
        <label htmlFor={id} className="t-etichetta block">
          {etichetta}
        </label>
      ) : (
        <p className="t-etichetta">{etichetta}</p>
      )}
      {children}
      {aiuto && <p className="t-nota">{aiuto}</p>}
    </div>
  );
}

/**
 * Una scelta fra poche voci si vede tutta: un binario incassato con il
 * segmento scelto in pieno (regola 2: il verde dice ciò che è attivo). Una
 * tendina nascondeva le alternative dietro un clic per scelte da tre o
 * cinque voci.
 */
function Binario<T extends string>({
  value,
  options,
  onChange,
  etichetta,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  etichetta: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etichetta}
      className="flex flex-wrap gap-1 rounded-full border border-border bg-secondary/60 p-1 shadow-[inset_0_1px_2px_rgb(185_175_150/0.35)]"
    >
      {options.map((o) => {
        const scelto = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={scelto}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-[34px] flex-1 whitespace-nowrap rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              scelto
                ? "bg-segment font-medium text-segment-ink shadow-sm"
                : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Una soglia numerica: «nessun limite» finché non la si tocca.
 *
 * Il campo numerico nudo era una casella vuota senza unità né esempio — non
 * diceva se 60 fosse tanto o poco. Qui ha − e +, l'unità scritta accanto e
 * tre o quattro valori pronti, che sono quelli che un ristoratore userebbe
 * comunque. Scendere sotto il minimo toglie il filtro.
 */
function Soglia({
  id,
  etichetta,
  unita,
  valore,
  pronti,
  passo = 1,
  onChange,
}: {
  id: string;
  etichetta: string;
  unita: (n: number) => string;
  valore: number | undefined;
  pronti: number[];
  passo?: number;
  onChange: (n: number | undefined) => void;
}) {
  const attiva = valore !== undefined;
  const bottone =
    "grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
  return (
    <Campo etichetta={etichetta} id={id}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border bg-card p-1 transition-colors",
          attiva ? "border-accent-strong/60" : "border-border",
        )}
      >
        <button
          type="button"
          className={bottone}
          aria-label={`Diminuisci ${etichetta.toLowerCase()}`}
          disabled={!attiva}
          onClick={() => onChange(valore! - passo >= 1 ? valore! - passo : undefined)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={valore ?? ""}
          placeholder="Nessun limite"
          onChange={(e) => {
            const pulito = e.target.value.replace(/\D/g, "");
            onChange(pulito ? Math.min(Number(pulito), 9999) : undefined);
          }}
          className="min-w-0 flex-1 bg-transparent text-center text-sm font-medium tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
        {attiva && <span className="shrink-0 text-xs text-muted-foreground">{unita(valore)}</span>}
        <button
          type="button"
          className={bottone}
          aria-label={`Aumenta ${etichetta.toLowerCase()}`}
          onClick={() => onChange((valore ?? 0) + passo)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pronti.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={valore === n}
            onClick={() => onChange(valore === n ? undefined : n)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs tabular-nums transition-colors",
              valore === n
                ? "border-transparent bg-segment font-medium text-segment-ink"
                : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </Campo>
  );
}

/**
 * I tag come gettoni: si scrive, Invio o virgola lo fissa, la × lo toglie.
 * Una riga di testo separato da virgole non mostrava quali tag fossero già
 * presi in conto finché non si usciva dal campo.
 */
function Gettoni({ valori, onChange }: { valori: string[]; onChange: (v: string[]) => void }) {
  const [bozza, setBozza] = useState("");

  function aggiungi(testo: string) {
    const nuovi = testo
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !valori.some((v) => v.toLowerCase() === t.toLowerCase()));
    if (nuovi.length) onChange([...valori, ...nuovi]);
    setBozza("");
  }

  function tasto(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      aggiungi(bozza);
    } else if (e.key === "Backspace" && !bozza && valori.length) {
      onChange(valori.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-2xl border bg-card px-2 py-1.5 transition-colors focus-within:border-accent-strong/60",
        valori.length ? "border-accent-strong/60" : "border-border",
      )}
    >
      {valori.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-segment py-0.5 pl-2.5 pr-1 text-xs font-medium text-segment-ink"
        >
          {t}
          <button
            type="button"
            aria-label={`Togli il tag ${t}`}
            onClick={() => onChange(valori.filter((v) => v !== t))}
            className="grid h-4 w-4 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id="tags"
        value={bozza}
        onChange={(e) => setBozza(e.target.value)}
        onKeyDown={tasto}
        onBlur={() => bozza.trim() && aggiungi(bozza)}
        placeholder={valori.length ? "Aggiungi…" : "es. celiaco, terrazza"}
        className="min-w-[8rem] flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function Step3Filtri() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const preview = useSegmentPreview();
  const segment = state.segment;

  function updateSegment(patch: Partial<SegmentFilterType>) {
    dispatch({ type: "SET_SEGMENT", segment: { ...segment, ...patch } });
  }
  function azzera(chiavi: readonly ChiaveFiltro[]) {
    const pulito: SegmentFilterType = { ...segment };
    for (const k of chiavi) delete pulito[k];
    dispatch({ type: "SET_SEGMENT", segment: pulito });
  }

  const attivo = segmentoAttivo(segment);
  /* Il livello fedeltà del gruppo «Clienti VIP» è il gruppo stesso, non un
     filtro: non si conta e non si azzera da qui (lo si cambia al passo prima). */
  const profilo = CHIAVI_PROFILO.filter((k) => impostata(segment, k) && !(k === "loyaltyTier" && attivo === "vip"));
  const comportamento = CHIAVI_COMPORTAMENTO.filter((k) => impostata(segment, k));
  const prenotazioni = CHIAVI_PRENOTAZIONI.filter((k) => impostata(segment, k));
  const totale = profilo.length + comportamento.length + (prenotazioni.length ? 1 : 0);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-display text-2xl md:text-3xl">Affina il tuo pubblico</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            I filtri sono facoltativi: usa solo quelli che ti servono, il numero a destra si aggiorna mentre scegli.
          </p>
        </div>
        {totale > 0 && (
          <button
            type="button"
            onClick={() => azzera([...profilo, ...CHIAVI_COMPORTAMENTO, ...CHIAVI_PRENOTAZIONI])}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm transition-colors hover:border-border-strong"
          >
            <span className="rounded-full bg-segment px-2 py-0.5 text-xs font-medium tabular-nums text-segment-ink">
              {totale}
            </span>
            {totale === 1 ? "filtro attivo" : "filtri attivi"}
            <span className="text-muted-foreground">· Azzera tutti</span>
          </button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
        <div className="space-y-5">
          <Sezione
            titolo="Profilo e fidelizzazione"
            descrizione="Chi è il cliente sulla sua scheda."
            icon={UserRound}
            attivi={profilo.length}
            onAzzera={() => azzera(profilo)}
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <Campo etichetta="Tag" id="tags" aiuto="Basta che il cliente abbia uno dei tag. Invio per aggiungerlo.">
                <Gettoni valori={segment.tags ?? []} onChange={(tags) => updateSegment({ tags: tags.length ? tags : undefined })} />
              </Campo>

              <Campo
                etichetta="Livello fedeltà"
                aiuto={attivo === "vip" ? "È il gruppo «Clienti VIP» scelto al passo prima." : undefined}
              >
                <Binario
                  etichetta="Livello fedeltà"
                  value={segment.loyaltyTier ?? "ANY"}
                  onChange={(v) =>
                    updateSegment({ loyaltyTier: v === "ANY" ? undefined : (v as SegmentFilterType["loyaltyTier"]) })
                  }
                  options={[
                    { value: "ANY", label: "Tutti" },
                    { value: "NEW", label: "Nuovo" },
                    { value: "REGULAR", label: "Regolare" },
                    { value: "VIP", label: "VIP" },
                    { value: "AMBASSADOR", label: "Ambassador" },
                  ]}
                />
              </Campo>
            </div>
          </Sezione>

          <Sezione
            titolo="Comportamento cliente"
            descrizione="Quante volte è venuto, quando, e quante volte non si è presentato."
            icon={Activity}
            attivi={comportamento.length}
            onAzzera={() => azzera(CHIAVI_COMPORTAMENTO)}
          >
            {/* Tre soglie in fila appena c'è spazio: si leggono come una frase
                sola, «almeno… da almeno… almeno…». */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Soglia
                id="minTotalVisits"
                etichetta="Visite minime"
                unita={(n) => (n === 1 ? "visita" : "visite")}
                valore={segment.minTotalVisits}
                pronti={[2, 5, 10]}
                onChange={(n) => updateSegment({ minTotalVisits: n })}
              />
              <Soglia
                id="inactiveDays"
                etichetta="Inattivo da almeno"
                unita={(n) => (n === 1 ? "giorno" : "giorni")}
                valore={segment.inactiveDays}
                pronti={[30, 60, 90, 180]}
                passo={15}
                onChange={(n) => updateSegment({ inactiveDays: n })}
              />
              <Soglia
                id="minNoShowCount"
                etichetta="No-show minimi"
                unita={() => "no-show"}
                valore={segment.minNoShowCount}
                pronti={[1, 2, 3]}
                onChange={(n) => updateSegment({ minNoShowCount: n })}
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-border/60 pt-4">
              <span>
                <span className="block text-sm font-medium">Ha annullato una prenotazione in passato</span>
                <span className="block t-nota">Il cliente ha prenotato ma poi cancellato almeno una volta.</span>
              </span>
              <Switch
                checked={!!segment.hadCancelledBooking}
                onCheckedChange={(checked) => updateSegment({ hadCancelledBooking: checked || undefined })}
              />
            </label>
          </Sezione>

          <Sezione
            titolo="Prenotazioni"
            descrizione="Cosa ha già in agenda da qui in avanti."
            icon={CalendarClock}
            attivi={prenotazioni.length ? 1 : 0}
            onAzzera={() => azzera(CHIAVI_PRENOTAZIONI)}
          >
            <Campo etichetta="Prenotazione futura" aiuto="Utile per non riscrivere a chi ha già un tavolo prenotato.">
              <div className="max-w-xl">
                <Binario<FutureBookingValue>
                  etichetta="Prenotazione futura"
                  value={futureBookingValue(segment)}
                  onChange={(v) =>
                    updateSegment({
                      hasFutureBooking: v === "has" ? true : undefined,
                      noFutureBooking: v === "none" ? true : undefined,
                    })
                  }
                  options={[
                    { value: "any", label: "Qualsiasi" },
                    { value: "has", label: "Con prenotazione" },
                    { value: "none", label: "Senza prenotazione" },
                  ]}
                />
              </div>
            </Campo>
          </Sezione>
        </div>

        <RiepilogoPubblico
          preset={segmentoById(attivo)}
          filtri={filtriAttivi(segment, attivo)}
          preview={preview}
          quota={quotaDelPiano(state)}
          titoloSegmento="Segmento iniziale"
          titoloNumero="Destinatari finali"
        />
      </div>
    </div>
  );
}
