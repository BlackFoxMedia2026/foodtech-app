import { z } from "zod";
import { db } from "@/lib/db";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import { ORE_VALIDITA_RESET, apriReset } from "@/server/staff-account";

/**
 * «Password dimenticata»: rientrare da soli.
 *
 * Fino a oggi in Tavolo non c'era. Le due strade per reimpostare una password
 * passavano entrambe da **qualcun altro**: un responsabile che genera il link
 * dalla scheda della persona, o una password nuova detta a voce. Funziona per
 * un cameriere, non per chi gestisce il locale: il manager che perde la
 * propria password non ha nessuno sopra di sé, e resta fuori dal proprio
 * gestionale senza nessuna strada dentro il prodotto.
 *
 * ## Le tre regole
 *
 * **1. La risposta non dice se quell'indirizzo esiste.** Email sconosciuta,
 * account senza password, persona disattivata: stessa risposta, stesso testo.
 * Un modulo che risponde «questo indirizzo non è registrato» è un modo
 * educato di dare a chiunque l'elenco di chi lavora qui.
 *
 * **2. Il link è lo stesso di quello che genera il responsabile** — `apriReset`
 * in `staff-account.ts`, quarantott'ore, si consuma una volta e chiude le
 * sessioni aperte. Niente secondo meccanismo di token da tenere allineato.
 *
 * **3. Quello che non si può fare si dice.** Se su questa installazione non
 * c'è un fornitore di posta configurato, la pagina lo scrive: «l'invio delle
 * email non è attivo, chiedi il link al responsabile». È l'unica cosa che
 * questa funzione rivela — e non dipende dall'indirizzo digitato, quindi non
 * dice niente di nessuno.
 */

export const RichiestaRecuperoInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

export type EsitoRecupero =
  /** L'email è partita, **o** quell'indirizzo non ha un account: chi chiede non sa quale delle due. */
  | { stato: "presa_in_carico" }
  /** Su questa installazione non si mandano email. Vero per tutti, non dice niente su nessuno. */
  | { stato: "posta_non_configurata" }
  /** Il fornitore ha rifiutato. Da dire, altrimenti si aspetta un'email che non arriverà. */
  | { stato: "invio_non_riuscito" };

/** Questa installazione sa mandare email? */
export function postaConfigurata() {
  return !!process.env.BREVO_API_KEY;
}

export async function chiediRecuperoPassword(raw: unknown, origine: string): Promise<EsitoRecupero> {
  const { email } = RichiestaRecuperoInput.parse(raw);

  if (!postaConfigurata()) return { stato: "posta_non_configurata" };

  const utente = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      passwordHash: true,
      // Almeno un locale a cui questa persona ha ancora accesso. Chi è stato
      // disattivato non rientra reimpostando la password: la strada di
      // servizio non deve riaprire una porta che qualcuno ha chiuso.
      venueMemberships: { where: { disabledAt: null }, select: { id: true }, take: 1 },
    },
  });

  const puoRientrare = !!utente?.passwordHash && utente.venueMemberships.length > 0;
  if (!utente || !puoRientrare) return { stato: "presa_in_carico" };

  const { token } = await apriReset(utente.id);
  const link = `${origine}/reimposta-password/${token}`;

  try {
    await brevoAdapter.sendTransactionalEmail({
      to: email,
      subject: "Reimposta la password di Tavolo",
      html: corpoEmail(link, utente.name),
    });
  } catch (err) {
    console.error("[recupero-password] invio non riuscito", err);
    return { stato: "invio_non_riuscito" };
  }

  return { stato: "presa_in_carico" };
}

/**
 * Il corpo dell'email. Tre cose e basta: il pulsante, quanto vale, e cosa fare
 * se non l'hai chiesto tu — perché un'email di reimpostazione che arriva a chi
 * non l'ha chiesta è il primo segnale che qualcuno sta provando a entrare.
 */
export function corpoEmail(link: string, nome?: string | null) {
  const saluto = nome ? `Ciao ${nome},` : "Ciao,";
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">Reimposta la password</h1>
      <p style="font-size: 15px; line-height: 1.5;">${saluto}</p>
      <p style="font-size: 15px; line-height: 1.5;">
        Hai chiesto di reimpostare la password del tuo accesso a Tavolo. Scegline una nuova da qui:
      </p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background: #8a4b2a; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-size: 15px; display: inline-block;">
          Scegli una nuova password
        </a>
      </p>
      <p style="font-size: 13px; color: #666; line-height: 1.5;">
        Il link vale ${ORE_VALIDITA_RESET} ore e una volta sola. Aprendolo, gli altri dispositivi
        collegati con la password vecchia escono da Tavolo.
      </p>
      <p style="font-size: 13px; color: #666; line-height: 1.5;">
        Se non l'hai chiesto tu, non fare niente: la password resta quella di prima. Se ti arriva
        più volte, dillo a chi gestisce il locale.
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 28px;">Tavolo · gestionale ospitalità</p>
    </div>
  `;
}
