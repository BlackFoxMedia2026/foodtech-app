import Link from "next/link";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrattiSfumati } from "@/components/ui/tessera-kpi";
import { computeDelta } from "@/lib/period-delta";
import { shiftDateKey } from "@/lib/venue-time";
import { cn } from "@/lib/utils";
import type { RigaSintesi, TonoSintesi } from "@/server/sintesi-esecutiva";
import type { PuntoNelTempo } from "./coperti-nel-tempo";

/**
 * I pezzi di «Com'è andata» (18 nov 2026).
 *
 * La vista era tre rendiconti uno sotto l'altro: sette tessere, poi un
 * «Confronto periodi» con **gli stessi sei numeri** e la loro variazione,
 * poi un elenco di frasi. Lo stesso dato si leggeva due volte, la settima
 * tessera restava sola in fondo, e non c'era un solo disegno che dicesse
 * com'è andata *nel tempo*.
 *
 * Ora: quattro numeri che contano, ognuno con il confronto **dentro** la
 * tessera; la curva dei coperti accanto alla sintesi; come sono finite le
 * prenotazioni in una barra sola.
 */

/* -------------------------------------------------------------------------- */
/*  Le tessere con il confronto                                                */
/* -------------------------------------------------------------------------- */

export function FilaConfronto({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <TrattiSfumati />
      <ul className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">{children}</ul>
    </section>
  );
}

/**
 * Un numero del periodo: il valore e, in alto a destra, quanto è cambiato.
 *
 * Tutto il resto — il valore di prima, su cosa è misurato, la curva — sta
 * nella pagina del numero, dove porta la tessera (18 nov 2026): qui le righe
 * sotto il numero allungavano la fascia e spingevano la vista sotto lo
 * schermo.
 *
 * La freccia viene dal segno, il colore dal giudizio: sono due cose diverse.
 */
export function TesseraConfronto({
  href,
  icona: Icona,
  etichetta,
  valore,
  ora,
  prima,
  confrontabile = true,
}: {
  href: string;
  icona: React.ComponentType<{ className?: string; stroke?: string }>;
  etichetta: string;
  valore: string;
  ora: number;
  prima: number;
  /** Falso quando uno dei due periodi non ha una base per il confronto. */
  confrontabile?: boolean;
}) {
  const delta = confrontabile ? computeDelta(ora, prima) : ({ available: false } as const);

  return (
    <li>
      <Link
        href={href}
        className="vetro card-notch group flex h-full items-center gap-3 p-3.5 transition-transform duration-200 hover:-translate-y-0.5 sm:p-4"
        aria-label={`${etichetta}: ${valore}${delta.available ? `, ${delta.value >= 0 ? "più" : "meno"} ${Math.abs(delta.value)}%` : ""}. Apri il dettaglio`}
      >
        <span className="vetro kpi-pastiglia hidden h-11 w-11 shrink-0 place-items-center rounded-full xl:grid">
          <Icona className="h-5 w-5" stroke="url(#trattoVetro)" />
        </span>
        <div className="min-w-0 flex-1 [container-type:inline-size]">
          <div className="flex items-start justify-between gap-2">
            <p className="t-etichetta flex min-w-0 items-center gap-1.5 text-sm text-kpi-label-muted max-sm:text-[13px] max-sm:tracking-[0.02em]">
              <Icona className="h-5 w-5 shrink-0 xl:hidden" stroke="url(#trattoTenue)" />
              <span className="truncate">{etichetta}</span>
            </p>
            {delta.available && <PastigliaDelta delta={delta} className="max-sm:hidden" />}
          </div>
          <p
            className={cn(
              "mt-1 flex h-10 items-center font-mono leading-none tabular-nums text-foreground",
              // Il numero segue la larghezza della tessera: «4.838,00 €» non
              // va mai a capo e non esce dal bordo.
              valore.length > 5 ? "text-[clamp(1.375rem,13cqw,2rem)]" : "text-[clamp(1.75rem,16cqw,2.25rem)]",
            )}
          >
            {valore}
          </p>
          {/* Sul telefono la riga del nome è stretta: la pastiglia scende. */}
          {delta.available && <PastigliaDelta delta={delta} className="mt-1 sm:hidden" />}
        </div>
      </Link>
    </li>
  );
}

function PastigliaDelta({
  delta,
  className,
}: {
  delta: { value: number; isGood: boolean | null };
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium tabular-nums",
        delta.value === 0
          ? "bg-border/60 text-muted-foreground"
          : delta.isGood
            ? "bg-sage-strong/15 text-sage-strong"
            : "bg-destructive-soft/15 text-destructive-soft",
        className,
      )}
    >
      {delta.value === 0 ? "=" : delta.value > 0 ? "▲" : "▼"} {Math.abs(delta.value)}%
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  La sintesi, accanto alla curva                                             */
/* -------------------------------------------------------------------------- */

const TONO: Record<TonoSintesi, { punto: string; nome: string }> = {
  problema: { punto: "bg-destructive-soft", nome: "Da guardare" },
  attenzione: { punto: "bg-accent", nome: "Da sapere" },
  bene: { punto: "bg-sage-strong", nome: "Bene" },
};

/**
 * La sintesi come un elenco da app: una frase per riga, un pallino che dice
 * se è un problema, e un filetto fra le righe.
 *
 * La base di ogni numero c'è sempre, ma **dietro la «i»**: scritta sotto ogni
 * riga raddoppiava il testo e la sintesi non si leggeva più come sintesi
 * (18 nov 2026, «troppo caotica»).
 */
