import type { Session } from "next-auth";
import { auth } from "./auth";
import { db } from "./db";

/**
 * Chi è la persona dietro la sessione, **senza** chiedere un locale.
 *
 * `lib/tenant.ts` risolve la sessione insieme al locale attivo, ed è lì che è
 * nato il controllo della revoca. Ma tre porte non passano dal locale: il
 * pannello di piattaforma (`lib/super-admin.ts`), le rotte dell'account
 * personale (`requireUtenteApi`) e l'invito accettato da chi ha già un
 * accesso. Fino al 30 ottobre 2026 quelle tre leggevano il token e basta —
 * cioè una sessione chiusa con «esci da tutti» o con una password nuova
 * continuava a entrare proprio nel pannello che vede tutti i clienti.
 *
 * Qui la regola è una sola e la usano tutti: chi la cambia, la cambia ovunque.
 */

/**
 * La regola della revoca. Una sessione nata prima di `revocaDa` non vale più;
 * un token senza data di nascita (emesso prima che esistesse `sessioneDa`),
 * con una revoca in corso, si considera revocato: chiedere di rientrare è il
 * male minore.
 */
export function sessioneRevocata(sessioneDa: number | undefined, revocaDa: Date | null): boolean {
  if (!revocaDa) return false;
  return sessioneDa === undefined || sessioneDa < revocaDa.getTime();
}

export type UtenteDiSessione = { userId: string; email: string; session: Session };

/**
 * L'utente della sessione corrente, se la sessione vale ancora.
 *
 * L'email è quella **della riga**, non quella scritta nel token: il token la
 * congela al momento dell'accesso, e un indirizzo cambiato da allora non deve
 * continuare a valere — tantomeno per decidere chi è amministratore.
 *
 * Niente `cache()` di React: costa una lettura per chiamata, ed è una
 * lettura per chiave primaria. In cambio il modulo si importa anche fuori da
 * Next (le prove), dove `cache` non c'è.
 */
export async function utenteDiSessione(): Promise<UtenteDiSessione | null> {
  const session = (await auth()) as Session | null;
  const userId =
    (session as { uid?: string } | null)?.uid ?? (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return null;

  const utente = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, sessionsRevokedAt: true },
  });
  if (!utente) return null;

  const sessioneDa = (session as { sessioneDa?: number }).sessioneDa;
  if (sessioneRevocata(sessioneDa, utente.sessionsRevokedAt)) return null;

  return { userId: utente.id, email: utente.email, session };
}
