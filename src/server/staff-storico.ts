import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { staffStatusLabel } from "@/lib/staff-status";
import { staffContractTypeLabel } from "@/lib/staff-contracts";
import { dataBreve } from "@/lib/scheda-dipendente";

/**
 * Lo storico di una persona: il registro (`AuditLog`) letto per una sola
 * entità e tradotto in italiano.
 *
 * Non c'è una tabella «storico»: il registro esiste da prima, si scrive già
 * a ogni modifica della scheda, ed è l'unica fonte che non si può
 * dimenticare di aggiornare. Qui si legge e si mette in forma di timeline.
 */

export type VoceStorico = {
  id: string;
  quando: Date;
  titolo: string;
  dettaglio: string | null;
  autore: string | null;
};

type Diff = Record<string, unknown> | null | undefined;

/** I campi della persona come li legge il responsabile. */
const CAMPI: Record<string, string> = {
  firstName: "Nome",
  lastName: "Cognome",
  birthday: "Data di nascita",
  phone: "Telefono",
  email: "Email",
  role: "Ruolo",
  primaryRole: "Ruolo",
  department: "Reparto",
  capabilities: "Competenze operative",
  status: "Stato",
  hireDate: "Data di assunzione",
  photoUrl: "Foto",
  fiscalCode: "Codice fiscale",
  birthPlace: "Luogo di nascita",
  nationality: "Nazionalità",
  address: "Indirizzo",
  postalCode: "CAP",
  city: "Comune",
  province: "Provincia",
  emergencyContactName: "Contatto di emergenza",
  emergencyContactPhone: "Numero di emergenza",
  skills: "Caratteristiche",
  managerId: "Responsabile diretto",
  userId: "Account collegato",
};

/** Un valore del diff, leggibile: enum tradotti, date corte, nulli detti. */
function valore(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (campo === "primaryRole") return staffPrimaryRoleLabel(v as never);
  if (campo === "status") return staffStatusLabel(v as never);
  if (campo === "contractType") return staffContractTypeLabel(v as never);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dataBreve(v);
  return String(v);
}

function eCambio(x: unknown): x is { da: unknown; a: unknown } {
  return typeof x === "object" && x !== null && "da" in x && "a" in x;
}

/** «Ruolo · Cameriere → Maître», una riga per campo, senza la foto e senza
 * `role` quando c'è già `primaryRole` (sono lo stesso cambiamento). */
function descriviCambi(diff: Diff): string[] {
  if (!diff) return [];
  const righe: string[] = [];
  const chiavi = Object.keys(diff).filter((k) => !(k === "role" && "primaryRole" in diff) && k !== "updatedAt");
  for (const k of chiavi) {
    const cambio = diff[k];
    if (!eCambio(cambio)) continue;
    if (k === "photoUrl") {
      righe.push(cambio.a ? "Foto aggiornata" : "Foto rimossa");
      continue;
    }
    righe.push(`${CAMPI[k] ?? k} · ${valore(k, cambio.da)} → ${valore(k, cambio.a)}`);
  }
  return righe;
}