export function RigheSintesi({ righe }: { righe: RigaSintesi[] }) {
  if (righe.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nessuno scostamento rilevante rispetto al periodo prima, e niente da segnalare fra assenze, costi e voti.
      </p>
    );
  }
  return (
    <ul className="-my-1 flex flex-1 flex-col divide-y divide-border/60">
      {righe.map((r) => {
        const t = TONO[r.tono];
        return (
          <li key={r.testo} className="flex flex-1 items-center gap-3 py-3">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", t.punto)} title={t.nome} aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[15px] leading-snug text-card-foreground">
              <span className="sr-only">{t.nome}: </span>
              {r.testo}
            </p>
            <Popover>
              <PopoverTrigger
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
                aria-label="Su cosa è misurato"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1 font-semibold text-card-foreground">Su cosa è misurato</p>
                {r.base}
              </PopoverContent>
            </Popover>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Come sono finite le prenotazioni                                           */
/* -------------------------------------------------------------------------- */

type Esito = { nome: string; pct: number; prima: number; colore: string; meglioSeScende?: boolean };

/**
 * Completate, assenze, cancellazioni e quelle ancora aperte: le quattro parti
 * di un intero, quindi **una barra sola** invece di tre tessere di
 * percentuali che il lettore doveva sommare a mente.
 */
export function EsitoPrenotazioni({
  totale,
  completate,
  noShow,
  cancellate,
  prima,
  affidabile,
  perche,
}: {
  totale: number;
  completate: number;
  noShow: number;
  cancellate: number;
  prima: { completate: number; noShow: number; cancellate: number; affidabile: boolean };
  /** Abbastanza prenotazioni perché una percentuale dica qualcosa. */
  affidabile: boolean;
  perche: string;
}) {
  if (!affidabile) {
    return <p className="text-sm text-muted-foreground">{perche}</p>;
  }
  const aperte = Math.max(0, 100 - completate - noShow - cancellate);
  const primaAperte = Math.max(0, 100 - prima.completate - prima.noShow - prima.cancellate);
  const esiti: Esito[] = [
    { nome: "Completate", pct: completate, prima: prima.completate, colore: "bg-sage-strong" },
    { nome: "Ancora aperte", pct: aperte, prima: primaAperte, colore: "bg-border" },
    { nome: "Cancellate", pct: cancellate, prima: prima.cancellate, colore: "bg-accent", meglioSeScende: true },
    { nome: "No-show", pct: noShow, prima: prima.noShow, colore: "bg-destructive-soft", meglioSeScende: true },
  ];

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-border/50"
        role="img"
        aria-label={`Su ${totale} prenotazioni: ${esiti.map((e) => `${e.nome} ${e.pct}%`).join(", ")}`}
      >
        {esiti.map((e) =>
          e.pct > 0 ? (
            <span key={e.nome} className={cn("h-full first:rounded-l-full last:rounded-r-full", e.colore)} style={{ width: `${e.pct}%` }} />
          ) : null,
        )}
      </div>
      {/* Una riga sola, come una legenda: il numero accanto al nome. */}
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 md:flex md:flex-wrap md:items-center">
        {esiti.map((e) => {
          const d = prima.affidabile
            ? computeDelta(e.pct, e.prima, { kind: "rate", higherIsBetter: !e.meglioSeScende })
            : ({ available: false } as const);
          // «Ancora aperte» non è né buono né cattivo: è il calendario.
          const neutro = e.nome === "Ancora aperte";
          return (
            <li key={e.nome} className="flex min-w-0 items-center gap-2 text-sm">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", e.colore)} aria-hidden="true" />
              <span className="text-muted-foreground">{e.nome}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono tabular-nums text-foreground">{e.pct}%</span>
                {d.available && d.value !== 0 && (
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      neutro ? "text-muted-foreground" : d.isGood ? "text-sage-strong" : "text-destructive-soft",
                    )}
                  >
                    {d.value > 0 ? "▲" : "▼"} {Math.abs(d.value)} pt
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  I punti della curva                                                        */
/* -------------------------------------------------------------------------- */

const GIORNO = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", timeZone: "UTC" });
const GIORNO_LUNGO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const DATA_CORTA = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

const comeData = (k: string) => new Date(`${k}T12:00:00Z`);

/**
 * Giorno per giorno fino a due mesi; oltre, settimana per settimana: novanta
 * punti o trecento non si leggono, e la curva diventa un pettine.
 *
 * Il periodo prima è allineato **per posizione** (il primo giorno con il
 * primo giorno), che è quello che il confronto delle tessere misura.
 */
export function puntiNelTempo(
  dalKey: string,
  alKey: string,
  ora: Record<string, number>,
  prima: Record<string, number>,
): PuntoNelTempo[] {
  const giorni: string[] = [];
  for (let k = dalKey; k <= alKey && giorni.length < 400; k = shiftDateKey(k, 1)) giorni.push(k);
  const n = giorni.length;

  if (n <= 62) {
    return giorni.map((k) => ({
      etichetta: GIORNO.format(comeData(k)).replace(".", ""),
      quando: GIORNO_LUNGO.format(comeData(k)),
      ora: ora[k] ?? 0,
      prima: prima[shiftDateKey(k, -n)] ?? 0,
    }));
  }

  const punti: PuntoNelTempo[] = [];
  for (let i = 0; i < n; i += 7) {
    const blocco = giorni.slice(i, i + 7);
    const somma = (m: Record<string, number>, sposta: number) =>
      blocco.reduce((s, k) => s + (m[shiftDateKey(k, sposta)] ?? 0), 0);
    const primo = blocco[0];
    const ultimo = blocco[blocco.length - 1];
    punti.push({
      etichetta: DATA_CORTA.format(comeData(primo)).replace(".", ""),
      quando: `Dal ${DATA_CORTA.format(comeData(primo))} al ${DATA_CORTA.format(comeData(ultimo))}`,
      ora: somma(ora, 0),
      prima: somma(prima, -n),
    });
  }
  return punti;
}
