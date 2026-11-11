import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronRight, Clock, FileText, Hourglass, Infinity as Sempre, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FasciaTessere, TesseraKpi } from "@/components/ui/tessera-kpi";
import { contoAllaRovescia } from "@/lib/scadenze-dipendente";
import { STATO_SCADENZA_LABEL, STATO_SCADENZA_TONE, dataLunga, type Scadenza } from "@/lib/scheda-dipendente";
import { intervalloCompatto, tipoTurnoBreve } from "@/lib/turni";
import type { RiepilogoPresenze, TurnoProssimo } from "@/server/staff-presenze";
import { cn } from "@/lib/utils";
import { Sezione } from "./sezione";
import type { PersonaDTO } from "./tipi";

/**
 * La Panoramica: il cruscotto della persona.
 *
 * ## Revisione del 4 novembre 2026 (stessa regola della scheda ospite)
 *
 * - **Ogni dato una volta.** Le quattro card in cima — ruolo, reparto,
 *   assunzione, contratto — ripetevano la testata. Adesso sono le tessere
 *   della Panoramica del locale con quattro **numeri** che in testata non
 *   ci sono: da quanto è in squadra, le ore della settimana, le scadenze da
 *   sistemare, i documenti.
 * - **Le scadenze a schede**, ognuna col suo calendarino colorato per stato
 *   (rosso scaduta, oro vicina, verde in regola). Prima ogni riga diceva la
 *   stessa cosa tre volte: «Scade il 4 novembre», «Scade oggi», «In
 *   scadenza». Ora la data sta nel calendarino, il tempo che manca nella
 *   riga, lo stato nella pastiglia.
 * - **La settimana a giorni**: i prossimi sette giorni, anche quelli liberi,
 *   così «nessun turno» si vede invece di leggersi. Dall'11 novembre in
 *   orizzontale, a tutta larghezza (vedi `Settimana`).
 * - Niente testo tagliato: tutto va a capo.
 */
