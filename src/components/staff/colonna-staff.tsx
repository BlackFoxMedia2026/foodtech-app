"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffDepartment, StaffPrimaryRole, WorkShiftKind } from "@prisma/client";
import { useFiltriStaff, type FiltriStaff } from "@/components/staff/filtri-staff";
import { staffDepartmentOf, STAFF_PRIMARY_ROLES } from "@/lib/staff-roles";
import { primoDelMese, spostaMese } from "@/lib/turni";

type PersonaColonna = { id: string; primaryRole: StaffPrimaryRole | null; department: StaffDepartment | null };

/**
 * Tutto quello che serve alla colonna di sinistra di Persone e Richieste.
 *
 * Le due pagine mostrano **la stessa colonna** — mese, filtri, riepilogo del
 * giorno — e cambiano solo cosa c'è a destra. Prima la logica viveva dentro
 * l'elenco delle persone; tenerla in due copie voleva dire che un giorno il
 * riepilogo di una pagina avrebbe contato in un modo e quello dell'altra in un
 * altro.
 *
 * `percorso` è l'indirizzo su cui resta il mini-calendario quando si sceglie
 * un giorno: da Richieste si cambia giorno restando su Richieste.
 */
export function useColonnaStaff({
  staff,
  giorno,
  oggi,
  turniDelGiorno,
  percorso,
}: {
  staff: PersonaColonna[];
  giorno: string;
  oggi: string;
  turniDelGiorno: { waiterId: string; kind: WorkShiftKind }[];
  percorso: string;
}) {
  const router = useRouter();
  const [filtri, setFiltri] = useFiltriStaff();
  const [meseMostrato, setMeseMostrato] = useState(() => primoDelMese(giorno));

  /** Il turno di ciascuno nel giorno scelto: è quello che dà senso al filtro
   * «stato» anche dove non c'è un calendario da guardare. */
  const turnoPerPersona = useMemo(
    () => new Map(turniDelGiorno.map((t) => [t.waiterId, t.kind])),
    [turniDelGiorno],
  );

  const ruoliDisponibili = useMemo(() => {
    const presenti = new Set(staff.map((p) => p.primaryRole).filter(Boolean));
    return STAFF_PRIMARY_ROLES.filter((r) => presenti.has(r.value)).map((r) => ({ value: r.value, label: r.label }));
  }, [staff]);

  const repartiDisponibili = useMemo(() => [...new Set(staff.map((p) => staffDepartmentOf(p)))], [staff]);

  const riepilogo = useMemo(
    () => ({
      totale: staff.length,
      inTurno: turniDelGiorno.filter((t) => t.kind === "WORK").length,
      assenti: turniDelGiorno.filter((t) => t.kind === "VACATION" || t.kind === "LEAVE" || t.kind === "SICK_LEAVE")
        .length,
      liberi: turniDelGiorno.filter((t) => t.kind === "REST" || t.kind === "UNAVAILABLE").length,
      giorno,
      eOggi: giorno === oggi,
    }),
    [staff.length, turniDelGiorno, giorno, oggi],
  );

  /** Se una persona passa i tre filtri della colonna. */
  const passaFiltri = useCallback(
    (p: PersonaColonna) => personaPassa(p, filtri, turnoPerPersona.get(p.id)),
    [filtri, turnoPerPersona],
  );

  const barraProps = {
    mese: meseMostrato,
    giornoSelezionato: giorno,
    oggi,
    giorniVisibili: [giorno],
    onSeleziona: (g: string) => router.push(`${percorso}?g=${g}`, { scroll: false }),
    onCambiaMese: (d: number) => setMeseMostrato(spostaMese(meseMostrato, d)),
    filtri,
    onFiltri: setFiltri,
    ruoliDisponibili,
    repartiDisponibili,
    riepilogo,
  };

  return { filtri, barraProps, passaFiltri };
}

function personaPassa(p: PersonaColonna, filtri: FiltriStaff, kind: WorkShiftKind | undefined) {
  if (filtri.reparto !== "tutti" && staffDepartmentOf(p) !== filtri.reparto) return false;
  if (filtri.ruolo !== "tutti" && p.primaryRole !== filtri.ruolo) return false;
  if (filtri.stato === "in-turno" && kind !== "WORK") return false;
  if (filtri.stato === "riposo" && kind !== "REST" && kind !== "UNAVAILABLE") return false;
  if (filtri.stato === "assenza" && kind !== "VACATION" && kind !== "LEAVE" && kind !== "SICK_LEAVE") return false;
  return true;
}
