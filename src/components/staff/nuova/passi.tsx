import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * I passi della registrazione, nell'ordine delle linguette della scheda:
 * chi ha registrato una persona e poi apre la sua scheda ritrova i campi
 * dove li ha scritti.
 *
 * Dati personali e Lavoro sono divisi in sotto-passi piccoli — tre o quattro
 * campi l'uno — così ogni schermata sta nell'altezza di un portatile senza
 * scorrere. Turni, presenze e note non ci sono: di una persona appena assunta
 * non c'è ancora niente da dire lì.
 */
export const PASSI_NUOVA = [
  { chiave: "personali", label: "Dati personali" },
  { chiave: "lavoro", label: "Lavoro" },
  { chiave: "documenti", label: "Documenti" },
  { chiave: "formazione", label: "Formazione" },
  { chiave: "account", label: "Accesso" },
] as const;

export type PassoNuova = (typeof PASSI_NUOVA)[number]["chiave"];

export const SOTTOPASSI = {
  personali: [
    { chiave: "anagrafica", label: "Anagrafica" },
    { chiave: "contatti", label: "Contatti" },
    { chiave: "residenza", label: "Residenza" },
  ],
  lavoro: [
    { chiave: "ruolo", label: "Ruolo" },
    { chiave: "pagamento", label: "Pagamento" },
    { chiave: "contratto", label: "Contratto" },
  ],
} as const;

export type SottoPasso = (typeof SOTTOPASSI)[keyof typeof SOTTOPASSI][number]["chiave"];

export function ePassoNuova(v: string | undefined): v is PassoNuova {
  return PASSI_NUOVA.some((p) => p.chiave === v);
}

/**
 * La guida verticale, nella colonna di sinistra.
 *
 * Prima che la persona esista i passi non si cliccano: non c'è ancora una
 * scheda su cui saltare. Dopo, sì — ogni passo è la stessa sezione della
 * scheda, e ci si torna quando si vuole.
 */
