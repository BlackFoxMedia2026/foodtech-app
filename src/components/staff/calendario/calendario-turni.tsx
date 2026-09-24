"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import type { WorkShiftKind } from "@prisma/client";
import { readApiError } from "@/lib/api-client";
import { useAvvisi } from "@/components/ui/avvisi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShiftDialog } from "@/components/staff/shift-dialog";
import { BarraLaterale } from "@/components/staff/calendario/barra-laterale";
import { StaffSwitch } from "@/components/staff/staff-switch";
import { filtriAttivi as haFiltri, useFiltriStaff } from "@/components/staff/filtri-staff";
import { TestataCalendario } from "@/components/staff/calendario/testata-calendario";
import { GrigliaTurni, type SpostamentoTurno } from "@/components/staff/calendario/griglia-turni";
import { VistaMese } from "@/components/staff/calendario/vista-mese";
import { LegendaReparti } from "@/components/staff/calendario/legenda-reparti";
import { nomeCompleto, type PersonaTurni, type Turno, type TurnoConPersona, type TurnoOrario, type Vista } from "@/components/staff/calendario/tipi";
import { fasciaVisibile } from "@/lib/turni-calendario";
import { staffDepartmentOf, STAFF_PRIMARY_ROLES } from "@/lib/staff-roles";
import {
  etichettaGiornoLunga,
  etichettaMese,
  etichettaSettimana,
  giorniDellaSettimana,
  lunediDi,
  minutiAOrario,
  primoDelMese,
  spostaMese,
} from "@/lib/turni";
import { shiftDateKey } from "@/lib/venue-time";
import { useSchermoStretto } from "@/lib/use-media-query";
import { useVenueTimezone } from "@/components/shell/venue-time-provider";
import { cn } from "@/lib/utils";

/**
 * IL PLANNING DELLA SETTIMANA.
 *
 * ## Cos'è cambiato, e perché non bastava ritoccare
 *
 * Prima questa pagina era una **tabella persone × giorni**: una riga per
 * dipendente, sette colonne, e in ogni casella l'orario scritto. Quarantanove
 * caselle quasi tutte uguali, in cui per sapere «chi c'è giovedì alle 20» si
 * doveva leggere una colonna dall'alto in basso decifrando quarantanove
 * intervalli. Le due domande che un responsabile fa davvero — *quanti siamo
 * adesso* e *dove manca gente* — non avevano nessuna risposta visiva: erano
 * aritmetica mentale su una griglia di testo.
 *
 * Il modello nuovo è un calendario vero: **il tempo è l'asse verticale**. Un
 * turno non è più una parola in una cella, è un rettangolo alto quanto dura e
 * messo dove comincia. Da lì tutto il resto viene da sé — le sovrapposizioni
 * si vedono perché due rettangoli si affiancano, i buchi si vedono perché una
 * fascia è vuota, la sera piena si vede perché la colonna è piena.
 *
 * ## Chi decide cosa
 *
 *   URL      → il periodo e la vista. Sono navigazione: «mandami il link dei
 *              turni di sabato» deve funzionare, e il ricarico deve riportare
 *              gli stessi dati.
 *   stato    → i filtri e il dialogo. Sono il modo di guardare, non cosa si
 *              guarda: metterli nell'indirizzo vorrebbe dire un giro sul
 *              server per ogni tendina.
 */
