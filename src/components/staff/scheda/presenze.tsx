import Link from "next/link";
import { ArrowRight, CalendarClock, Palmtree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { etichettaSettimana, intervalloCompatto, oreLeggibili, tipoTurnoBreve, tipoTurnoLabel } from "@/lib/turni";
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <Numero valore={oreLeggibili(s.minutiProgrammati)} etichetta="programmate" />
          <Numero valore={oreLeggibili(s.minutiSvolti)} etichetta="già svolte" nota="turni passati" />
          <Numero valore={String(s.turni)} etichetta={s.turni === 1 ? "turno" : "turni"} />
          <Numero valore={String(s.assenze)} etichetta={s.assenze === 1 ? "assenza" : "assenze"} allarme={s.assenze > 0} />
        </div>

        <h3 className="t-etichetta mb-2 mt-8 border-b border-border/60 pb-2 font-medium">Prossimi turni</h3>
        {riepilogo.prossimi.length === 0 ? (
          <p className="text-base text-muted-foreground">Nessun turno pianificato nei prossimi sette giorni.</p>
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <Numero valore={String(a.ferieUsate)} etichetta="ferie usate" nota={a.ferieUsate === 1 ? "giorno" : "giorni"} />
          <Numero valore={String(a.feriePianificate)} etichetta="ferie programmate" nota={a.feriePianificate === 1 ? "giorno" : "giorni"} />
          <Numero valore={String(a.permessi)} etichetta="permessi" nota={a.permessi === 1 ? "giorno" : "giorni"} />
          <Numero valore={String(a.malattia)} etichetta="malattia" nota={a.malattia === 1 ? "giorno" : "giorni"} allarme={a.malattia > 0} />
        </div>

        <h3 className="t-etichetta mb-2 mt-8 border-b border-border/60 pb-2 font-medium">Storico</h3>
        {riepilogo.storicoAssenze.length === 0 ? (
          <p className="text-base text-muted-foreground">Nessuna assenza registrata quest&apos;anno.</p>
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

function Numero({ valore, etichetta, nota, allarme = false }: { valore: string; etichetta: string; nota?: string; allarme?: boolean }) {
  return (
    <div className="riquadro bg-card-sunken p-4">
      <p className={cn("text-display text-3xl leading-none tabular-nums", allarme ? "text-accent-strong" : "text-foreground")}>{valore}</p>
      <p className="mt-2 text-sm font-medium text-foreground/90">{etichetta}</p>
      <p className="text-xs text-muted-foreground">{nota ?? " "}</p>
    </div>
  );
}
