import { db } from "@/lib/db";
import { staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import {
  getContractStatus,
  pickCurrentContract,
  staffContractTypeLabel,
  CONTRACT_STATUS_LABELS,
  type ContractStatus,
} from "@/lib/staff-contracts";

/**
 * **La propria scheda** — §31.
 *
 * Quello che una persona può leggere di sé: nome, ruolo, contatti, contratto e
 * la sua scadenza. Il §31 lo dice e vale la pena ripeterlo qui, perché è la
 * regola che questo modulo fa rispettare: **non si modifica niente**.
 *
 * Non c'è una funzione di scrittura, e la mancanza non è una fase successiva:
 * la retribuzione, l'inquadramento, le date del contratto sono dati che
 * cambiano in accordo con chi assume, e una schermata che li lascia digitare
 * al dipendente è una schermata che promette un potere che non esiste — al
 * primo salvataggio si scoprirebbe che è finito in un campo che nessuno
 * guarda.
 *
 * Quello che **manca di proposito** rispetto alla scheda del back office: la
 * retribuzione, le note del responsabile, lo storico delle azioni, i
 * documenti caricati da altri sulla persona. Le note in particolare: sono
 * scritte da un responsabile *sulla* persona, e leggerle dalla parte sbagliata
 * cambierebbe cosa ci si scrive dentro.
 */

export type SchedaPersonale = {
  nome: string;
  cognome: string;
  ruolo: string | null;
  reparto: string;
  email: string | null;
  telefono: string;
  /** Da quando fa parte dell'organico, se registrato. */
  dal: string | null;
  contratto: {
    tipo: string;
    dal: string;
    al: string | null;
    stato: ContractStatus;
    statoLabel: string;
  } | null;
  /** Il responsabile diretto, quando è una persona dell'organico. */
  responsabile: string | null;
};

export async function schedaPersonale(
  venueId: string,
  waiterId: string,
  oggi = new Date(),
): Promise<SchedaPersonale | null> {
  const persona = await db.waiter.findFirst({
    where: { id: waiterId, venueId },
    select: {
      firstName: true,
      lastName: true,
      role: true,
      primaryRole: true,
      department: true,
      email: true,
      phone: true,
      hireDate: true,
      manager: { select: { firstName: true, lastName: true } },
    },
  });
  if (!persona) return null;

  const contratti = await db.staffContract.findMany({
    where: { venueId, waiterId },
    select: { startDate: true, endDate: true, contractType: true },
  });
  const corrente = pickCurrentContract(contratti);

  return {
    nome: persona.firstName,
    cognome: persona.lastName,
    /* `primaryRole` quando c'è, altrimenti il campo di testo storico: le
       anagrafiche create prima dell'enum hanno solo quello, e mostrare «—» a
       chi sa benissimo di essere un cameriere sarebbe un errore nostro
       raccontato come un dato mancante suo. */
    ruolo: persona.primaryRole ? staffPrimaryRoleLabel(persona.primaryRole) : persona.role || null,
    reparto: staffDepartmentOf(persona),
    email: persona.email,
    telefono: persona.phone,
    dal: persona.hireDate?.toISOString() ?? null,
    contratto: corrente
      ? {
          tipo: staffContractTypeLabel(corrente.contractType),
          dal: corrente.startDate.toISOString(),
          al: corrente.endDate?.toISOString() ?? null,
          stato: getContractStatus(corrente, oggi),
          statoLabel: CONTRACT_STATUS_LABELS[getContractStatus(corrente, oggi)],
        }
      : null,
    responsabile: persona.manager
      ? `${persona.manager.firstName} ${persona.manager.lastName}`.trim()
      : null,
  };
}