export function CalendarioTurni({
  vista,
  giornoSelezionato,
  oggi,
  giorni,
  staff,
  turni,
  serviceOptions,
  canManageShifts,
}: {
  vista: Vista;
  giornoSelezionato: string;
  oggi: string;
  /** I giorni caricati dal server: uno, sette o l'intera griglia del mese. */
  giorni: string[];
  staff: PersonaTurni[];
  turni: Turno[];
  serviceOptions: string[];
  canManageShifts: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const stretto = useSchermoStretto();

  /*
    Sul telefono la settimana **non si comprime**: diventa un giorno.

    Sette colonne su 390 px fanno 48 px l'una: una card larga quanto un dito
    e alta quanto una durata, cioè un grafico di qualcosa di illeggibile. È
    una sostituzione di vista, non un `overflow`, ed è possibile senza un
    altro giro sul server perché i dati del giorno sono già dentro quelli
    della settimana.
  */
  const vistaEffettiva: Vista = stretto && vista === "settimana" ? "giorno" : vista;
  const giorniMostrati = useMemo(
    () => (vistaEffettiva === "giorno" ? [giornoSelezionato] : giorni),
    [vistaEffettiva, giornoSelezionato, giorni],
  );

  /** La fascia evidenziata nel mini-calendario è **sempre una settimana**.
   * In vista Mese i giorni caricati sono trentacinque o quarantadue: passarli
   * tutti accendeva l'intero mini-calendario, cioè non evidenziava niente. */
  const settimanaEvidenziata = useMemo(
    () => giorniDellaSettimana(lunediDi(giornoSelezionato)),
    [giornoSelezionato],
  );

  const [filtri, setFiltri] = useFiltriStaff();
  const [dialogo, setDialogo] = useState<{
    turno: Turno | null;
    personaId: string | null;
    dateKey: string;
    kind: WorkShiftKind;
    /** L'ora su cui si è cliccato, quando si crea da una fascia vuota. */
    inizioMinuti?: number;
  } | null>(null);

  /*
    Le modifiche in volo.

    Quando si trascina una card, la verità sta sul server e ci arriva mezzo
    secondo dopo. Senza questa mappa la card tornerebbe al posto di prima
    appena rilasciata, per poi saltare a destinazione al `refresh`: due
    movimenti per un gesto solo, e il secondo sembra un errore. Qui il
    risultato è già disegnato, e si annulla soltanto se il server rifiuta.
  */
  const [sovrascritture, setSovrascritture] = useState<Map<string, SpostamentoTurno>>(new Map());
  const [turniVisti, setTurniVisti] = useState(turni);
  if (turniVisti !== turni) {
    setTurniVisti(turni);
    if (sovrascritture.size > 0) setSovrascritture(new Map());
  }

  /** Il mese del mini-calendario segue il giorno scelto, ma può anche
   * scorrere da solo — si sfoglia avanti per vedere dove cadono le ferie
   * senza cambiare quello che il calendario grande sta mostrando. */
  const [meseMostrato, setMeseMostrato] = useState(() => primoDelMese(giornoSelezionato));
  const [giornoVisto, setGiornoVisto] = useState(giornoSelezionato);
  if (giornoVisto !== giornoSelezionato) {
    setGiornoVisto(giornoSelezionato);
    setMeseMostrato(primoDelMese(giornoSelezionato));
  }

  const perId = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff]);

  const conPersona = useMemo<TurnoConPersona[]>(
    () =>
      turni.flatMap((t) => {
        const persona = perId.get(t.waiterId);
        if (!persona) return [];
        const scritta = sovrascritture.get(t.id);
        return [
          {
            ...t,
            dateKey: scritta?.date ?? t.dateKey,
            startMinute: scritta?.startMinute ?? t.startMinute,
            endMinute: scritta?.endMinute ?? t.endMinute,
            persona,
          },
        ];
      }),
    [turni, perId, sovrascritture],
  );

  const visibili = useMemo(() => new Set(giorniMostrati), [giorniMostrati]);

  const filtrati = useMemo(
    () =>
      conPersona.filter((t) => {
        if (!visibili.has(t.dateKey)) return false;
        if (filtri.ruolo !== "tutti" && t.persona.primaryRole !== filtri.ruolo) return false;
        if (filtri.reparto !== "tutti" && (t.department ?? staffDepartmentOf(t.persona)) !== filtri.reparto) {
          return false;
        }
        if (filtri.stato === "in-turno" && t.kind !== "WORK") return false;
        if (filtri.stato === "riposo" && t.kind !== "REST" && t.kind !== "UNAVAILABLE") return false;
        if (
          filtri.stato === "assenza" &&
          t.kind !== "VACATION" &&
          t.kind !== "LEAVE" &&
          t.kind !== "SICK_LEAVE"
        ) {
          return false;
        }
        return true;
      }),
    [conPersona, visibili, filtri],
  );

  const turniOrario = useMemo(
    () =>
      filtrati.filter(
        (t): t is TurnoOrario => t.kind === "WORK" && t.startMinute != null && t.endMinute != null,
      ),
    [filtrati],
  );
  const turniGiornata = useMemo(() => filtrati.filter((t) => t.kind !== "WORK"), [filtrati]);

  const fascia = useMemo(() => fasciaVisibile(turniOrario), [turniOrario]);

  /** I tre numeri della testata e del riepilogo, sempre riferiti al giorno
   * scelto — vedi la nota nella barra laterale. */
  const riepilogo = useMemo(() => {
    const delGiorno = conPersona.filter((t) => t.dateKey === giornoSelezionato);
    return {
      totale: staff.length,
      inTurno: delGiorno.filter((t) => t.kind === "WORK").length,
      assenti: delGiorno.filter((t) => t.kind === "VACATION" || t.kind === "LEAVE" || t.kind === "SICK_LEAVE").length,
      liberi: delGiorno.filter((t) => t.kind === "REST" || t.kind === "UNAVAILABLE").length,
      giorno: giornoSelezionato,
      eOggi: giornoSelezionato === oggi,
    };
  }, [conPersona, giornoSelezionato, staff.length, oggi]);

  const ruoliDisponibili = useMemo(() => {
    const presenti = new Set(staff.map((p) => p.primaryRole).filter(Boolean));
    return STAFF_PRIMARY_ROLES.filter((r) => presenti.has(r.value)).map((r) => ({
      value: r.value,
      label: r.label,
    }));
  }, [staff]);

  const repartiDisponibili = useMemo(() => [...new Set(staff.map((p) => staffDepartmentOf(p)))], [staff]);

  const oraCorrente = useOraDelLocale();

  /* ---------------- navigazione ---------------- */

  const vaiA = useCallback(
    (giorno: string, prossimaVista: Vista = vista) => {
      router.push(`/staff/turni?vista=${prossimaVista}&g=${giorno}`, { scroll: false });
    },
    [router, vista],
  );

  function passo(direzione: 1 | -1) {
    if (vistaEffettiva === "mese") {
      vaiA(spostaMese(giornoSelezionato, direzione));
      return;
    }
    vaiA(shiftDateKey(giornoSelezionato, direzione * (vistaEffettiva === "settimana" ? 7 : 1)));
  }

  const etichettaPeriodo =
    vistaEffettiva === "mese"
      ? etichettaMese(giornoSelezionato)
      : vistaEffettiva === "giorno"
        ? etichettaGiornoLunga(giornoSelezionato)
        : `${etichettaSettimana(giorni[0] ?? giornoSelezionato)} ${giornoSelezionato.slice(0, 4)}`;

  /* ---------------- scrittura ---------------- */

  async function applicaSpostamento(turno: TurnoOrario, destinazione: SpostamentoTurno) {
    setSovrascritture((prec) => new Map(prec).set(turno.id, destinazione));

    const res = await fetch(`/api/work-shifts/${turno.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        waiterId: turno.waiterId,
        date: destinazione.date,
        kind: turno.kind,
        startMinute: destinazione.startMinute,
        endMinute: destinazione.endMinute,
        breakMinutes: turno.breakMinutes,
        department: turno.department,
        service: turno.service,
        notes: turno.notes,
      }),
    });

    if (!res.ok) {
      setSovrascritture((prec) => {
        const m = new Map(prec);
        m.delete(turno.id);
        return m;
      });
      avvisi.problema(await readApiError(res, "Non è stato possibile spostare il turno."));
      return;
    }

    avvisi.mostra(
      `${nomeCompleto(turno.persona)} · ${minutiAOrario(destinazione.startMinute)} – ${minutiAOrario(
        destinazione.endMinute,
      )}`,
    );
    router.refresh();
  }

  const conFiltriAttivi = haFiltri(filtri);

  const bottoneNuovo = canManageShifts && staff.length > 0 && (
    <BottoneNuovo
      onNuovo={(kind) => setDialogo({ turno: null, personaId: null, dateKey: giornoSelezionato, kind })}
    />
  );

  const pannelloFiltri = (
    <BarraLaterale
      compatta
      vista="turni"
      mese={meseMostrato}
      giornoSelezionato={giornoSelezionato}
      oggi={oggi}
      giorniVisibili={settimanaEvidenziata}
      onSeleziona={(g) => vaiA(g)}
      onCambiaMese={(d) => setMeseMostrato(spostaMese(meseMostrato, d))}
      filtri={filtri}
      onFiltri={setFiltri}
      ruoliDisponibili={ruoliDisponibili}
      repartiDisponibili={repartiDisponibili}
      riepilogo={riepilogo}
    />
  );

  const nessunTurno = filtrati.length === 0;

  return (
    <div className="schermo animate-fade-in gap-3">
      {staff.length === 0 ? (
        <div className="riquadro tratteggiato fill grid place-content-center p-12 text-center text-sm text-muted-foreground">
          <p>Nessuna persona in organico.</p>
          <p className="mt-1 text-xs">
            I turni si costruiscono sulle persone: aggiungile da{" "}
            <Link href="/staff" className="underline underline-offset-2">
              Persone
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="fill flex min-h-0 gap-4">
          <aside className="hidden min-h-0 shrink-0 overflow-y-auto pr-0.5 xl:block">
            <BarraLaterale
              vista="turni"
              mese={meseMostrato}
              giornoSelezionato={giornoSelezionato}
              oggi={oggi}
              giorniVisibili={settimanaEvidenziata}
              onSeleziona={(g) => vaiA(g)}
              onCambiaMese={(d) => setMeseMostrato(spostaMese(meseMostrato, d))}
              filtri={filtri}
              onFiltri={setFiltri}
              ruoliDisponibili={ruoliDisponibili}
              repartiDisponibili={repartiDisponibili}
              riepilogo={riepilogo}
            />
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
            <TestataCalendario
              etichetta={etichettaPeriodo}
              vista={vistaEffettiva}
              onVista={(v) => vaiA(giornoSelezionato, v)}
              onPrecedente={() => passo(-1)}
              onSuccessivo={() => passo(1)}
              onOggi={() => vaiA(oggi)}
              inTurno={riepilogo.inTurno}
              assenti={riepilogo.assenti}
              liberi={riepilogo.liberi}
              eOggi={riepilogo.eOggi}
              pannelloFiltri={pannelloFiltri}
              conFiltriAttivi={conFiltriAttivi}
              interruttore={<StaffSwitch vista="turni" giorno={giornoSelezionato} className="shrink-0 xl:hidden" />}
              azione={bottoneNuovo}
            />

            {nessunTurno && (
              <p className="fissa riquadro tratteggiato px-3 py-2 text-xs text-muted-foreground">
                {conFiltriAttivi
                  ? "Nessun turno corrisponde ai filtri."
                  : canManageShifts
                    ? "Niente in programma. Tocca una fascia oraria per assegnare il primo turno."
                    : "Niente in programma in questo periodo."}
              </p>
            )}

            {/* La chiave delle sigle sta qui e non fra i filtri: vedi `LegendaReparti`. */}
            {vistaEffettiva === "mese" && (
              <LegendaReparti repartiDisponibili={repartiDisponibili} className="fissa hidden md:flex" />
            )}

            {vistaEffettiva === "mese" ? (
              <VistaMese
                giorni={giorniMostrati}
                mese={giornoSelezionato}
                oggi={oggi}
                giornoSelezionato={giornoSelezionato}
                turni={filtrati}
                canManage={canManageShifts}
                onApri={(t) => setDialogo({ turno: t, personaId: t.waiterId, dateKey: t.dateKey, kind: t.kind })}
                onApriGiorno={(g) => vaiA(g, "giorno")}
              />
            ) : (
              <GrigliaTurni
                giorni={giorniMostrati}
                oggi={oggi}
                giornoSelezionato={giornoSelezionato}
                turniOrario={turniOrario}
                turniGiornata={turniGiornata}
                fascia={fascia}
                canManage={canManageShifts}
                oraCorrente={oraCorrente}
                onApri={(t) => setDialogo({ turno: t, personaId: t.waiterId, dateKey: t.dateKey, kind: t.kind })}
                onNuovo={(dateKey, minuto) =>
                  setDialogo({ turno: null, personaId: null, dateKey, kind: "WORK", inizioMinuti: minuto })
                }
                onSelezionaGiorno={(g) => vaiA(g)}
                onSposta={applicaSpostamento}
              />
            )}
          </section>
        </div>
      )}

      {dialogo && (
        <ShiftDialog
          open
          onOpenChange={(prossimo) => !prossimo && setDialogo(null)}
          staff={staff}
          personaId={dialogo.personaId}
          dateKey={dialogo.dateKey}
          turno={dialogo.turno}
          kindIniziale={dialogo.kind}
          inizioMinuti={dialogo.inizioMinuti}
          serviceOptions={serviceOptions}
        />
      )}
    </div>
  );
}

/**
 * «Nuovo turno», con le tre eccezioni di fianco.
 *
 * Pulsante spaccato in due e non menù unico: nove volte su dieci si aggiunge
 * un turno di lavoro, e quel caso deve costare un clic. Ferie, permesso e
 * riposo stanno dietro la freccia perché si mettono di rado ma si mettono
 * dallo stesso posto — cercarli in una pagina diversa sarebbe la ragione per
 * cui poi non li mette nessuno, e un calendario con i buchi non segnati non
 * serve a niente.
 */
function BottoneNuovo({ onNuovo }: { onNuovo: (kind: WorkShiftKind) => void }) {
  /*
    Niente altezza fissa sui due bottoni.

    Con `h-9` dentro un contenitore che il `flex` della riga allunga
    all'altezza dei riquadri accanto, il verde riempiva trentasei pixel su
    cinquanta e il resto restava fondo scuro dentro un bordo arrotondato: il
    pulsante sembrava tagliato di netto in basso. Senza altezza si allungano
    da soli — `items-stretch` è già il valore di default — e il padding
    verticale gli dà la misura giusta quando la riga non li allunga.
  */
  const base =
    "inline-flex min-h-[2.25rem] items-center justify-center gap-1.5 bg-[color:var(--nuovo-turno)] py-2 text-sm font-medium text-cream transition-colors hover:bg-[color:var(--nuovo-turno-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="flex items-stretch overflow-hidden rounded-full">
      <button type="button" onClick={() => onNuovo("WORK")} className={cn(base, "pl-3.5 pr-3")}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Nuovo turno
      </button>
      <span aria-hidden="true" className="w-px bg-veil-20" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Altri tipi di assegnazione" className={cn(base, "px-2")}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onNuovo("WORK")}>Turno di lavoro</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onNuovo("VACATION")}>Ferie</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onNuovo("LEAVE")}>Permesso</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onNuovo("REST")}>Riposo</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * L'ora del **locale**, in minuti da mezzanotte, aggiornata ogni minuto.
 *
 * Serve alla riga rossa di «adesso», che è utile solo se è vera: calcolata
 * con l'ora del browser, un gestore che apre il gestionale da un fuso
 * diverso vedrebbe la linea a metà pomeriggio durante il servizio serale.
 * Parte da `null` e si accende dopo il montaggio, perché il server non ha
 * un «adesso» che il client possa reidratare senza discordanza.
 */
function useOraDelLocale(): number | null {
  const timezone = useVenueTimezone();
  const [minuti, setMinuti] = useState<number | null>(null);

  useEffect(() => {
    const formato = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const leggi = () => {
      const parti = formato.formatToParts(new Date());
      const ore = Number(parti.find((p) => p.type === "hour")?.value ?? "0") % 24;
      const min = Number(parti.find((p) => p.type === "minute")?.value ?? "0");
      setMinuti(ore * 60 + min);
    };
    leggi();
    const timer = setInterval(leggi, 60_000);
    return () => clearInterval(timer);
  }, [timezone]);

  return minuti;
}
