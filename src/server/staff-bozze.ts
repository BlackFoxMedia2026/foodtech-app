import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-auth";

/**
 * Le registrazioni di «Nuova persona» lasciate a metà con «Salva».
 *
 * Stanno sul server, non nel browser: dentro ci sono codice fiscale e IBAN,
 * che non devono restare nel computer della cassa, e chi ha cominciato dal
 * telefono deve poter finire dal computer. Sono del locale — le vede chi può
 * gestire lo staff — e si cancellano quando la persona viene registrata.
 *
 * I dati sono quelli del modulo, così come sono: niente controlli di merito
 * (una bozza è incompleta per definizione), solo forma e misura.
 */

const testo = z.string().max(2000);

export const DatiBozzaSchema = z.object({
  valori: z.record(z.string().max(40), testo),
  codiceComune: z.string().max(8).nullable().optional(),
  primaryRole: z.string().max(40).nullable().optional(),
  capabilities: z.array(z.string().max(40)).max(30).optional(),
  // Il modulo del contratto: testi, sì/no, null e i giorni lavorativi.
  contratto: z
    .record(z.string().max(40), z.union([testo, z.boolean(), z.null(), z.array(z.union([z.string().max(20), z.number()])).max(14)]))
    .optional(),
});
export type DatiBozza = z.infer<typeof DatiBozzaSchema>;

export const SalvaBozzaInput = z.object({
  passo: z.string().min(1).max(30),
  dati: DatiBozzaSchema,
});

export type BozzaStaff = {
  id: string;
  nome: string;
  passo: string;
  dati: DatiBozza;
  aggiornata: string;
};

/** Il massimo di bozze aperte per locale: oltre, si chiede di finirne una. */
const MASSIMO = 20;

function nomeDa(dati: DatiBozza) {
  return [dati.valori.firstName, dati.valori.lastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ").slice(0, 120);
}

function aBozza(r: { id: string; nome: string; passo: string; dati: unknown; updatedAt: Date }): BozzaStaff {
  const dati = DatiBozzaSchema.safeParse(r.dati);
  return {
    id: r.id,
    nome: r.nome,
    passo: r.passo,
    dati: dati.success ? dati.data : { valori: {} },
    aggiornata: r.updatedAt.toISOString(),
  };
}

export async function listBozze(venueId: string): Promise<BozzaStaff[]> {
  const righe = await db.staffBozza.findMany({ where: { venueId }, orderBy: { updatedAt: "desc" }, take: MASSIMO });
  return righe.map(aBozza);
}

export async function getBozza(venueId: string, id: string): Promise<BozzaStaff | null> {
  const r = await db.staffBozza.findFirst({ where: { id, venueId } });
  return r ? aBozza(r) : null;
}

export async function creaBozza(venueId: string, input: unknown, creataDa: string | null): Promise<BozzaStaff> {
  const { passo, dati } = SalvaBozzaInput.parse(input);
  const aperte = await db.staffBozza.count({ where: { venueId } });
  if (aperte >= MASSIMO) {
    throw new ApiError(422, "too_many_drafts", "Ci sono già troppe registrazioni in sospeso: completane o eliminane qualcuna.");
  }
  const r = await db.staffBozza.create({
    data: { venueId, passo, dati, nome: nomeDa(dati), creataDa },
  });
  return aBozza(r);
}

export async function aggiornaBozza(venueId: string, id: string, input: unknown): Promise<BozzaStaff> {
  const { passo, dati } = SalvaBozzaInput.parse(input);
  const { count } = await db.staffBozza.updateMany({ where: { id, venueId }, data: { passo, dati, nome: nomeDa(dati) } });
  if (!count) throw new ApiError(404, "not_found", "Registrazione non trovata: forse è già stata completata o eliminata.");
  return (await getBozza(venueId, id))!;
}

export async function eliminaBozza(venueId: string, id: string): Promise<void> {
  await db.staffBozza.deleteMany({ where: { id, venueId } });
}