export function GuidaPassi({
  attivo,
  sotto,
  idPersona,
  nascondi = [],
}: {
  attivo: PassoNuova;
  /** Il sotto-passo aperto, nei passi che ne hanno. */
  sotto?: SottoPasso;
  idPersona: string | null;
  /** Sotto-passi che per questo utente non ci sono (il contratto, senza il permesso). */
  nascondi?: SottoPasso[];
}) {
  const indiceAttivo = PASSI_NUOVA.findIndex((p) => p.chiave === attivo);

  return (
    <nav aria-label="Passi della registrazione">
      <ol className="relative space-y-1">
        {PASSI_NUOVA.map((p, i) => {
          const fatto = i < indiceAttivo;
          const corrente = i === indiceAttivo;
          const cliccabile = !!idPersona && !corrente;
          const sotti = (p.chiave in SOTTOPASSI ? SOTTOPASSI[p.chiave as keyof typeof SOTTOPASSI] : []).filter(
            (s) => !nascondi.includes(s.chiave),
          );
          const indiceSotto = sotti.findIndex((s) => s.chiave === sotto);

          const riga = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                  corrente
                    ? "bg-segment text-segment-ink"
                    : fatto
                      ? "bg-[hsl(var(--turno-sala))] text-cream"
                      : "border border-border-strong/50 bg-card text-muted-foreground",
                )}
              >
                {fatto ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("text-sm", corrente ? "font-semibold text-foreground" : fatto ? "text-foreground/85" : "text-muted-foreground")}>
                {p.label}
              </span>
            </>
          );

          return (
            <li key={p.chiave} className="relative">
              {/* Il filo che lega i pallini: si ferma all'ultimo. */}
              {i < PASSI_NUOVA.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[13.5px] top-8 h-[calc(100%-1.25rem)] w-px",
                    fatto ? "bg-[hsl(var(--turno-sala)/0.6)]" : "bg-border",
                  )}
                />
              )}
              {cliccabile ? (
                <Link
                  href={`/staff/nuova?id=${idPersona}&passo=${p.chiave}`}
                  scroll={false}
                  className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-veil-10"
                >
                  {riga}
                </Link>
              ) : (
                <span className="flex items-center gap-3 px-2 py-1.5" aria-current={corrente ? "step" : undefined}>
                  {riga}
                </span>
              )}

              {corrente && sotti.length > 0 && sotto && (
                <ol className="mb-2 ml-[42px] mt-0.5 space-y-0.5">
                  {sotti.map((s, j) => (
                    <li
                      key={s.chiave}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1 text-[13px]",
                        j === indiceSotto ? "bg-veil-10 font-medium text-foreground" : j < indiceSotto ? "text-foreground/75" : "text-muted-foreground",
                      )}
                      aria-current={j === indiceSotto ? "step" : undefined}
                    >
                      {j < indiceSotto ? (
                        <Check className="h-3 w-3 text-[hsl(var(--turno-sala))]" aria-hidden="true" />
                      ) : (
                        <span
                          aria-hidden="true"
                          className={cn("h-1.5 w-1.5 rounded-full", j === indiceSotto ? "bg-foreground" : "bg-border-strong/50")}
                        />
                      )}
                      {s.label}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Sotto `lg` la colonna non c'è: al suo posto una riga con il passo e una
 * barra di avanzamento. Sul telefono cinque etichette in fila non ci stanno.
 */
export function BarraPassiCompatta({ attivo, sotto, nascondi = [] }: { attivo: PassoNuova; sotto?: SottoPasso; nascondi?: SottoPasso[] }) {
  const i = PASSI_NUOVA.findIndex((p) => p.chiave === attivo);
  const sotti = (attivo in SOTTOPASSI ? SOTTOPASSI[attivo as keyof typeof SOTTOPASSI] : []).filter((s) => !nascondi.includes(s.chiave));
  const sottoLabel = sotti.find((s) => s.chiave === sotto)?.label;
  return (
    <div className="space-y-2">
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {PASSI_NUOVA[i].label}
          {sottoLabel && <span className="text-muted-foreground"> · {sottoLabel}</span>}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Passo {i + 1} di {PASSI_NUOVA.length}
        </span>
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {PASSI_NUOVA.map((p, j) => (
          <span
            key={p.chiave}
            className={cn("h-1 flex-1 rounded-full", j < i ? "bg-[hsl(var(--turno-sala))]" : j === i ? "bg-foreground/70" : "bg-border")}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * La persona che si sta registrando, mentre la si scrive: iniziali, nome,
 * ruolo, recapiti. Riempie la colonna sotto i passi e fa da controllo — un
 * cognome sbagliato si vede lì prima che altrove.
 */
export function Anteprima({
  nome,
  cognome,
  ruolo,
  telefono,
  email,
}: {
  nome: string;
  cognome: string;
  ruolo?: string | null;
  telefono?: string | null;
  email?: string | null;
}) {
  const iniziali = `${nome.trim()[0] ?? ""}${cognome.trim()[0] ?? ""}`.toUpperCase();
  const completo = `${nome} ${cognome}`.trim();
  return (
    <div className="riquadro bg-card/50 p-4">
      <p className="t-etichetta mb-3">Anteprima</p>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-sm font-semibold text-cream">
          {iniziali || "?"}
        </span>
        <div className="min-w-0">
          <p className={cn("truncate text-base", completo ? "font-medium" : "text-tertiary-foreground")}>{completo || "Nome e cognome"}</p>
          <p className="truncate text-xs text-muted-foreground">{ruolo || "Ruolo da scegliere"}</p>
        </div>
      </div>
      {(telefono || email) && (
        <dl className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
          {telefono && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-muted-foreground">Telefono</dt>
              <dd className="truncate">{telefono}</dd>
            </div>
          )}
          {email && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-muted-foreground">Email</dt>
              <dd className="truncate">{email}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * L'impaginazione della registrazione, a tutta larghezza come le altre
 * pagine dello Staff: la colonna con i passi e l'anteprima a sinistra, il
 * modulo a destra, il piede fermo in fondo. Prima era una colonna centrata
 * da 1000 px con due fasce vuote ai lati e un modulo che scorreva.
 */
export function ImpaginazioneNuova({
  testata,
  colonna,
  sottoColonna,
  barraCompatta,
  piede,
  children,
}: {
  testata: ReactNode;
  colonna: ReactNode;
  /** Sotto i passi: l'anteprima della persona. */
  sottoColonna?: ReactNode;
  barraCompatta: ReactNode;
  piede: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="schermo fondo-caldo gap-4">
      {testata}
      <div className="fill flex min-h-0 gap-6">
        <aside className="hidden w-[272px] shrink-0 flex-col gap-4 overflow-y-auto pb-2 lg:flex">
          <div className="riquadro bg-card/50 p-3">{colonna}</div>
          {sottoColonna}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="fissa lg:hidden">{barraCompatta}</div>
          <div className="fill-scroll -mx-1 px-1 pb-2">{children}</div>
          {piede}
        </div>
      </div>
    </div>
  );
}

/** La testata: indietro allo Staff, titolo, una riga di contesto. */
export function TestataNuova({ titolo, sottotitolo }: { titolo: string; sottotitolo: string }) {
  return (
    <header className="fissa flex items-center gap-3">
      <Link
        href="/staff"
        aria-label="Torna allo staff"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/70 text-foreground/80 transition-colors hover:bg-veil-10"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate text-display text-2xl leading-tight">{titolo}</h1>
        <p className="truncate text-sm text-muted-foreground">{sottotitolo}</p>
      </div>
    </header>
  );
}
