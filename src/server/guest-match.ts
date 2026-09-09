import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Trovare la persona che è già nel CRM, invece di crearne un'altra copia.
 *
 * `createBooking` creava **sempre** un nuovo ospite: chi prenotava dal sito
 * per la terza volta finiva nel CRM per la terza volta. Nessuno se ne era
 * accorto perché sul database di sviluppo i doppioni non c'erano ancora, ma il
 * difetto è di quelli che peggiorano da soli: il profilo dell'ospite conta le
 * visite di **una** riga, il tetto per cliente dei coupon vale per **una**
 * riga, e da oggi anche i punti fedeltà si accumulano su **una** riga. Tre
 * copie della stessa persona sono tre saldi che non si sommano, e il cliente
 * che chiede «dove sono i miei punti?» ha ragione.
 *
 * Il riconoscimento è **esatto e prudente**: stessa email, oppure stesso
 * telefono, dentro lo stesso locale. Niente somiglianza sui nomi — due
 * «Marco Rossi» in un ristorante di quartiere sono due persone, e fondere le
 * schede sbagliate è peggio che tenerne due: significa mostrare a qualcuno le
 * note riservate di un altro.
 *
 * L'email si confronta senza distinzione fra maiuscole e minuscole
 * (`Mario@x.it` e `mario@x.it` sono la stessa casella), il telefono togliendo
 * spazi, punti e trattini — quello che cambia fra come lo scrive una persona e
 * come lo scrive un'altra, non il numero.
 */

/** Solo le cifre e l'eventuale `+`: `+39 340 123 45 67` → `+393401234567`. */
export function normalizzaTelefono(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const pulito = raw.trim().replace(/[\s.\-()/]/g, "");
  if (!pulito) return null;
  const soloCifre = pulito.replace(/^\+/, "");
  if (!/^\d{5,}$/.test(soloCifre)) return null;
  return pulito.startsWith("+") ? `+${soloCifre}` : soloCifre;
}

export function normalizzaEmail(raw: string | null | undefined): string | null {
  const pulito = raw?.trim().toLowerCase();
  return pulito || null;
}

export type DatiOspite = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type EsitoRiconoscimento = {
  guestId: string;
  /** Vero quando la persona era già nel CRM. */
  giaConosciuto: boolean;
};

/**
 * Cerca un ospite per email o telefono dentro il locale.
 *
 * Il confronto sull'email è insensibile alle maiuscole, quello sul telefono
 * avviene sulla forma normalizzata: siccome in tabella i numeri stanno come
 * li ha scritti chi li ha inseriti, si confrontano in memoria sui candidati
 * dello stesso locale invece di sperare in un `where` fortunato. Sono
 * centinaia di righe per locale, non milioni.
 */
export async function trovaOspite(
  venueId: string,
  dati: { email?: string | null; phone?: string | null },
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<string | null> {
  const email = normalizzaEmail(dati.email);
  const phone = normalizzaTelefono(dati.phone);
  if (!email && !phone) return null;

  // L'email prima: è l'identificatore più affidabile dei due, e chi cambia
  // numero di telefono resta la stessa persona.
  if (email) {
    const perEmail = await tx.guest.findFirst({
      where: { venueId, email: { equals: email, mode: "insensitive" }, anonymizedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (perEmail) return perEmail.id;
  }

  if (phone) {
    const conTelefono = await tx.guest.findMany({
      where: { venueId, phone: { not: null }, anonymizedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, phone: true },
    });
    const trovato = conTelefono.find((g) => normalizzaTelefono(g.phone) === phone);
    if (trovato) return trovato.id;
  }

  return null;
}

export type OspiteRiconosciuto = {
  guestId: string;
  nome: string;
  visite: number;
  ultimaVisita: string | null;
  livello: string;
  allergie: string | null;
  assenze: number;
};

/**
 * Chi è la persona che sta al telefono, mentre la si sta ancora scrivendo.
 *
 * ## A cosa serve, e a cosa **non** serve
 *
 * Non serve a evitare i doppioni: quelli il server li evita già da sé, perché
 * `createBooking` passa da `trovaOCreaOspite` e riusa la scheda che c'è.
 *
 * Serve a due cose che il server non può fare per conto di chi risponde al
 * telefono. La prima è **non chiedere** quello che il locale sa già: nome,
 * cognome, email. La seconda, che vale di più, è il **contesto nel momento in
 * cui si decide**: che questa persona è un VIP, che è allergica ai crostacei,
 * che due volte non si è presentata. Sono le tre cose che cambiano la risposta
 * a «avete un tavolo sabato?», e oggi si scoprono dopo, aprendo la scheda —
 * cioè quasi mai.
 *
 * Il conteggio delle visite viene dalle prenotazioni, non da un contatore:
 * `totalVisits` è aggiornato da `refreshGuestStats` a ogni cambio di stato che
 * conta, ed è la stessa fonte che legge l'elenco ospiti.
 */
export async function riconosciOspite(
  venueId: string,
  dati: { email?: string | null; phone?: string | null },
): Promise<OspiteRiconosciuto | null> {
  const id = await trovaOspite(venueId, dati);
  if (!id) return null;

  const g = await db.guest.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      totalVisits: true,
      lastVisitAt: true,
      loyaltyTier: true,
      allergies: true,
      noShowCount: true,
    },
  });
  if (!g) return null;

  return {
    guestId: g.id,
    nome: `${g.firstName} ${g.lastName ?? ""}`.trim(),
    visite: g.totalVisits,
    ultimaVisita: g.lastVisitAt?.toISOString() ?? null,
    livello: g.loyaltyTier,
    allergie: g.allergies,
    assenze: g.noShowCount,
  };
}

/**
 * L'ospite che c'è già, o uno nuovo.
 *
 * Su un ospite riconosciuto **non si sovrascrive niente** tranne i contatti
 * che mancavano: chi prenota dal sito scrivendo solo il nome di battesimo non
 * deve cancellare il cognome che il locale aveva registrato al telefono, e una
 * nota riservata non deve sparire perché qualcuno ha ricompilato un modulo.
 * Riempire un buco è un miglioramento; riscrivere un dato esistente è una
 * perdita.
 */
export async function trovaOCreaOspite(
  venueId: string,
  dati: DatiOspite,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<EsitoRiconoscimento> {
  const email = normalizzaEmail(dati.email);
  const phone = dati.phone?.trim() || null;

  const esistente = await trovaOspite(venueId, { email, phone }, tx);
  if (esistente) {
    const g = await tx.guest.findUniqueOrThrow({
      where: { id: esistente },
      select: { email: true, phone: true, lastName: true },
    });
    const daRiempire: Record<string, string> = {};
    if (!g.email && email) daRiempire.email = email;
    if (!g.phone && phone) daRiempire.phone = phone;
    if (!g.lastName && dati.lastName?.trim()) daRiempire.lastName = dati.lastName.trim();
    if (Object.keys(daRiempire).length > 0) {
      await tx.guest.update({ where: { id: esistente }, data: daRiempire });
    }
    return { guestId: esistente, giaConosciuto: true };
  }

  const creato = await tx.guest.create({
    data: {
      venueId,
      firstName: dati.firstName.trim(),
      lastName: dati.lastName?.trim() || null,
      email,
      phone,
    },
    select: { id: true },
  });
  return { guestId: creato.id, giaConosciuto: false };
}
