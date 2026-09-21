import { db } from "@/lib/db";
import { costruisciScadenze, contoAllaRovescia } from "@/lib/scadenze-dipendente";
import type { Scadenza } from "@/lib/scheda-dipendente";

/**
 * **I propri documenti** — §31 e §32 del brief.
 *
 * La stessa materia della scheda HR del back office (contratto, visita
 * medica, corsi, attestati), letta **dalla parte di chi la riguarda**. Le due
 * differenze sono quelle che contano:
 *
 * - **si legge, non si scrive.** Un dipendente non modifica il proprio
 *   contratto né carica il proprio certificato medico: quelle sono azioni del
 *   responsabile, e restano in `/staff/[id]`. Qui non c'è una sola funzione
 *   di scrittura, e non è una dimenticanza;
 * - **il `waiterId` non arriva mai dalla richiesta.** Lo mette il server dal
 *   contesto della persona. Non c'è un parametro per chiedere i documenti di
 *   un collega, quindi non c'è un controllo da sbagliare.
 *
 * Il calcolo delle scadenze è `costruisciScadenze`, lo stesso che usa la
 * scheda del back office. Se una visita medica risultasse valida al
 * dipendente e scaduta al responsabile, uno dei due starebbe lavorando su un
 * dato sbagliato — e non si saprebbe quale.
 */

export type ScadenzaStaff = {
  id: string;
  titolo: string;
  dettaglio: string;
  /** «Fra 12 giorni», «Scaduto da 3 giorni». */
  quando: string;
  scaduto: boolean;
  inScadenza: boolean;
};

async function scadenzeGrezze(venueId: string, waiterId: string, oggi = new Date()): Promise<Scadenza[]> {
  /* Quattro letture parallele invece di un `include` sull'anagrafica: le
     stesse quattro di `server/staff-scadenze.ts`, e con lo stesso `venueId`
     nella `where` di ognuna — l'isolamento fra locali non si delega a una
     relazione. */
  const [contratti, visite, corsi, documenti] = await Promise.all([
    db.staffContract.findMany({
      where: { venueId, waiterId },
      select: { startDate: true, endDate: true, contractType: true },
    }),
    db.staffMedicalCheck.findMany({
      where: { venueId, waiterId },
      select: { examinedAt: true, expiresAt: true },
    }),
    db.staffTraining.findMany({
      where: { venueId, waiterId },
      select: { kind: true, name: true, completedAt: true, expiresAt: true },
    }),
    db.staffDocument.findMany({
      where: { venueId, waiterId },
      select: {
        id: true,
        name: true,
        expiresAt: true,
        training: { select: { id: true } },
        medicalCheck: { select: { id: true } },
      },
    }),
  ]);

  return costruisciScadenze(
    {
      contratti,
      visite,
      corsi,
      documenti: documenti.map((d) => ({
        id: d.id,
        name: d.name,
        expiresAt: d.expiresAt,
        trainingId: d.training?.id,
        medicalCheckId: d.medicalCheck?.id,
      })),
    },
    oggi,
  );
}

/**
 * Tutte le scadenze, in ordine di urgenza.
 *
 * Le voci `assente` restano: «nessuna visita registrata» è precisamente
 * l'informazione per cui un dipendente apre questa schermata, e nasconderla
 * perché non ha una data vorrebbe dire mostrare una pagina che sembra a posto.
 */
export async function documentiDi(
  venueId: string,
  waiterId: string,
  oggi = new Date(),
): Promise<ScadenzaStaff[]> {
  const righe = await scadenzeGrezze(venueId, waiterId, oggi);
  return righe.map((s) => ({
    id: s.chiave,
    titolo: s.titolo,
    dettaglio: s.dettaglio,
    quando: contoAllaRovescia(s, oggi) ?? (s.stato === "assente" ? "Manca" : "Senza scadenza"),
    scaduto: s.stato === "scaduto",
    inScadenza: s.stato === "in_scadenza",
  }));
}

/**
 * Solo quelle che chiedono di fare qualcosa, per la Home.
 *
 * Scadute e in scadenza, niente altro: una Home che elenca anche i documenti
 * a posto è una Home in cui quello scaduto è la quinta riga.
 */
export async function scadenzeDi(
  venueId: string,
  waiterId: string,
  oggi = new Date(),
): Promise<ScadenzaStaff[]> {
  const tutte = await documentiDi(venueId, waiterId, oggi);
  return tutte.filter((s) => s.scaduto || s.inScadenza).slice(0, 4);
}
