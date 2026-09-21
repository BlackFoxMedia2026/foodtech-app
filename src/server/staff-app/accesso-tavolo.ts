import { db } from "@/lib/db";
import { dateKeyInVenue } from "@/lib/venue-time";
import { getFloorLive } from "@/server/floor-live";
import type { PermessoStaff } from "@/lib/permessi-staff";
import { servizioCorrente, tavoliAssegnatiA } from "./sala";

/**
 * **Questo tavolo è tuo?**
 *
 * Il controllo sta in un posto solo perché deve valere identico su sette
 * rotte: aprire il tavolo, aprire il conto, battere una riga, inviare,
 * scrivere una nota, chiedere il conto, segnare servito. Sei copie della
 * stessa `if` sono sei occasioni di dimenticarne una, e quella dimenticata è
 * un cameriere che modifica la comanda di un collega.
 *
 * `view_all_tables` passa sempre: è il permesso del maître e del responsabile
 * di sala, gente che sui tavoli altrui ci deve mettere le mani per mestiere.
 */
export async function tavoloConsentito(
  ctx: { venueId: string; timezone: string; waiterId: string; permessi: readonly PermessoStaff[] },
  tableId: string,
  adesso = new Date(),
): Promise<boolean> {
  if (ctx.permessi.includes("view_all_tables")) return true;
  const servizio = await servizioCorrente(ctx.venueId, ctx.timezone, adesso);
  const giorno = dateKeyInVenue(adesso, ctx.timezone);
  const miei = await tavoliAssegnatiA(ctx.venueId, ctx.waiterId, giorno, servizio);
  return miei.has(tableId);
}

/**
 * Lo stesso controllo, partendo da una comanda.
 *
 * Le rotte che toccano una comanda ricevono il suo identificativo, non quello
 * del tavolo: senza questo passaggio un cameriere potrebbe aggiungere una riga
 * alla comanda di un collega scrivendone l'identificativo a mano. Una comanda
 * senza tavolo — un conto d'asporto — non è materia della sala e si rifiuta.
 */
export async function comandaConsentita(
  ctx: { venueId: string; timezone: string; waiterId: string; permessi: readonly PermessoStaff[] },
  comandaId: string,
  adesso = new Date(),
): Promise<boolean> {
  const comanda = await db.comanda.findFirst({
    where: { id: comandaId, venueId: ctx.venueId },
    select: { tableId: true },
  });
  if (!comanda?.tableId) return ctx.permessi.includes("view_all_tables");
  return tavoloConsentito(ctx, comanda.tableId, adesso);
}

/**
 * **Su questo tavolo posso accomodare qualcuno?**
 *
 * Diverso da `tavoloConsentito`, e la differenza è tutta nel fatto che un
 * tavolo libero non ha sopra i dati di nessuno.
 *
 * `tavoloConsentito` protegge **le persone sedute**: il conto, le allergie, la
 * comanda di un collega. Ma un tavolo vuoto non ha niente da proteggere, e
 * chiedere il permesso del maître per farci sedere chi aspetta all'ingresso
 * vorrebbe dire che il cameriere che ha davanti quattro persone in piedi deve
 * cercare il maître. È la stessa distinzione che `OpzioniSala.ancheLiberi`
 * fa già in lettura, applicata qui in scrittura.
 *
 * Cosa continua a servire:
 *
 * - `manage_tables`, che è il permesso di questo gesto e lo verifica la rotta;
 * - il tavolo deve essere **vuoto adesso**. Non è una formalità: è la sola
 *   protezione che resta, e vuol dire che nessuno può usare questa strada per
 *   spostare qualcun altro dal tavolo di un collega.
 *
 * «Vuoto» comprende `PRENOTATO`, cioè un tavolo su cui c'è un nome più tardi:
 * adesso non c'è nessuno, e il suggerimento lo offre — con scritto quando si
 * deve liberare. Se poi la seduta si sovrappone davvero a quella
 * prenotazione, chi rifiuta è la transazione di `assignBookingToTable`, che
 * quel confronto lo sa fare sugli orari veri. Accettare qui solo `LIBERO`
 * vorrebbe dire rispondere «non è tuo» su un tavolo che la schermata accanto
 * sta proponendo.
 */
export async function tavoloAccomodabile(
  ctx: { venueId: string; timezone: string; waiterId: string; permessi: readonly PermessoStaff[] },
  tableId: string,
  adesso = new Date(),
): Promise<boolean> {
  if (await tavoloConsentito(ctx, tableId, adesso)) return true;

  const live = await getFloorLive(ctx.venueId, { now: adesso });
  const stato = live.byTableId[tableId]?.status;
  return stato === "LIBERO" || stato === "PRENOTATO";
}
