"use client";

import { centesimiDaTesto } from "@/lib/conto-diviso";

/** «No», una **cifra in centesimi**, o un importo scritto a mano. */
export type SceltaMancia = "no" | "mia" | number;

/**
 * Le mance proposte, in centesimi.
 *
 * Erano percentuali del conto — 5, 10, 15 — e su un conto diviso davano cifre
 * come «2,25 €», che nessuno lascia. Una mancia si pensa in monete, non in
 * frazioni: uno, due, cinque. Il conto vero non cambia di una virgola, cambia
 * solo la domanda che si fa a chi paga.
 *
 * Stanno qui in un posto solo perché il locale, in Impostazioni → Pagamenti,
 * sceglie ancora **percentuali** (`tipPresets`): il giorno in cui quel
 * selettore diventerà a importi, è questa riga che sparisce.
 */
const FISSE = [100, 200, 500];

/**
 * «Vuoi lasciare una mancia?»
 *
 * ## La mancia è sopra il conto, non dentro
 *
 * Il riepilogo mostra sempre le righe separate — conto, mancia, totale —
 * perché sono tre cose diverse: la mancia **non riduce il residuo del tavolo**,
 * si aggiunge a quello che si paga. Se lo facesse, il locale incasserebbe meno
 * cena di quanta ne ha servita, e il commensale dopo troverebbe un residuo
 * misteriosamente più basso.
 *
 * ## Cifre, non percentuali
 *
 * Una percentuale costringe a fare un conto per sapere cosa si sta lasciando,
 * e su una quota divisa produce importi che non si lasciano — «2,25 €». Le
 * monete si scelgono, non si calcolano.
 *
 * ## «No, grazie» è la prima scelta, e non è preselezionata
 *
 * Non c'è una percentuale suggerita di default. Una mancia preselezionata è
 * una mancia estorta per distrazione, e qui si sta chiedendo un favore, non
 * incassando un dovuto. Chi non tocca niente paga il conto e basta.
 *
 * ## L'email sotto una piega
 *
 * È facoltativa e la compila quasi nessuno, ma occupava un riquadro con
 * etichetta e spiegazione proprio sopra il pulsante di pagamento — in mezzo
 * alla strada di tutti per il comodo di pochi. Ora è una riga che si apre.
 */
export function CorpoMancia({
  billCents,
  currency,
  euro,
  scelta,
  onScelta,
  tipCents,
  testoMia,
  onTestoMia,
  email,
  onEmail,
}: {
  billCents: number;
  currency: string;
  euro: (c: number) => string;
  scelta: SceltaMancia;
  onScelta: (v: SceltaMancia) => void;
  tipCents: number;
  testoMia: string;
  onTestoMia: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
}) {
  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-[20px] border border-border/70 bg-background/40 px-4 py-3.5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Stai pagando</p>
        <p className="text-display mt-0.5 text-[40px] leading-none tabular-nums">
          {euro(billCents + tipCents)}
        </p>
        {tipCents > 0 && (
          <p className="mt-1.5 text-[13px] text-muted-foreground tabular-nums">
            {euro(billCents)} di conto · {euro(tipCents)} di mancia
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[13px] text-muted-foreground">
          La mancia va al personale di sala. È facoltativa.
        </p>
        <div className="grid grid-cols-4 gap-2">
          <Pastiglia attiva={scelta === "no"} onClick={() => onScelta("no")}>
            No
          </Pastiglia>
          {FISSE.map((c) => (
            <Pastiglia key={c} attiva={scelta === c} onClick={() => onScelta(c)}>
              {intero(c, currency)}
            </Pastiglia>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onScelta("mia")}
          aria-pressed={scelta === "mia"}
          className={`mt-2 w-full rounded-2xl border px-4 py-3 text-[15px] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            scelta === "mia" ? "border-accent bg-accent/15" : "border-border text-muted-foreground"
          }`}
        >
          Un altro importo
        </button>
      </div>

      {scelta === "mia" && (
        <div className="rounded-[20px] border border-border/70 bg-background/40 px-4 py-3">
          <label htmlFor="mancia" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Quanto vuoi lasciare
          </label>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-display text-[26px] text-muted-foreground" aria-hidden="true">
              {currency === "EUR" ? "€" : currency}
            </span>
            <input
              id="mancia"
              value={testoMia}
              onChange={(e) => onTestoMia(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              autoFocus
              className="text-display w-full bg-transparent text-[30px] leading-none tabular-nums outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      )}

      <details className="rounded-[20px] border border-border/70 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Vuoi la ricevuta via email?
          <span className="text-[13px] text-accent-strong">Facoltativo</span>
        </summary>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          inputMode="email"
          autoComplete="email"
          placeholder="nome@esempio.it"
          aria-label="La tua email"
          className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] outline-none focus:border-accent"
        />
      </details>
    </div>
  );
}

/** Quanto vale la mancia scelta, in centesimi. */
export function manciaScelta(scelta: SceltaMancia, testoMia: string): number {
  if (scelta === "no") return 0;
  if (scelta === "mia") return centesimiDaTesto(testoMia) ?? 0;
  return scelta;
}

/**
 * «1 €», non «1,00 €».
 *
 * Su una pastiglia larga settantasette pixel i due decimali sono rumore: sono
 * sempre zero, e allungano l'etichetta di un terzo. Il resto della pagina
 * tiene i centesimi, perché lì sono cifre vere.
 */
function intero(cents: number, currency: string): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function Pastiglia({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={`h-12 rounded-2xl text-[16px] font-semibold tabular-nums transition duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        attiva
          ? "bg-cream text-clay-ink"
          : "border border-border-strong text-foreground hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );
}
