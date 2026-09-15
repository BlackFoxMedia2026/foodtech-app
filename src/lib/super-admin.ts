import { auth } from "./auth";

/**
 * Chi può vedere il pannello di piattaforma.
 *
 * ## Perché un elenco nell'ambiente e non un ruolo nel database
 *
 * I ruoli del prodotto (`StaffRole`) vivono **dentro un locale**: dicono cosa
 * può fare una persona nel suo ristorante. Questo è un potere di un altro
 * ordine — vedere i dati di tutti i clienti, cambiare i loro piani, fermare i
 * loro invii — e non deve poter nascere da una riga scritta nel database.
 *
 * La differenza pratica: se domani qualcuno trovasse il modo di scriversi un
 * ruolo, con un elenco nel database si troverebbe amministratore della
 * piattaforma. Con questo, no: per entrare bisogna essere in una variabile
 * d'ambiente, che si cambia solo avendo accesso all'infrastruttura.
 *
 * Quando l'elenco è vuoto il pannello **non esiste per nessuno**. Una
 * variabile dimenticata deve lasciare la porta chiusa, non aperta.
 */

function elenco(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function eSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const ammessi = elenco();
  if (ammessi.length === 0) return false;
  return ammessi.includes(email.trim().toLowerCase());
}

export type EsitoSuperAdmin = { ok: true; email: string } | { ok: false };

/**
 * La sessione corrente, se appartiene a un amministratore di piattaforma.
 *
 * Non redirige e non solleva: chi chiama decide cosa fare. Le pagine mostrano
 * «non esiste» — non «non hai i permessi» — perché l'esistenza di questo
 * pannello non è un'informazione da dare a chi non ci entra.
 */
export async function superAdminCorrente(): Promise<EsitoSuperAdmin> {
  const session = await auth();
  const email = (session?.user as { email?: string } | undefined)?.email;
  return eSuperAdmin(email) ? { ok: true, email: email! } : { ok: false };
}
