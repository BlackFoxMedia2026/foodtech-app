import type { StaffTrainingKind } from "@prisma/client";
import {
  CONTRACT_EXPIRING_SOON_THRESHOLD_DAYS,
  getContractStatus,
  pickCurrentContract,
  staffContractTypeLabel,
} from "@/lib/staff-contracts";
import {
  TIPI_CORSO,
  TIPO_CORSO_BREVE,
  dataLunga,
  descriviScadenza,
  giorniAllaScadenza,
  nomeCorso,
  ordinaScadenze,
  statoScadenza,
  type Scadenza,
} from "@/lib/scheda-dipendente";

/**
 * Le scadenze di una persona, da qualunque cosa abbia una data di fine:
 * contratto, visita medica, corsi, documenti.
 *
 * Pura: riceve righe e restituisce `Scadenza[]`. La usano la Panoramica
 * della scheda e la card nell'elenco Staff, e se dicono due cose diverse
 * sulla stessa visita medica è un errore — per questo il calcolo è uno.
 */

export type DatiScadenze = {
  contratti: { startDate: Date; endDate: Date | null; contractType: import("@prisma/client").StaffContractType }[];
  visite: { examinedAt: Date; expiresAt: Date | null }[];
  corsi: { kind: StaffTrainingKind; name: string | null; completedAt: Date | null; expiresAt: Date | null }[];
  documenti: { id: string; name: string; expiresAt: Date | null; trainingId?: string | null; medicalCheckId?: string | null }[];
};

function giorni(d: Date | null, oggi: Date) {
  return d ? giorniAllaScadenza(d, oggi) : null;
}

export function costruisciScadenze(dati: DatiScadenze, oggi: Date = new Date()): Scadenza[] {
  const out: Scadenza[] = [];

  // Visita medica: l'ultima, e se non c'è è una mancanza da segnalare.
  const visita = [...dati.visite].sort((a, b) => b.examinedAt.getTime() - a.examinedAt.getTime())[0];
  if (!visita) {
    out.push({ chiave: "visita", titolo: "Visita medica", tab: "formazione", scadeIl: null, stato: "assente", dettaglio: "Nessuna visita registrata", giorni: null });
  } else if (visita.expiresAt) {
    const stato = statoScadenza(visita.expiresAt, oggi);
    out.push({
      chiave: "visita",
      titolo: "Visita medica",
      tab: "formazione",
      scadeIl: visita.expiresAt,
      stato,
      dettaglio: `Scade il ${dataLunga(visita.expiresAt)}`,
      giorni: giorni(visita.expiresAt, oggi),
    });
  } else {
    out.push({ chiave: "visita", titolo: "Visita medica", tab: "formazione", scadeIl: null, stato: "valido", dettaglio: `Ultima il ${dataLunga(visita.examinedAt)} · senza scadenza`, giorni: null });
  }

  // Corsi: per ogni tipo, l'edizione più recente. I tipi obbligatori che
  // mancano si scrivono come mancanti.
  const perTipo = new Map<string, DatiScadenze["corsi"][number]>();
  for (const c of dati.corsi) {
    const chiave = c.kind === "ALTRO" ? `ALTRO:${c.name ?? ""}` : c.kind;
    const gia = perTipo.get(chiave);
    if (!gia || (c.completedAt?.getTime() ?? 0) > (gia.completedAt?.getTime() ?? 0)) perTipo.set(chiave, c);
  }
  for (const tipo of TIPI_CORSO) {
    if (tipo.value === "ALTRO") continue;
    const c = perTipo.get(tipo.value);
    if (!c) {
      if (tipo.obbligatorio) {
        out.push({ chiave: `corso:${tipo.value}`, titolo: TIPO_CORSO_BREVE[tipo.value], tab: "formazione", scadeIl: null, stato: "assente", dettaglio: "Non presente", giorni: null });
      }
      continue;
    }
    out.push(scadenzaCorso(`corso:${tipo.value}`, TIPO_CORSO_BREVE[tipo.value], c, oggi));
  }
  for (const [chiave, c] of perTipo) {
    if (!chiave.startsWith("ALTRO:")) continue;
    out.push(scadenzaCorso(`corso:${chiave}`, nomeCorso(c), c, oggi));
  }

  // Contratto: quello attuale.
  const attuale = pickCurrentContract(dati.contratti);
  if (attuale) {
    const statoContratto = getContractStatus(attuale, oggi);
    const stato =
      statoContratto === "EXPIRED" ? "scaduto" : statoContratto === "EXPIRING_SOON" ? "in_scadenza" : "valido";
    out.push({
      chiave: "contratto",
      titolo: "Contratto",
      tab: "lavoro",
      scadeIl: attuale.endDate,
      stato,
      dettaglio: attuale.endDate ? `${staffContractTypeLabel(attuale.contractType)} · scade il ${dataLunga(attuale.endDate)}` : staffContractTypeLabel(attuale.contractType),
      giorni: giorni(attuale.endDate, oggi),
    });
  } else {
    out.push({ chiave: "contratto", titolo: "Contratto", tab: "lavoro", scadeIl: null, stato: "assente", dettaglio: "Nessun contratto registrato", giorni: null });
  }

  // Documenti con una scadenza propria. Gli attestati e i certificati
  // collegati a un corso o a una visita hanno già la loro riga sopra.
  for (const d of dati.documenti) {
    if (!d.expiresAt || d.trainingId || d.medicalCheckId) continue;
    out.push({
      chiave: `doc:${d.id}`,
      titolo: d.name,
      tab: "documenti",
      scadeIl: d.expiresAt,
      stato: statoScadenza(d.expiresAt, oggi),
      dettaglio: `Scade il ${dataLunga(d.expiresAt)}`,
      giorni: giorni(d.expiresAt, oggi),
    });
  }

  return ordinaScadenze(out);
}

function scadenzaCorso(chiave: string, titolo: string, c: DatiScadenze["corsi"][number], oggi: Date): Scadenza {
  if (!c.expiresAt) {
    return { chiave, titolo, tab: "formazione", scadeIl: null, stato: "valido", dettaglio: c.completedAt ? `Svolto il ${dataLunga(c.completedAt)} · senza scadenza` : "Registrato, senza date", giorni: null };
  }
  return {
    chiave,
    titolo,
    tab: "formazione",
    scadeIl: c.expiresAt,
    stato: statoScadenza(c.expiresAt, oggi),
    dettaglio: `Scade il ${dataLunga(c.expiresAt)}`,
    giorni: giorniAllaScadenza(c.expiresAt, oggi),
  };
}

/** «Tra 65 giorni» a destra della scadenza, o niente se non ha una data. */
export function contoAllaRovescia(s: Scadenza, oggi: Date = new Date()): string | null {
  if (!s.scadeIl) return null;
  return descriviScadenza(s.scadeIl, oggi);
}

export { CONTRACT_EXPIRING_SOON_THRESHOLD_DAYS };