function traduci(action: string, diff: Diff): { titolo: string; dettaglio: string | null } {
  const d = (diff ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);

  switch (action) {
    case "waiter.create":
      return { titolo: "Dipendente inserito nello staff", dettaglio: s("ruolo") };
    case "waiter.update": {
      const cambi = descriviCambi(diff);
      if (cambi.length === 1 && cambi[0].startsWith("Ruolo ·")) return { titolo: "Ruolo modificato", dettaglio: cambi[0].slice("Ruolo · ".length) };
      if (cambi.length === 1 && cambi[0].startsWith("Stato ·")) return { titolo: "Stato cambiato", dettaglio: cambi[0].slice("Stato · ".length) };
      if (cambi.length === 1 && cambi[0].startsWith("Foto")) return { titolo: cambi[0], dettaglio: null };
      return { titolo: "Scheda modificata", dettaglio: cambi.join("\n") || null };
    }
    case "waiter.document_upload":
      return { titolo: "Caricato un documento", dettaglio: s("documento") };
    case "waiter.document_replace":
      return { titolo: "Documento sostituito", dettaglio: s("documento") };
    case "waiter.document_delete":
      return { titolo: "Documento eliminato", dettaglio: s("documento") };
    case "waiter.training_create":
      return { titolo: "Corso registrato", dettaglio: s("corso") };
    case "waiter.training_update":
      return { titolo: "Corso aggiornato", dettaglio: s("corso") };
    case "waiter.training_delete":
      return { titolo: "Corso rimosso", dettaglio: s("corso") };
    case "waiter.medical_create":
      return { titolo: "Visita medica registrata", dettaglio: s("visita") ? `Visita del ${dataBreve(s("visita"))}` : null };
    case "waiter.medical_update":
      return { titolo: "Visita medica aggiornata", dettaglio: null };
    case "waiter.medical_delete":
      return { titolo: "Visita medica rimossa", dettaglio: null };
    case "waiter.note_create":
      return { titolo: "Aggiunta una nota interna", dettaglio: null };
    case "waiter.note_delete":
      return { titolo: "Nota interna eliminata", dettaglio: null };
    case "waiter.account_invite":
      return { titolo: d.collegato ? "Account collegato" : "Invito all'accesso creato", dettaglio: s("email") };
    case "waiter.account_email":
      return { titolo: "Email di accesso cambiata", dettaglio: s("da") && s("a") ? `${s("da")} → ${s("a")}` : null };
    case "waiter.account_password":
      return { titolo: "Password impostata dal responsabile", dettaglio: null };
    case "waiter.account_reset_link":
      return { titolo: "Generato un link per reimpostare la password", dettaglio: null };
    case "waiter.account_disable":
      return { titolo: "Account disattivato", dettaglio: null };
    case "waiter.account_enable":
      return { titolo: "Account riattivato", dettaglio: null };
    case "waiter.account_permissions": {
      const ruolo = d.ruolo;
      const dett = eCambio(ruolo) ? `Ruolo di accesso · ${ruolo.da} → ${ruolo.a}` : typeof d.permessi === "string" ? "Permessi riportati al preset del ruolo" : "Permessi personalizzati";
      return { titolo: "Permessi aggiornati", dettaglio: dett };
    }
    case "contract.create":
      return { titolo: "Nuovo contratto", dettaglio: s("tipo") ? staffContractTypeLabel(s("tipo") as never) : null };
    case "contract.update":
      return { titolo: "Contratto aggiornato", dettaglio: null };
    case "contract.delete":
      return { titolo: "Contratto eliminato", dettaglio: null };
    default:
      return { titolo: action, dettaglio: null };
  }
}

export async function listStorico(venueId: string, waiterId: string, limite = 60): Promise<VoceStorico[]> {
  const righe = await db.auditLog.findMany({
    where: {
      venueId,
      OR: [
        { entityType: "waiter", entityId: waiterId },
        // I contratti si registrano con l'id del contratto: la persona sta
        // nel diff (`cameriere`), ed è così che si ritrovano.
        { entityType: "staff_contract", diff: { path: ["cameriere"], equals: waiterId } as Prisma.JsonFilter },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limite,
  });

  const voci = righe.map((r) => {
    const { titolo, dettaglio } = traduci(r.action, r.diff as Diff);
    return { id: r.id, quando: r.createdAt, titolo, dettaglio, autore: r.actorEmail };
  });

  // Le anagrafiche nate prima del registro non hanno una riga di creazione:
  // la si scrive dalla data della persona, così ogni storico finisce con
  // «inserito nello staff», che è dove comincia.
  if (!righe.some((r) => r.action === "waiter.create")) {
    const persona = await db.waiter.findFirst({ where: { id: waiterId, venueId }, select: { createdAt: true, role: true } });
    if (persona) voci.push({ id: "inizio", quando: persona.createdAt, titolo: "Dipendente inserito nello staff", dettaglio: persona.role, autore: null });
  }
  return voci;
}