export function Panoramica({
  persona,
  tipoContratto,
  scadenze,
  presenze,
  documenti,
  base,
  oggi,
}: {
  persona: PersonaDTO;
  tipoContratto: string | null;
  scadenze: Scadenza[];
  presenze: RiepilogoPresenze | null;
  documenti: number;
  base: string;
  /** `YYYY-MM-DD` nel fuso del locale. */
  oggi: string;
}) {
  const adesso = new Date();
  const daSistemare = scadenze.filter((s) => s.stato === "scaduto" || s.stato === "in_scadenza").length;
  const anzianita = persona.hireDate ? durataDa(new Date(persona.hireDate), adesso) : null;
  const ore = presenze ? Math.round(presenze.settimana.minutiProgrammati / 60) : null;

  return (
    <div className="space-y-4">
      <FasciaTessere colonne={4}>
        <TesseraKpi
          icona={Hourglass}
          etichetta="In squadra da"
          corta="In squadra"
          valore={anzianita ?? "—"}
          nota={
            persona.hireDate
              ? `${tipoContratto ? `${tipoContratto} · ` : ""}dal ${dataLunga(persona.hireDate)}`
              : "data di assunzione non indicata"
          }
        />
        <TesseraKpi
          icona={CalendarClock}
          etichetta="Ore settimana"
          corta="Ore sett."
          valore={ore != null ? `${ore} h` : "—"}
          nota={
            presenze
              ? `su ${presenze.settimana.turni} ${presenze.settimana.turni === 1 ? "turno" : "turni"} programmati`
              : undefined
          }
        />
        <TesseraKpi
          icona={ShieldCheck}
          etichetta={["Scadenza", "Scadenze"]}
          valore={daSistemare}
          allarme={daSistemare > 0}
          nota={daSistemare === 0 ? "tutto in regola" : "da sistemare: scadute o vicine"}
        />
        <TesseraKpi
          icona={FileText}
          etichetta={["Documento", "Documenti"]}
          valore={documenti}
          nota={documenti === 0 ? "nessun file caricato" : "caricati nella scheda"}
        />
      </FasciaTessere>

      {/* --------------------------------------------------- la settimana */}
      <Sezione
        id="prossimi-turni"
        titolo="Prossimi sette giorni"
        icona={Clock}
        descrizione={riepilogoSettimana(presenze?.prossimi ?? [])}
        azione={
          <Link href={`${base}?tab=presenze`} scroll={false} className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline">
            Turni <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      >
        <Settimana oggi={oggi} turni={presenze?.prossimi ?? []} />
      </Sezione>

      {/* ------------------------------------------------------- scadenze */}
      <Sezione id="scadenze" titolo="Scadenze" icona={ShieldCheck}>
        {scadenze.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nessuna scadenza da tenere d&apos;occhio.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {scadenze.map((s) => (
              <li key={s.chiave}>
                <SchedaScadenza scadenza={s} adesso={adesso} href={`${base}?tab=${s.tab}`} />
              </li>
            ))}
          </ul>
        )}
      </Sezione>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Una scadenza                                                              */
/* -------------------------------------------------------------------------- */

const CALENDARINO: Record<Scadenza["stato"], string> = {
  scaduto: "bg-[linear-gradient(160deg,#9C3B22_0%,#6E2814_100%)] text-cream",
  in_scadenza: "bg-[linear-gradient(160deg,#B8893A_0%,#8A6424_100%)] text-cream",
  valido: "bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)] text-cream",
  assente: "",
};

const mese = new Intl.DateTimeFormat("it-IT", { month: "short" });
const meseAnno = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

function SchedaScadenza({ scadenza: s, adesso, href }: { scadenza: Scadenza; adesso: Date; href: string }) {
  const data = s.scadeIl ? new Date(s.scadeIl) : null;

  /* La riga sotto il titolo dice **quanto manca**, non la data — quella è
     nel calendarino. Una scadenza lontana non si conta in giorni («tra 1420
     giorni» non si legge): si scrive fino a quando è in regola. */
  const riga = !data
    ? s.dettaglio
    : s.stato === "valido" && (s.giorni ?? 0) > 90
      ? `In regola fino a ${meseAnno.format(data)}`
      : (contoAllaRovescia(s, adesso) ?? s.dettaglio);

  return (
    <Link
      href={href}
      scroll={false}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card-sunken/50 p-2.5 transition-colors hover:border-border-strong hover:bg-card-sunken sm:gap-4"
    >
      {data ? (
        <div className="flex w-14 shrink-0 flex-col overflow-hidden rounded-lg text-center shadow-[0_5px_12px_rgba(16,43,34,0.2)]">
          <div className={cn("px-1.5 pb-1 pt-1", CALENDARINO[s.stato])}>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] opacity-80">
              {mese.format(data).replace(".", "")}
            </span>
            <span className="text-display block text-xl leading-none tabular-nums">{data.getDate()}</span>
          </div>
          <span className="bg-secondary py-0.5 font-mono text-[11px] tabular-nums text-foreground">{data.getFullYear()}</span>
        </div>
      ) : s.stato === "valido" ? (
        /* In regola e senza scadenza (un contratto a tempo indeterminato, un
           corso che non scade): il verde del calendarino, con l'infinito al
           posto della data. Il tratteggio resta per ciò che manca. */
        <div
          aria-hidden="true"
          className="grid h-[3.75rem] w-14 shrink-0 place-items-center rounded-lg bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)] text-cream shadow-[0_5px_12px_rgba(16,43,34,0.2)]"
        >
          <Sempre className="h-6 w-6" />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="grid h-[3.75rem] w-14 shrink-0 place-items-center rounded-lg border border-dashed border-border-strong text-lg text-tertiary-foreground"
        >
          —
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] font-medium leading-snug text-foreground">{s.titolo}</p>
        <p
          className={cn(
            "mt-0.5 break-words text-sm",
            s.stato === "scaduto" ? "text-destructive-soft" : s.stato === "in_scadenza" ? "text-accent-strong" : "text-muted-foreground",
          )}
        >
          {riga}
        </p>
      </div>

      {/* Sul telefono la pastiglia non c'è: il colore del calendarino e della
          riga dicono già lo stato, e la riga resta leggibile intera. */}
      <div className="flex shrink-0 items-center gap-2">
        <Badge className="hidden sm:inline-flex" tone={STATO_SCADENZA_TONE[s.stato]}>{STATO_SCADENZA_LABEL[s.stato]}</Badge>
        <ChevronRight className="h-4 w-4 text-tertiary-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  I prossimi sette giorni                                                   */
/* -------------------------------------------------------------------------- */

const giornoSett = new Intl.DateTimeFormat("it-IT", { weekday: "short", timeZone: "UTC" });
const giornoLungo = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/*
 * La settimana in orizzontale (11 novembre 2026): sette colonne affiancate,
 * a tutta larghezza sopra le scadenze. In verticale erano sette righe e una
 * colonna alta 600 px per dire, quasi sempre, «Libero» sette volte. Ora sta
 * in una fascia alta quanto un turno.
 *
 * - oggi è la colonna verde piena;
 * - un giorno lavorato ha l'orario su due righe (inizio sopra, fine sotto)
 *   e il servizio, su un fondo chiaro con il bordo; un giorno libero è una
 *   colonna quieta col trattino;
 * - le assenze hanno il loro colore (malattia rossa, il resto oro);
 * - sotto i 640 px le colonne non si schiacciano: la fascia scorre di lato
 *   dentro la card.
 */
function riepilogoSettimana(turni: TurnoProssimo[]) {
  const lavoro = turni.filter((t) => t.kind === "WORK");
  const giorni = new Set(lavoro.map((t) => t.dateKey)).size;
  if (giorni === 0) return "Nessun turno in calendario.";
  return `${lavoro.length} ${lavoro.length === 1 ? "turno" : "turni"} · ${7 - giorni} ${7 - giorni === 1 ? "giorno libero" : "giorni liberi"}`;
}

function Settimana({ oggi, turni }: { oggi: string; turni: TurnoProssimo[] }) {
  const [y, m, d] = oggi.split("-").map(Number);
  const giorni = Array.from({ length: 7 }, (_, i) => {
    const data = new Date(Date.UTC(y, m - 1, d + i));
    const chiave = data.toISOString().slice(0, 10);
    return { chiave, data, turni: turni.filter((t) => t.dateKey === chiave) };
  });

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="grid min-w-[36rem] grid-cols-7 gap-2">
        {giorni.map((g, i) => {
          const oggiE = i === 0;
          const libero = g.turni.length === 0;
          return (
            <li
              key={g.chiave}
              aria-label={giornoLungo.format(g.data)}
              className={cn(
                "flex min-h-[8.5rem] min-w-0 flex-col rounded-xl border p-2.5",
                oggiE
                  ? "border-transparent bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)] text-cream shadow-[0_8px_18px_rgba(16,43,34,0.22)]"
                  : libero
                    ? "border-dashed border-border/70"
                    : "border-border/60 bg-card-sunken/70",
              )}
            >
              <div className="flex items-baseline justify-between gap-1 leading-none">
                <span className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", oggiE ? "text-cream/75" : "text-muted-foreground")}>
                  {oggiE ? "Oggi" : giornoSett.format(g.data).replace(".", "")}
                </span>
                <span className={cn("text-display text-2xl tabular-nums", !oggiE && libero && "text-tertiary-foreground")}>
                  {g.data.getUTCDate()}
                </span>
              </div>

              <div className="mt-auto flex flex-col gap-1.5 pt-3">
                {libero ? (
                  <span className={cn("text-sm", oggiE ? "text-cream/70" : "text-tertiary-foreground")}>Libero</span>
                ) : (
                  g.turni.map((t, j) =>
                    t.kind === "WORK" && t.startMinute != null && t.endMinute != null ? (
                      <span key={j} className="min-w-0 leading-tight">
                        <span className="block font-mono text-base font-medium tabular-nums">{intervalloCompatto(t.startMinute, t.endMinute)}</span>
                        {t.service && (
                          <span className={cn("block truncate text-xs", oggiE ? "text-cream/70" : "text-muted-foreground")}>{t.service}</span>
                        )}
                      </span>
                    ) : (
                      <span
                        key={j}
                        className={cn(
                          "self-start rounded-full px-2 py-0.5 text-xs font-medium",
                          oggiE
                            ? "bg-cream/15 text-cream"
                            : t.kind === "SICK_LEAVE"
                              ? "bg-destructive/10 text-destructive-soft"
                              : "bg-accent/15 text-accent-strong",
                        )}
                      >
                        {tipoTurnoBreve(t.kind)}
                      </span>
                    ),
                  )
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** «5 anni», «1 anno», «8 mesi», «meno di un mese». */
function durataDa(inizio: Date, adesso: Date): string {
  const mesi = (adesso.getFullYear() - inizio.getFullYear()) * 12 + (adesso.getMonth() - inizio.getMonth()) - (adesso.getDate() < inizio.getDate() ? 1 : 0);
  if (mesi < 1) return "< 1 mese";
  if (mesi < 12) return `${mesi} ${mesi === 1 ? "mese" : "mesi"}`;
  const anni = Math.floor(mesi / 12);
  return `${anni} ${anni === 1 ? "anno" : "anni"}`;
}
