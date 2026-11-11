import { Check, CircleAlert } from "lucide-react";
import type { RisultatiCampagna } from "@/server/dem/statistiche";
import { cn } from "@/lib/utils";

/**
 * I pezzi visivi del dettaglio campagna (11 novembre 2026).
 *
 * Prima la pagina era otto numeri in maiuscoletto su due righe, un grafico a
 * tre barre che ripeteva tre di quei numeri, e quattro paragrafi di note in
 * mezzo: tutto alla stessa voce, nessun punto da cui partire. Ora ogni domanda
 * ha la sua forma:
 *
 * - **com'è andata** → il percorso, un imbuto a barre orizzontali sulla stessa
 *   base (le inviate), così il calo fra un passo e l'altro si vede;
 * - **è arrivata?** → una barra sola divisa per esito, più i segnali di guaio;
 * - **quando** → la cronologia come linea del tempo.
 *
 * I colori vengono dal validatore della skill dataviz sul fondo Carta
 * (`#f6efe1`): verde `#1f8058` e oro `#b07d2a` passano tutti i controlli; la
 * separazione per protanopia è a 7,2, nella fascia che chiede una seconda
 * codifica, e ce l'hanno: etichette scritte e legenda.
 *
 * Le percentuali che non si possono calcolare restano un trattino, non uno
 * zero (vedi `server/dem/statistiche.ts`).
 */

export const VERDE = "#1f8058";
export const ORO = "#b07d2a";
const ROSSO = "#9c3b22";

