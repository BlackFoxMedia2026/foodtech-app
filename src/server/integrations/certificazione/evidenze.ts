import { db } from "@/lib/db";
import { adattatoreDi } from "../adapters";
import { eAdattatorePos } from "../adapters/tipi";
import {
  capacitaCertificabile,
  capacitaDelFornitore,
  matrice,
  prontoPerInviaComanda,
  statoCertificazione,
  type CapacitaCertificabile,
  type Esito,
  type Livello,
  type RigaMatrice,
  type StatoCertificazione,
} from "./livelli";

/**
 * **Le evidenze di certificazione.** Si scrivono e basta: il database
 * rifiuta modifiche e cancellazioni (trigger della migrazione
 * `20260924090000_certificazione_integrazioni`). Una prova ripetuta è una
 * riga nuova, e la matrice legge la più recente.
 */

export type NuovaEvidenza = {
  slug: string;
  capacita: string;
  livello: Livello;
  esito: Esito;
  venueId: string;
  operatore: string;
  externalLocationId?: string | null;
  ambiente?: string | null;
  correlationId?: string | null;
  externalEntityId?: string | null;
  runId?: string | null;
  confermaManuale?: boolean;
  riferimentoProva?: string | null;
  note?: string | null;
};

export class ErroreCertificazione extends Error {
  constructor(
    readonly codice: string,
    messaggio: string,
    readonly httpStatus = 409,
  ) {
    super(messaggio);
    this.name = "ErroreCertificazione";
  }

  /** Per `apiErrorResponse`, che legge `code` e `httpStatus`. */
  get code(): string {
    return this.codice;
  }
}

export async function registraEvidenza(e: NuovaEvidenza) {
  const c = capacitaCertificabile(e.capacita);
  if (!c) throw new ErroreCertificazione("capacita_sconosciuta", `Capacità sconosciuta: ${e.capacita}`, 400);
  if (!c.livelli.includes(e.livello)) {
    throw new ErroreCertificazione("livello_non_applicabile", `«${c.etichetta}» non si certifica al livello ${e.livello}.`, 400);
  }
  // Oltre l'API, solo una persona che ha guardato il POS può dire «è successo».
  if ((e.livello === "REAL_POS" || e.livello === "REAL_POS_ITALY") && !e.confermaManuale) {
    throw new ErroreCertificazione("serve_conferma_manuale", "Un'evidenza su POS vero richiede la conferma di chi ha guardato il POS.", 400);
  }
  const venue = await db.venue.findUnique({ where: { id: e.venueId }, select: { name: true } });
  return db.integrationCertificationEvidence.create({
    data: {
      integrationSlug: e.slug,
      capability: e.capacita,
      level: e.livello,
      result: e.esito,
      venueId: e.venueId,
      venueName: (venue?.name ?? e.venueId).slice(0, 200),
      externalLocationId: e.externalLocationId?.slice(0, 200) ?? null,
      environment: e.ambiente?.slice(0, 60) ?? null,
      operatorEmail: e.operatore.slice(0, 200),
      correlationId: e.correlationId?.slice(0, 60) ?? null,
      externalEntityId: e.externalEntityId?.slice(0, 200) ?? null,
      runId: e.runId ?? null,
      manualConfirmation: !!e.confermaManuale,
      evidenceRef: e.riferimentoProva?.slice(0, 500) ?? null,
      notes: e.note?.slice(0, 2000) ?? null,
    },
  });
}

/** I metodi che l'adattatore offre: decidono quali capacità esistono per il fornitore. */
export function metodiDi(slug: string): Set<string> {
  const a = adattatoreDi(slug);
  if (!a || !eAdattatorePos(a)) return new Set();
  return new Set(Object.entries(a.pos).filter(([, v]) => typeof v === "function").map(([k]) => k));
}

export function capacitaDi(slug: string): CapacitaCertificabile[] {
  return capacitaDelFornitore(metodiDi(slug));
}

export async function evidenzeDi(slug: string, limite = 200) {
  return db.integrationCertificationEvidence.findMany({
    where: { integrationSlug: slug },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
}

export type StatoProvider = {
  righe: RigaMatrice[];
  stato: StatoCertificazione;
  inviaComanda: { pronto: boolean; mancano: string[] };
};

export async function statoProvider(slug: string): Promise<StatoProvider> {
  const evidenze = await db.integrationCertificationEvidence.findMany({
    where: { integrationSlug: slug },
    select: { capability: true, level: true, result: true, createdAt: true },
  });
  const righe = matrice(capacitaDi(slug), evidenze);
  return { righe, stato: statoCertificazione(righe), inviaComanda: prontoPerInviaComanda(righe) };
}
