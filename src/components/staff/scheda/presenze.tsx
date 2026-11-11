import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Palmtree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { etichettaSettimana, intervalloCompatto, tipoTurnoBreve, tipoTurnoLabel } from "@/lib/turni";
import { dataBreve } from "@/lib/scheda-dipendente";
import type { RiepilogoPresenze } from "@/server/staff-presenze";
import { cn } from "@/lib/utils";
import { Sezione } from "./sezione";

/**
 * Turni e presenze della persona: una **vista filtrata** sul calendario, non
 * un secondo calendario. Quattro numeri della settimana, i prossimi sette
 * giorni, e le assenze dell'anno con lo storico. Per pianificare si va al
 * calendario, che è a un clic.
 *
 * «Già svolte» e non «lavorate»: Tavolo non ha una timbratura, quindi le ore
 * sono quelle pianificate nei turni già passati. Scriverlo evita di far
 * credere a un numero che il prodotto non misura.
 */
export function Presenze({ riepilogo, oggi }: { riepilogo: RiepilogoPresenze; oggi: string }) {
  const s = riepilogo.settimana;
  const a = riepilogo.anno;

  return (
    <div className="space-y-5">
      <Sezione
        id="settimana"
        titolo="Questa settimana"
        icona={CalendarClock}
        descrizione={etichettaSettimana(s.lunedi)}
        azione={
          <Link href={`/staff/turni?g=${oggi}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline">
            Apri calendario completo <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Dato {...ore(s.minutiProgrammati)} etichetta="programmate" tinta="settimana" primo />
          <Dato {...ore(s.minutiSvolti)} etichetta="già svolte" nota="dai turni passati" tinta="settimana" />
          <Dato valore={String(s.turni)} etichetta={s.turni === 1 ? "turno" : "turni"} tinta="settimana" />
          <Dato valore={String(s.assenze)} etichetta={s.assenze === 1 ? "assenza" : "assenze"} tinta="settimana" allarme={s.assenze > 0} />
        </div>

        <Sottotitolo>Prossimi turni</Sottotitolo>
        {riepilogo.prossimi.length === 0 ? (
          <Vuoto>Nessun turno pianificato nei prossimi sette giorni.</Vuoto>
        ) : (
          <ul className="divide-y divide-border/60">
            {riepilogo.prossimi.map((t) => (
              <li key={t.dateKey} className="flex items-center justify-between gap-4 py-3.5">
                <span className={cn("text-base capitalize md:text-lg", t.dateKey === oggi ? "font-medium text-foreground" : "text-foreground")}>
                  {giornoLeggibile(t.dateKey)}
                  {t.dateKey === oggi && <span className="ml-2 text-sm text-accent-strong">oggi</span>}
                </span>
                {t.kind === "WORK" && t.startMinute != null && t.endMinute != null ? (
                  <span className="text-base tabular-nums text-foreground md:text-lg">
                    {intervalloCompatto(t.startMinute, t.endMinute)}
                    {t.service && <span className="ml-2 text-sm text-muted-foreground">{t.service}</span>}
                  </span>
                ) : (
                  <span className="text-base text-muted-foreground md:text-lg">{tipoTurnoBreve(t.kind)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sezione>

      <Sezione id="assenze" titolo="Ferie, permessi e assenze" icona={Palmtree} descrizione={`Anno ${a.anno}. I giorni vengono dai turni segnati nel calendario.`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Dato valore={String(a.ferieUsate)} unita={giorni(a.ferieUsate)} etichetta="ferie usate" tinta="assenze" primo />
          <Dato valore={String(a.feriePianificate)} unita={giorni(a.feriePianificate)} etichetta="ferie programmate" tinta="assenze" />
          <Dato valore={String(a.permessi)} unita={giorni(a.permessi)} etichetta="permessi" tinta="assenze" />
          <Dato valore={String(a.malattia)} unita={giorni(a.malattia)} etichetta="malattia" tinta="assenze" allarme={a.malattia > 0} />
        </div>

        <Sottotitolo>Storico</Sottotitolo>
        {riepilogo.storicoAssenze.length === 0 ? (
          <Vuoto>Nessuna assenza registrata quest&apos;anno.</Vuoto>
        ) : (
          <ul className="divide-y divide-border/60">
            {riepilogo.storicoAssenze.map((x) => (
              <li key={`${x.kind}-${x.dal}`} className="flex items-center justify-between gap-4 py-3.5">
                <span className="text-base text-foreground md:text-lg">
                  {x.dal === x.al ? dataBreve(x.dal) : `${dataBreve(x.dal)} – ${dataBreve(x.al)}`}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {x.giorni} {x.giorni === 1 ? "giorno" : "giorni"}
                  </span>
                </span>
                <Badge tone={x.kind === "SICK_LEAVE" ? "danger" : "warning"}>{tipoTurnoLabel(x.kind)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Sezione>
    </div>
  );
}

function giornoLeggibile(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function giorni(n: number) {
  return n === 1 ? "giorno" : "giorni";
}

/** «7 h 30′» diviso in numero e unità, per scriverli in due corpi. */
function ore(minuti: number): { valore: string; unita: string } {
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return m === 0 ? { valore: String(h), unita: "h" } : { valore: `${h}:${String(m).padStart(2, "0")}`, unita: "h" };
}

function Sottotitolo({ children }: { children: ReactNode }) {
  return <h3 className="mb-1 mt-7 border-b border-border/60 pb-2 text-sm font-semibold uppercase tracking-wider text-foreground/75">{children}</h3>;
}

function Vuoto({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-4 text-base text-muted-foreground">{children}</p>;
}

/*
 * I numeri della scheda Turni (11 novembre 2026). Prima erano la `Cifra`
 * della scheda ospite: numero a 20 px, etichetta a 13, nota a 11, e le due
 * sezioni avevano tessere identiche — «0 h programmate» e «0 ferie usate» si
 * distinguevano solo leggendo. Ora ogni sezione ha il suo colore (verde la
 * settimana, sabbia dorata le assenze), la prima tessera è piena come la
 * tessera verde della Panoramica, e i corpi salgono: numero a 30 px, unità
 * e etichetta a 16, nota a 14.
 */
const TINTE = {
  settimana: {
    pieno: "border-transparent bg-[linear-gradient(135deg,#1C4A3A_0%,#102B22_100%)] text-cream shadow-[0_8px_18px_rgba(16,43,34,0.22)]",
    tenue: "border-[#1C4A3A]/15 bg-[#1C4A3A]/[0.06] text-[#1C4A3A]",
  },
  assenze: {
    pieno: "border-accent/40 bg-[linear-gradient(135deg,#F3E6C4_0%,#E6CF98_100%)] text-clay-ink",
    tenue: "border-accent/30 bg-[#F3E6C4]/50 text-clay-ink",
  },
} as const;

function Dato({
  valore,
  unita,
  etichetta,
  nota,
  tinta,
  primo = false,
  allarme = false,
}: {
  valore: string;
  unita?: string;
  etichetta: string;
  nota?: string;
  tinta: keyof typeof TINTE;
  /** La prima tessera della fila, a fondo pieno: il dato da leggere per primo. */
  primo?: boolean;
  allarme?: boolean;
}) {
  const scuro = primo && tinta === "settimana";
  return (
    <div className={cn("min-w-0 rounded-xl border px-4 py-4", primo ? TINTE[tinta].pieno : TINTE[tinta].tenue)}>
      <p className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={cn("font-mono text-3xl font-medium leading-9 tabular-nums", allarme && !primo && "text-accent-strong-ink")}>{valore}</span>
        {unita && <span className={cn("text-base", scuro ? "text-cream/75" : "opacity-70")}>{unita}</span>}
      </p>
      <p className={cn("mt-1.5 text-base font-medium leading-snug", scuro ? "text-cream" : "text-foreground")}>{etichetta}</p>
      {nota && <p className={cn("mt-0.5 text-sm leading-snug", scuro ? "text-cream/70" : "text-muted-foreground")}>{nota}</p>}
    </div>
  );
}
