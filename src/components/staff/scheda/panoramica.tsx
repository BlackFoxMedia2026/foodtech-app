import Link from "next/link";
import { ArrowRight, Briefcase, Building2, CalendarDays, ChevronRight, Clock, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { contoAllaRovescia } from "@/lib/scadenze-dipendente";
import {
  STATO_SCADENZA_LABEL,
  STATO_SCADENZA_TONE,
  dataLunga,
  type Scadenza,
} from "@/lib/scheda-dipendente";
import { staffDepartmentLabel } from "@/lib/staff-departments";
import { staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { intervalloCompatto, tipoTurnoBreve } from "@/lib/turni";
import type { RiepilogoPresenze } from "@/server/staff-presenze";
import { cn } from "@/lib/utils";
import { Sezione } from "./sezione";
import type { PersonaDTO } from "./tipi";

/**
 * La Panoramica: il cruscotto della persona.
 *
 * Quattro dati fermi in cima — ruolo, reparto, da quando, con che contratto —
 * e poi **le scadenze**, che sono la parte per cui questa pagina esiste: la
 * visita medica, i corsi, il contratto, i documenti con una data. Scadute in
 * rosso, vicine in oro, il resto in verde; una riga ciascuna, cliccabile,
 * che porta alla linguetta dove si sistema.
 *
 * Sotto, i prossimi turni: pochi, perché qui si guarda e non si pianifica —
 * il calendario è a un clic.
 */
export function Panoramica({
  persona,
  tipoContratto,
  scadenze,
  presenze,
  base,
}: {
  persona: PersonaDTO;
  tipoContratto: string | null;
  scadenze: Scadenza[];
  presenze: RiepilogoPresenze | null;
  base: string;
}) {
  const oggi = new Date();
  const daSistemare = scadenze.filter((s) => s.stato === "scaduto" || s.stato === "in_scadenza").length;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ quattro card */}
      <section aria-label="Dati principali" className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <Carta icona={UserRound} etichetta="Ruolo" valore={persona.primaryRole ? staffPrimaryRoleLabel(persona.primaryRole) : persona.role} />
        <Carta icona={Building2} etichetta="Reparto" valore={staffDepartmentLabel(staffDepartmentOf(persona))} />
        <Carta icona={CalendarDays} etichetta="Data assunzione" valore={persona.hireDate ? dataLunga(persona.hireDate) : null} vuoto="Non indicata" />
        <Carta icona={Briefcase} etichetta="Tipo contratto" valore={tipoContratto} vuoto="Nessun contratto" />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[3fr_2fr]">
        {/* ----------------------------------------------------- scadenze */}
        <Sezione
          id="scadenze"
          titolo="Scadenze"
          icona={ShieldCheck}
          descrizione={
            daSistemare === 0
              ? "Tutto regolare: nessuna scadenza vicina."
              : daSistemare === 1
                ? "Una scadenza da sistemare."
                : `${daSistemare} scadenze da sistemare.`
          }
        >
          <ul className="-mx-2 divide-y divide-border/60">
            {scadenze.map((s) => {
              const conto = contoAllaRovescia(s, oggi);
              return (
                <li key={s.chiave}>
                  <Link
                    href={`${base}?tab=${s.tab}`}
                    scroll={false}
                    className="group flex items-center gap-4 rounded-md px-2 py-3.5 transition-colors hover:bg-cream/[0.04]"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        s.stato === "scaduto" && "bg-destructive",
                        s.stato === "in_scadenza" && "bg-accent-strong",
                        s.stato === "valido" && "bg-sage",
                        s.stato === "assente" && "border border-muted-foreground bg-transparent",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-foreground md:text-lg">{s.titolo}</p>
                      <p className="text-sm text-muted-foreground">{s.dettaglio}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {conto ? (
                        <span
                          className={cn(
                            "hidden text-sm tabular-nums sm:inline",
                            s.stato === "scaduto" ? "text-destructive-soft" : s.stato === "in_scadenza" ? "text-accent-strong" : "text-muted-foreground",
                          )}
                        >
                          {conto}
                        </span>
                      ) : null}
                      <Badge tone={STATO_SCADENZA_TONE[s.stato]}>{STATO_SCADENZA_LABEL[s.stato]}</Badge>
                      <ChevronRight className="h-4 w-4 text-tertiary-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Sezione>

        {/* -------------------------------------------------- prossimi turni */}
        <Sezione
          id="prossimi-turni"
          titolo="Prossimi turni"
          icona={Clock}
          azione={
            <Link href={`${base}?tab=presenze`} scroll={false} className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline">
              Turni e presenze <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {presenze && presenze.prossimi.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {presenze.prossimi.slice(0, 5).map((t) => (
                <li key={t.dateKey} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-base capitalize text-foreground">{giornoLeggibile(t.dateKey)}</span>
                  {t.kind === "WORK" && t.startMinute != null && t.endMinute != null ? (
                    <span className="text-base tabular-nums text-foreground">
                      {intervalloCompatto(t.startMinute, t.endMinute)}
                      {t.service && <span className="ml-2 text-sm text-muted-foreground">{t.service}</span>}
                    </span>
                  ) : (
                    <span className="text-base text-muted-foreground">{tipoTurnoBreve(t.kind)}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun turno pianificato nei prossimi sette giorni.</p>
          )}
          {presenze && (
            <p className="mt-4 border-t border-border/60 pt-3 text-sm text-muted-foreground">
              Questa settimana: <strong className="text-foreground">{Math.round(presenze.settimana.minutiProgrammati / 60)} h</strong> programmate
              su {presenze.settimana.turni} {presenze.settimana.turni === 1 ? "turno" : "turni"}.
            </p>
          )}
        </Sezione>
      </div>
    </div>
  );
}

/** «lunedì 14 settembre» dal `YYYY-MM-DD`, senza passare da un fuso. */
function giornoLeggibile(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function Carta({
  icona: Icona,
  etichetta,
  valore,
  vuoto = "Non indicato",
}: {
  icona: React.ComponentType<{ className?: string }>;
  etichetta: string;
  valore: string | null;
  vuoto?: string;
}) {
  return (
    <div className="surface flex items-start gap-3 p-4 md:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-cream/10 bg-cream/[0.06] text-accent-strong" aria-hidden="true">
        <Icona className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="t-etichetta">{etichetta}</p>
        <p className={cn("mt-1 break-words text-lg leading-tight md:text-xl", valore ? "text-foreground" : "text-tertiary-foreground")}>{valore ?? vuoto}</p>
      </div>
    </div>
  );
}
