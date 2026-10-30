import { db } from "@/lib/db";
import { normalizzaEmail, sopprimi } from "./destinatari";

/**
 * Il ritiro del consenso email, da qualunque parte arrivi.
 *
 * Le strade sono quattro — il link in fondo all'email, il clic nel programma
 * di posta, una segnalazione di spam, la disiscrizione registrata da Brevo —
 * e prima ognuna faceva la sua parte: chi scriveva il registro dei consensi e
 * chi no, chi toccava una scheda sola e chi tutte. Il risultato era che
 * un'unione di schede, leggendo l'ultimo consenso registrato, poteva
 * **riattivare** una persona che aveva detto no dal programma di posta.
 *
 * Qui le tre cose si fanno sempre insieme, e sempre per **tutte** le schede
 * del locale con quell'indirizzo:
 *
 * 1. la soppressione dell'indirizzo, che vale anche per le schede future;
 * 2. la scheda smette di avere il consenso, con la data;
 * 3. il registro dei consensi conserva il fatto e da dove è arrivato.
 */
export async function revocaConsensoEmail(
  venueId: string,
  email: string | null,
  opts: {
    source: string;
    reason?: "UNSUBSCRIBE" | "COMPLAINT";
    quando?: Date;
    /** Schede da toccare anche se l'indirizzo non coincide (o manca). */
    guestIds?: string[];
    detail?: string;
  },
): Promise<string[]> {
  const quando = opts.quando ?? new Date();
  const indirizzo = email ? normalizzaEmail(email) : "";

  if (indirizzo) {
    await sopprimi(venueId, indirizzo, opts.reason ?? "UNSUBSCRIBE", {
      source: opts.source,
      detail: opts.detail,
    });
  }

  const condizioni = [
    ...(indirizzo ? [{ email: { equals: indirizzo, mode: "insensitive" as const } }] : []),
    ...(opts.guestIds?.length ? [{ id: { in: opts.guestIds } }] : []),
  ];
  if (condizioni.length === 0) return [];

  const schede = await db.guest.findMany({
    where: { venueId, OR: condizioni },
    select: { id: true, marketingOptIn: true, unsubscribedAt: true },
  });

  const toccate: string[] = [];
  for (const g of schede) {
    // Già fuori, e già segnata: riscriverla aggiungerebbe solo una riga al
    // registro per ogni riconsegna dello stesso evento.
    if (!g.marketingOptIn && g.unsubscribedAt) continue;
    await db.guest.update({
      where: { id: g.id },
      data: { marketingOptIn: false, unsubscribedAt: g.unsubscribedAt ?? quando },
    });
    await db.consentLog.create({
      data: {
        id: crypto.randomUUID(),
        venueId,
        guestId: g.id,
        channel: "EMAIL",
        granted: false,
        source: opts.source,
      },
    });
    toccate.push(g.id);
  }
  return toccate;
}

/**
 * La scheda a cui punta oggi un identificativo che forse non esiste più.
 *
 * Il link di disiscrizione porta l'identificativo della scheda **del giorno
 * dell'invio**. Se nel frattempo quella scheda è stata unita a un'altra, la
 * riga non c'è più — e la pagina rispondeva «non riceverai più email» senza
 * aver fatto niente. L'unione lascia nel registro delle azioni la coppia
 * duplicato → principale (`guest.merge`, sempre, anche senza un utente): qui
 * la si segue, anche più passaggi, fino a una scheda che esiste.
 */
export async function schedaCorrente(guestId: string) {
  let id = guestId;
  for (let passo = 0; passo < 10; passo++) {
    const scheda = await db.guest.findUnique({ where: { id } });
    if (scheda) return scheda;
    const unione = await db.auditLog.findFirst({
      where: { action: "guest.merge", entityType: "guest", diff: { path: ["duplicato"], equals: id } },
      orderBy: { createdAt: "desc" },
      select: { entityId: true },
    });
    if (!unione?.entityId) return null;
    id = unione.entityId;
  }
  return null;
}

/**
 * La disiscrizione dal link: quello in fondo all'email e quello che il
 * programma di posta chiama da solo (RFC 8058). Restituisce la scheda
 * toccata, o `null` se non ne è stata trovata nessuna.
 */
export async function disiscriviDaLink(guestId: string, source: string) {
  const scheda = await schedaCorrente(guestId);
  if (!scheda) return null;
  await revocaConsensoEmail(scheda.venueId, scheda.email, { source, guestIds: [scheda.id] });

  // Arrivati per un'unione: l'email con questo link può essere partita
  // verso l'indirizzo del duplicato, che la principale non ha tenuto (le
  // schede unite per telefono hanno due indirizzi). Le righe dei destinatari
  // sono state spostate sulla principale e lo conservano: si sopprime anche
  // quello.
  if (scheda.id !== guestId) {
    const indirizzi = await db.campaignRecipient.findMany({
      where: { guestId: scheda.id },
      select: { email: true },
      distinct: ["email"],
    });
    for (const { email } of indirizzi) {
      await sopprimi(scheda.venueId, email, "UNSUBSCRIBE", { source });
    }
  }
  return scheda;
}
