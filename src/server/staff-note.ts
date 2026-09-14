import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Le note interne su una persona.
 *
 * Le legge e le scrive solo chi ha `manage_staff`, e la route lo impone: la
 * persona di cui parlano non le vede, né dalla sua scheda né da altrove. È
 * la promessa che rende utile scriverle — «ottimo negli eventi numerosi»,
 * «da affiancare ancora sulla cassa» — e va tenuta anche nel codice, non
 * solo nell'interfaccia.
 *
 * Una nota non si modifica: si cancella e se ne scrive un'altra. Una riga
 * firmata e datata che cambia sotto la firma non è più una nota.
 */

export const StaffNoteInput = z.object({
  body: z.string().trim().min(1, "required").max(2000),
});

export async function listNote(venueId: string, waiterId: string) {
  return db.staffNote.findMany({
    where: { venueId, waiterId },
    orderBy: { createdAt: "desc" },
  });
}

export async function creaNota(
  venueId: string,
  waiterId: string,
  raw: unknown,
  autore: { userId: string; label: string },
  actor?: AuditActor,
) {
  const persona = await db.waiter.findFirst({ where: { id: waiterId, venueId }, select: { id: true } });
  if (!persona) throw new Error("not_found");
  const data = StaffNoteInput.parse(raw);
  const nota = await db.staffNote.create({
    data: { venueId, waiterId, body: data.body, authorUserId: autore.userId, authorLabel: autore.label },
  });
  // Nel registro non va il testo: è una nota riservata, e il registro lo
  // legge anche chi domani avrà accesso al registro e non alle note.
  await recordAudit(actor, "waiter.note_create", "waiter", waiterId, { nota: nota.id });
  return nota;
}

export async function cancellaNota(venueId: string, waiterId: string, noteId: string, actor?: AuditActor) {
  const nota = await db.staffNote.findFirst({ where: { id: noteId, venueId, waiterId } });
  if (!nota) throw new Error("not_found");
  await db.staffNote.delete({ where: { id: noteId } });
  await recordAudit(actor, "waiter.note_delete", "waiter", waiterId, { nota: noteId });
}
