"use client";

import { useMemo } from "react";
import { FAMIGLIE, IconaTipoTurno, PALLINO_LEGENDA } from "@/components/staff/calendario/famiglie";
import { nomeCompleto, type TurnoConPersona } from "@/components/staff/calendario/tipi";
import type { StaffDepartment } from "@prisma/client";
import { famigliaDiTurno, raggruppaPerOrario, type BloccoTurni } from "@/lib/turni-calendario";
import { staffDepartmentOf } from "@/lib/staff-roles";
import { INIZIALI_GIORNI, intervalloCompatto, numeroGiorno, stessoMese, tipoTurnoBreve } from "@/lib/turni";
import { cn } from "@/lib/utils";

/** Il reparto di un turno: quello scritto sul turno se c'è, altrimenti quello
 * della persona. Da qui viene il colore. */
function repartoDi(turno: TurnoConPersona): StaffDepartment {
  return turno.department ?? staffDepartmentOf(turno.persona);
}

/** Quante righe stanno in una casella prima di diventare un elenco. */
const RIGHE_PER_CASELLA = 3;

/**
 * Il mese: non una timeline, una **mappa della copertura**.
 *
 * Trenta giorni × sedici ore non stanno su uno schermo, e provarci darebbe
 * card da tre pixel. Qui il mese risponde a un'altra domanda — «com'è coperto
 * il mese, e dove sono le ferie» — quindi ogni casella dice i servizi del
 * giorno con quante persone hanno dentro, e chi è via. I nomi di chi lavora
 * si leggono entrando nel giorno, che è a un clic sul numero.
 */