const NUM = new Intl.NumberFormat("it-IT");
const pct = (parte: number, base: number) => (base > 0 ? Math.round((parte / base) * 1000) / 10 : null);
const pctTesto = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("it-IT")}%`);

/* -------------------------------------------------------------------------- */
/*  Il percorso                                                               */
/* -------------------------------------------------------------------------- */

export function Percorso({ r, prenotazioni }: { r: RisultatiCampagna; prenotazioni: number }) {
  /* «Consegnate» entra solo se il fornitore manda l'esito di consegna. Senza,
     il contatore resta a zero mentre le aperture salgono — e un imbuto che
     scende a 0 e risale a 22 è un disegno sbagliato, non un dato. */
  const consegneTracciate = r.consegnate > 0 || r.aperte === 0;
  const passi = [
    { nome: "Inviate", valore: r.inviate },
    ...(consegneTracciate ? [{ nome: "Consegnate", valore: r.consegnate }] : []),
    { nome: "Aperte", valore: r.aperte },
    { nome: "Click", valore: r.click },
    { nome: "Prenotazioni", valore: prenotazioni, esito: true },
  ];

  return (
    <div>
      <ol className="space-y-3">
        {passi.map((p, i) => {
          const quota = pct(p.valore, r.inviate);
          const precedente = i > 0 ? passi[i - 1].valore : null;
          const dalPrecedente = precedente !== null ? pct(p.valore, precedente) : null;
          return (
            <li key={p.nome} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_7.5rem]">
              <span className="text-base font-medium text-foreground">{p.nome}</span>
              <div
                className="h-9 overflow-hidden rounded-md bg-secondary/60"
                title={`${p.nome}: ${NUM.format(p.valore)} (${pctTesto(quota)} delle inviate)`}
              >
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-700"
                  style={{
                    width: `${p.valore > 0 ? Math.max(1.5, ((p.valore / Math.max(1, r.inviate)) * 100)) : 0}%`,
                    background: p.esito ? ORO : VERDE,
                    opacity: p.esito ? 1 : 1 - i * 0.12,
                  }}
                />
              </div>
              <span className="text-right leading-tight">
                <span className="block font-mono text-xl tabular-nums text-foreground">{NUM.format(p.valore)}</span>
                <span className="block text-xs text-muted-foreground">
                  {i === 0 ? "la base" : dalPrecedente === null ? "—" : `${pctTesto(dalPrecedente)} del passo prima`}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {!consegneTracciate && (
        <p className="mt-4 text-sm text-muted-foreground">
          Il fornitore non ha mandato gli esiti di consegna: il passo «Consegnate» non c&apos;è, le aperture si
          leggono sulle inviate.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  La salute dell'invio                                                      */
/* -------------------------------------------------------------------------- */

export function SaluteInvio({ r }: { r: RisultatiCampagna }) {
  const senzaEsito = Math.max(0, r.inviate - r.consegnate - r.rimbalzi - r.nonRiuscite);
  const fette = [
    { nome: "Consegnate", valore: r.consegnate, colore: VERDE },
    { nome: "Senza esito di consegna", valore: senzaEsito, colore: "hsl(var(--border-strong))" },
    { nome: "Non recapitate", valore: r.rimbalzi, colore: ORO },
    { nome: "Non riuscite", valore: r.nonRiuscite, colore: ROSSO },
  ].filter((f) => f.valore > 0);
  const totale = Math.max(1, fette.reduce((n, f) => n + f.valore, 0));
  const guai = r.rimbalzi + r.nonRiuscite + r.segnalazioni;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
          guai === 0 ? "bg-[#1f8058]/10 text-[#17603f]" : "bg-[#b07d2a]/12 text-[#7a5418]",
        )}
      >
        {guai === 0 ? <Check className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
        {guai === 0 ? "Invio pulito: nessun rimbalzo, errore o segnalazione." : "Qualche email non è arrivata: controlla gli indirizzi."}
      </div>

      <div>
        <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Esito delle email inviate">
          {fette.map((f) => (
            <div
              key={f.nome}
              title={`${f.nome}: ${NUM.format(f.valore)}`}
              style={{ width: `${(f.valore / totale) * 100}%`, background: f.colore }}
            />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          {fette.map((f) => (
            <li key={f.nome} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.colore }} aria-hidden="true" />
              <span className="text-muted-foreground">{f.nome}</span>
              <span className="ml-auto font-mono tabular-nums text-foreground">{NUM.format(f.valore)}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid grid-cols-2 gap-2.5">
        <Segnale nome="Disiscrizioni" valore={r.disiscrizioni} quota={r.tassoDisiscrizione} />
        <Segnale nome="Segnalate come spam" valore={r.segnalazioni} />
      </dl>
    </div>
  );
}

function Segnale({ nome, valore, quota }: { nome: string; valore: number; quota?: number | null }) {
  const male = valore > 0;
  return (
    <div className={cn("rounded-xl border px-3.5 py-3", male ? "border-[#b07d2a]/40 bg-[#b07d2a]/8" : "border-border/60 bg-card-sunken/50")}>
      <dt className="text-sm text-muted-foreground">{nome}</dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        <span className="font-mono text-xl tabular-nums text-foreground">{NUM.format(valore)}</span>
        {quota !== undefined && <span className="text-xs text-muted-foreground">{pctTesto(quota ?? null)}</span>}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  I link più cliccati                                                       */
/* -------------------------------------------------------------------------- */

export function LinkCliccati({ link }: { link: RisultatiCampagna["linkPiuCliccati"] }) {
  const max = Math.max(1, ...link.map((l) => l.click));
  return (
    <ul className="space-y-2.5">
      {link.map((l) => (
        <li key={l.url}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground" title={l.url}>
              {l.url.replace(/^https?:\/\//, "")}
            </span>
            <span className="shrink-0 font-mono tabular-nums">{NUM.format(l.click)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary/60">
            <div className="h-full rounded-full" style={{ width: `${(l.click / max) * 100}%`, background: ORO }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  La cronologia                                                             */
/* -------------------------------------------------------------------------- */

const GIORNO = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const ORA = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

export function Cronologia({ tappe }: { tappe: { etichetta: string; quando: Date }[] }) {
  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:gap-0">
      {tappe.map((t, i) => {
        const ultima = i === tappe.length - 1;
        return (
          <li key={t.etichetta} className="relative flex gap-3 sm:flex-1 sm:flex-col sm:gap-2">
            {/* Il filo fra un punto e il successivo. */}
            {!ultima && (
              <span
                aria-hidden="true"
                className="absolute left-[7px] top-4 h-[calc(100%+0.5rem)] w-px bg-border sm:left-4 sm:top-[7px] sm:h-px sm:w-full"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 sm:mt-0",
                ultima ? "border-transparent" : "border-[#1f8058] bg-card",
              )}
              style={ultima ? { background: VERDE } : undefined}
            />
            <span className="leading-tight sm:pr-3">
              <span className="block text-base font-medium text-foreground">{t.etichetta}</span>
              <span className="block text-sm tabular-nums text-muted-foreground">
                {GIORNO.format(t.quando)} · {ORA.format(t.quando)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  L'email com'è arrivata                                                    */
/* -------------------------------------------------------------------------- */

/**
 * L'email in una cornice da casella di posta: l'oggetto in grassetto come in
 * una lista di messaggi, il corpo su carta bianca. Prima il corpo stava in un
 * riquadro grigio in 12 px, e si leggeva come un campo di un modulo.
 */
export function AnteprimaEmail({ oggetto, corpo }: { oggetto: string; corpo: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card-sunken/40 shadow-[0_6px_16px_rgba(47,31,17,0.06)]">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
      </div>
      <div className="px-4 pb-3 pt-3.5">
        <p className="t-etichetta">Oggetto</p>
        <p className="mt-1 text-lg font-semibold leading-snug text-foreground">{oggetto || "Senza oggetto"}</p>
      </div>
      <div className="relative mx-3 mb-3 max-h-72 overflow-hidden rounded-lg bg-white px-5 py-4 text-[15px] leading-relaxed text-[#2f1f11]">
        {corpo ? (
          <div className="[&_a]:text-[#1f8058] [&_a]:underline [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_img]:max-w-full [&_p+p]:mt-3" dangerouslySetInnerHTML={{ __html: corpo }} />
        ) : (
          <p className="text-[#2f1f11]/50">Nessun testo.</p>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
      </div>
    </div>
  );
}