export function VistaMese({
  giorni,
  mese,
  oggi,
  giornoSelezionato,
  turni,
  canManage,
  onApri,
  onApriGiorno,
}: {
  giorni: string[];
  mese: string;
  oggi: string;
  giornoSelezionato: string;
  turni: TurnoConPersona[];
  canManage: boolean;
  onApri: (turno: TurnoConPersona) => void;
  onApriGiorno: (dateKey: string) => void;
}) {
  /*
    Il mese non elenca persone: elenca **servizi e assenze**.

    La prima versione mostrava i primi tre nomi del giorno e «+10 altri». Tre
    nomi presi in ordine alfabetico non sono un'informazione: non dicono
    quanti sono, non dicono a che ora, e i dieci che restano fuori sono quelli
    che servivano. Un mese si guarda per due domande sole — *com'è coperto* e
    *chi è via* — e sono esattamente queste due righe.

    I riposi non compaiono uno per uno di proposito: in un organico da tredici
    persone sono due o tre al giorno, riempirebbero ogni casella e nasconderebbero
    le ferie, che sono l'eccezione da vedere.
  */
  const perGiorno = useMemo(() => {
    const m = new Map<string, { blocchi: BloccoTurni<TurnoConPersona>[]; assenze: TurnoConPersona[]; inTurno: number }>();

    for (const t of turni) {
      const voce = m.get(t.dateKey) ?? { blocchi: [], assenze: [], inTurno: 0 };
      m.set(t.dateKey, voce);
      if (t.kind === "WORK" && t.startMinute != null && t.endMinute != null) voce.inTurno++;
      else if (t.kind === "VACATION" || t.kind === "LEAVE" || t.kind === "SICK_LEAVE") voce.assenze.push(t);
    }

    for (const [giorno, voce] of m) {
      const lavoro = turni.filter(
        (t): t is TurnoConPersona & { startMinute: number; endMinute: number } =>
          t.dateKey === giorno && t.kind === "WORK" && t.startMinute != null && t.endMinute != null,
      );

      /*
        Si raggruppa per orario **dentro ogni reparto**, non per orario e basta.

        Con un gruppo solo, la sera in cui sei persone di sala e una del bar
        fanno 18–24 diventava una riga blu da sette: il colore prendeva quello
        del primo della lista e il bar spariva dentro la sala. Da quando il
        colore è il reparto, un blocco che ne mescola due è un blocco che
        mente.
      */
      const perReparto = new Map<StaffDepartment, typeof lavoro>();
      for (const t of lavoro) {
        const reparto = repartoDi(t);
        const lista = perReparto.get(reparto);
        if (lista) lista.push(t);
        else perReparto.set(reparto, [t]);
      }

      voce.blocchi = [...perReparto.values()]
        .flatMap((dello) => raggruppaPerOrario(dello))
        .sort((a, b) => a.startMinute - b.startMinute || b.turni.length - a.turni.length);
    }
    return m;
  }, [turni]);

  return (
    <div className="fill-scroll riquadro flex flex-col overflow-auto bg-[color:var(--grid-body)]">
      <div className="sticky top-0 z-20 grid shrink-0 grid-cols-7 border-b border-border/50 bg-[#11241b]">
        {INIZIALI_GIORNI.map((iniziale, i) => (
          <span key={i} className="t-etichetta px-2 py-1.5 text-center text-[0.62rem]">
            {iniziale}
          </span>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-7">
        {giorni.map((g) => {
          const dentro = stessoMese(g, mese);
          const voce = perGiorno.get(g);
          const blocchi = voce?.blocchi ?? [];
          const assenze = voce?.assenze ?? [];
          const righe = [...blocchi, ...assenze];
          const nascosti = Math.max(0, righe.length - RIGHE_PER_CASELLA);
          const oggiQui = g === oggi;

          return (
            <div
              key={g}
              className={cn(
                "flex min-h-[6.5rem] min-w-0 flex-col gap-1 border-b border-r border-border/25 p-1.5",
                !dentro && "opacity-40",
                oggiQui && "bg-cream/[0.04]",
                g === giornoSelezionato && !oggiQui && "bg-cream/[0.018]",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onApriGiorno(g)}
                  aria-label={`Apri il ${new Date(`${g}T12:00:00`).toLocaleDateString("it-IT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}`}
                  className={cn(
                    "grid h-6 min-w-[1.5rem] place-items-center rounded-full px-1 text-xs font-semibold tabular-nums transition-colors",
                    oggiQui ? "bg-accent-strong text-accent-strong-foreground" : "text-foreground/80 hover:bg-cream/10",
                  )}
                >
                  {numeroGiorno(g)}
                </button>
                {(voce?.inTurno ?? 0) > 0 && (
                  <span className="shrink-0 text-[0.66rem] tabular-nums text-muted-foreground">{voce!.inTurno}</span>
                )}
              </div>

              <div className="min-h-0 space-y-0.5">
                {blocchi.slice(0, RIGHE_PER_CASELLA).map((blocco) => {
                  const famiglia = FAMIGLIE[famigliaDiTurno("WORK", repartoDi(blocco.turni[0]))];
                  return (
                    <button
                      key={`${repartoDi(blocco.turni[0])}|${blocco.id}`}
                      type="button"
                      onClick={() => onApriGiorno(g)}
                      title={`${intervalloCompatto(blocco.startMinute, blocco.endMinute)} · ${
                        blocco.turni.length
                      } persone: ${blocco.turni.map((t) => nomeCompleto(t.persona)).join(", ")}`}
                      className={cn(
                        "flex w-full items-center gap-1 overflow-hidden rounded border px-1 py-[2px] text-left transition-colors hover:bg-cream/[0.08]",
                        famiglia.carta,
                      )}
                    >
                      <span aria-hidden="true" className={cn("h-2.5 w-[2px] shrink-0 rounded-full", PALLINO_LEGENDA[famigliaDiTurno("WORK", repartoDi(blocco.turni[0]))])} />
                      <span className={cn("shrink-0 text-[0.62rem] tabular-nums", famiglia.testo)}>
                        {intervalloCompatto(blocco.startMinute, blocco.endMinute)}
                      </span>
                      <span className="ml-auto shrink-0 text-[0.64rem] tabular-nums text-cream/70">
                        {blocco.turni.length}
                      </span>
                    </button>
                  );
                })}

                {assenze.slice(0, Math.max(0, RIGHE_PER_CASELLA - blocchi.length)).map((t) => {
                  const famiglia = FAMIGLIE[famigliaDiTurno(t.kind, repartoDi(t))];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => canManage && onApri(t)}
                      disabled={!canManage}
                      title={`${nomeCompleto(t.persona)} · ${tipoTurnoBreve(t.kind)}`}
                      className={cn(
                        "flex w-full items-center gap-1 overflow-hidden rounded border px-1 py-[2px] text-left transition-colors",
                        famiglia.carta,
                        canManage ? "hover:bg-cream/[0.08]" : "cursor-default",
                      )}
                    >
                      <IconaTipoTurno kind={t.kind} className={cn("h-2.5 w-2.5 shrink-0", famiglia.testo)} />
                      <span className="min-w-0 flex-1 truncate text-[0.64rem] leading-tight text-cream/85">
                        {t.persona.lastName}
                      </span>
                    </button>
                  );
                })}

                {nascosti > 0 && (
                  <button
                    type="button"
                    onClick={() => onApriGiorno(g)}
                    className="w-full px-1 text-left text-[0.64rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    +{nascosti} {nascosti === 1 ? "altro" : "altri"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
