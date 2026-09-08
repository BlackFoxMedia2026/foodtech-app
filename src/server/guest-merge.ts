import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";
import { normalizzaEmail, normalizzaTelefono } from "./guest-match";
import { puntiDi } from "./loyalty";
import { refreshGuestStats } from "./guest-intelligence";

/**
 * Due schede per la stessa persona, e come si rimettono in una.
 *
 * Da settembre chi prenota viene **riconosciuto** (`trovaOCreaOspite`), ma i
 * doppioni nati prima sono ancora lì, e ne nascono di nuovi in modi che
 * nessun riconoscimento può prendere: uno prenota dal sito con la mail, poi
 * telefona e lascia il numero, e sono due righe con due contatti diversi che
 * si scoprono uguali solo quando qualcuno le guarda vicine.
 *
 * Tre copie della stessa persona sono tre saldi punti che non si sommano, tre
 * conteggi di visite che dicono «prima volta» a un cliente abituale, e un
 * tetto per cliente sui coupon che vale tre volte.
 *
 * ## Le regole di questo modulo
 *
 * - **niente unione automatica.** Il sistema *propone*, una persona decide.
 *   Fondere due schede sbagliate è peggio che tenerne due: significa mostrare
 *   a qualcuno le note riservate di un altro, e non si torna indietro;
 * - **si propone solo su segnali esatti**: stessa email o stesso telefono,
 *   normalizzati. Nessuna somiglianza sui nomi — due «Marco Rossi» in un
 *   ristorante di quartiere sono due persone (è la stessa regola di
 *   `guest-match`, e qui vale doppio perché qui si cancella una riga);
 * - **niente si perde.** Prenotazioni, conti, punti, messaggi, consensi,
 *   sondaggi, code e coupon si spostano; le note e le allergie si **uniscono**
 *   invece di sovrascriversi, perché perdere un'allergia è il tipo di errore
 *   che si paga in sala;
 * - **i contatori si ricalcolano dalle righe**, non si sommano fra loro:
 *   visite, assenze e saldo punti tornano a essere la somma dei fatti;
 * - **una revoca di consenso vince su un consenso più vecchio.** Se la
 *   scheda A ha detto sì a gennaio e la B ha detto no a marzo, la persona ha
 *   detto no: si resta fuori dal marketing;
 * - **una scheda anonimizzata non si unisce.** I suoi dati sono stati
 *   cancellati su richiesta: rimetterli in circolo attaccandoli a un'altra
 *   riga sarebbe disfare una cancellazione.
 */

export class MergeError extends Error {
  constructor(public code: MergeErrorCode) {
    super(code);
    this.name = "MergeError";
  }
}

export type MergeErrorCode =
  | "stessa_scheda"
  | "non_trovata"
  | "anonimizzata"
  | "nessun_segnale";

/** Perché due schede sono state proposte come la stessa persona. */
export type MotivoDoppione = "email" | "telefono";

export type LatoDoppione = {
  id: string;
  nome: string;
  email: string | null;
  phone: string | null;
  visite: number;
  punti: number;
  prenotazioni: number;
  /** Quello che si perderebbe scegliendo l'altra come principale. */
  haNote: boolean;
  haAllergie: boolean;
  consensoMarketing: boolean;
  creataIl: string;
};

export type Doppione = {
  motivo: MotivoDoppione;
  /** Il valore che le lega: la mail o il numero, già normalizzato. */
  valore: string;
  /** La più vecchia: è la principale proposta, ma si può invertire. */
  principale: LatoDoppione;
  duplicato: LatoDoppione;
};

const SELECT_LATO = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  totalVisits: true,
  loyaltyPoints: true,
  privateNotes: true,
  allergies: true,
  marketingOptIn: true,
  createdAt: true,
  _count: { select: { bookings: true } },
} satisfies Prisma.GuestSelect;

type RigaOspite = Prisma.GuestGetPayload<{ select: typeof SELECT_LATO }>;

function lato(g: RigaOspite, punti: number): LatoDoppione {
  return {
    id: g.id,
    nome: `${g.firstName}${g.lastName ? ` ${g.lastName}` : ""}`,
    email: g.email,
    phone: g.phone,
    visite: g.totalVisits,
    punti,
    prenotazioni: g._count.bookings,
    haNote: !!g.privateNotes?.trim(),
    haAllergie: !!g.allergies?.trim(),
    consensoMarketing: g.marketingOptIn,
    creataIl: g.createdAt.toISOString(),
  };
}

/**
 * Le coppie da guardare, per email e per telefono.
 *
 * Si leggono gli ospiti del locale una volta e si raggruppa in memoria: i
 * numeri di telefono in tabella stanno come li ha scritti chi li ha inseriti,
 * quindi un `group by` sul campo non troverebbe `340 123 4567` e
 * `+393401234567`. Sono centinaia di righe per locale, non milioni — lo stesso
 * ragionamento di `trovaOspite`.
 *
 * Una coppia per volta e per motivo: se due schede hanno **sia** la mail sia
 * il telefono uguali, si propone una volta sola.
 */
export async function trovaDoppioni(
  venueId: string,
  opts: { limite?: number } = {},
): Promise<Doppione[]> {
  const [ospiti, saldi] = await Promise.all([
    db.guest.findMany({
      where: { venueId, anonymizedAt: null },
      select: SELECT_LATO,
      /**
       * La più vecchia per prima, **e l'identificativo come spareggio**.
       *
       * Con il solo `createdAt` due schede create nello stesso istante
       * tornavano in ordine arbitrario, e la principale proposta cambiava fra
       * un caricamento e l'altro: un test l'ha scoperto fallendo una volta su
       * tre. Una schermata dove si decide quale scheda cancellare non può
       * proporre due cose diverse alla stessa domanda.
       */
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    /**
     * I punti si contano dalle **righe**, non dal contatore.
     *
     * `Guest.loyaltyPoints` è una copia aggiornata nella stessa transazione
     * dei movimenti, quindi di solito coincide — ma in una schermata dove si
     * decide quale scheda cancellare, il numero da guardare è quello vero.
     * Una lettura raggruppata sola per tutto il locale.
     */
    db.loyaltyTransaction.groupBy({ by: ["guestId"], where: { venueId }, _sum: { points: true } }),
  ]);
  const puntiDi = new Map(saldi.map((s) => [s.guestId, s._sum.points ?? 0]));

  const perEmail = new Map<string, RigaOspite[]>();
  const perTelefono = new Map<string, RigaOspite[]>();
  for (const g of ospiti) {
    const email = normalizzaEmail(g.email);
    if (email) perEmail.set(email, [...(perEmail.get(email) ?? []), g]);
    const tel = normalizzaTelefono(g.phone);
    if (tel) perTelefono.set(tel, [...(perTelefono.get(tel) ?? []), g]);
  }

  const doppioni: Doppione[] = [];
  const gia = new Set<string>();

  function aggiungi(motivo: MotivoDoppione, valore: string, gruppo: RigaOspite[]) {
    // Un gruppo di tre schede diventa due coppie sulla stessa principale:
    // unire a due a due lascia a chi decide il controllo su ogni passo.
    const [primo, ...resto] = gruppo;
    for (const altro of resto) {
      const chiave = [primo.id, altro.id].sort().join("|");
      if (gia.has(chiave)) continue;
      gia.add(chiave);
      doppioni.push({
        motivo,
        valore,
        principale: lato(primo, puntiDi.get(primo.id) ?? 0),
        duplicato: lato(altro, puntiDi.get(altro.id) ?? 0),
      });
    }
  }

  for (const [valore, gruppo] of perEmail) if (gruppo.length > 1) aggiungi("email", valore, gruppo);
  for (const [valore, gruppo] of perTelefono) if (gruppo.length > 1) aggiungi("telefono", valore, gruppo);

  return doppioni.slice(0, opts.limite ?? 50);
}

/**
 * Quante coppie ci sono, per l'avviso nella lista clienti.
 *
 * Legge **solo** contatti e identificativi: la pagina degli ospiti si apre
 * spesso, e per sapere *se* mostrare un avviso non serve sapere quante visite
 * ha ciascuno né quanti punti ha accumulato. `trovaDoppioni` legge quelle
 * cose perché deve mostrarle; qui sarebbe lavoro buttato via su ogni
 * caricamento.
 */
export async function contaDoppioni(venueId: string): Promise<number> {
  const ospiti = await db.guest.findMany({
    where: { venueId, anonymizedAt: null },
    select: { id: true, email: true, phone: true },
  });

  const coppie = new Set<string>();
  const primoPer = new Map<string, string>();

  function segna(chiave: string | null, id: string) {
    if (!chiave) return;
    const primo = primoPer.get(chiave);
    if (!primo) primoPer.set(chiave, id);
    else coppie.add([primo, id].sort().join("|"));
  }

  for (const g of ospiti) {
    segna(normalizzaEmail(g.email) && `e:${normalizzaEmail(g.email)}`, g.id);
    segna(normalizzaTelefono(g.phone) && `t:${normalizzaTelefono(g.phone)}`, g.id);
  }

  return coppie.size;
}

/* -------------------------------------------------------------------------- */
/*  L'unione                                                                  */
/* -------------------------------------------------------------------------- */

/** Unisce due note tenendole entrambe: perdere una nota scritta a mano è una perdita. */
function unisciTesti(a: string | null, b: string | null): string | null {
  const primo = a?.trim() || null;
  const secondo = b?.trim() || null;
  if (!primo) return secondo;
  if (!secondo) return primo;
  if (primo.toLowerCase().includes(secondo.toLowerCase())) return primo;
  return `${primo}\n${secondo}`;
}

export type EsitoUnione = {
  guestId: string;
  /** Cosa è stato spostato, per riga di registro e per la frase di conferma. */
  spostate: Record<string, number>;
  punti: number;
  consensoMarketing: boolean;
};

export async function unisciOspiti(
  venueId: string,
  principaleId: string,
  duplicatoId: string,
  opts: { actor?: AuditActor } = {},
): Promise<EsitoUnione> {
  if (principaleId === duplicatoId) throw new MergeError("stessa_scheda");

  const esito = await db.$transaction(async (tx) => {
    const [principale, duplicato] = await Promise.all([
      tx.guest.findFirst({ where: { id: principaleId, venueId } }),
      tx.guest.findFirst({ where: { id: duplicatoId, venueId } }),
    ]);
    if (!principale || !duplicato) throw new MergeError("non_trovata");
    if (principale.anonymizedAt || duplicato.anonymizedAt) throw new MergeError("anonimizzata");

    /**
     * Si unisce **solo** ciò che un segnale esatto lega.
     *
     * È la difesa che conta: senza di essa una chiamata all'API con due
     * identificativi qualsiasi fonderebbe due clienti diversi, e sarebbe una
     * riga di codice a fare il danno che tutto questo modulo esiste per
     * evitare. La stessa verifica la fa l'elenco delle proposte, ma un
     * controllo che sta solo nell'interfaccia non è un controllo.
     */
    const emailUguale =
      !!normalizzaEmail(principale.email) &&
      normalizzaEmail(principale.email) === normalizzaEmail(duplicato.email);
    const telefonoUguale =
      !!normalizzaTelefono(principale.phone) &&
      normalizzaTelefono(principale.phone) === normalizzaTelefono(duplicato.phone);
    if (!emailUguale && !telefonoUguale) throw new MergeError("nessun_segnale");

    const spostate: Record<string, number> = {};
    const conta = (nome: string, n: number) => {
      if (n > 0) spostate[nome] = n;
    };

    // Le righe che portano `guestId`: si spostano tutte sulla principale.
    conta(
      "prenotazioni",
      (await tx.booking.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "conti",
      (await tx.order.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "movimenti punti",
      (await tx.loyaltyTransaction.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } }))
        .count,
    );
    conta(
      "consensi",
      (await tx.consentLog.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "messaggi",
      (await tx.messageLog.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "sondaggi",
      (await tx.survey.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "attese",
      (await tx.waitlistEntry.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "coupon",
      (await tx.coupon.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "coupon usati",
      (await tx.couponRedemption.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } }))
        .count,
    );
    conta(
      "contatti dal Wi-Fi",
      (await tx.wifiLead.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );
    conta(
      "pagamenti",
      (await tx.payment.updateMany({ where: { guestId: duplicatoId }, data: { guestId: principaleId } })).count,
    );

    /**
     * I collegamenti ai fornitori esterni hanno un vincolo di unicità per
     * `(ospite, fornitore)`: se entrambe le schede hanno un collegamento allo
     * stesso fornitore, spostarlo violerebbe il vincolo. Si tiene quello
     * della principale e si scarta l'altro — e si scrive nel registro,
     * perché è l'unica cosa che questa operazione butta via.
     */
    const linkPrincipale = await tx.guestProviderLink.findMany({
      where: { guestId: principaleId },
      select: { provider: true },
    });
    const gia = new Set(linkPrincipale.map((l) => l.provider));
    const linkDuplicato = await tx.guestProviderLink.findMany({ where: { guestId: duplicatoId } });
    for (const l of linkDuplicato) {
      if (gia.has(l.provider)) {
        await tx.guestProviderLink.delete({ where: { id: l.id } });
        spostate["collegamenti scartati"] = (spostate["collegamenti scartati"] ?? 0) + 1;
      } else {
        await tx.guestProviderLink.update({ where: { id: l.id }, data: { guestId: principaleId } });
        spostate["collegamenti"] = (spostate["collegamenti"] ?? 0) + 1;
      }
    }

    /**
     * Il consenso al marketing: **l'ultima parola detta**.
     *
     * I consensi ora stanno tutti sulla principale (li abbiamo appena
     * spostati): se il più recente è una revoca, la persona ha detto no, e
     * una scheda che dice sì non la riporta dentro. Senza nessun consenso
     * registrato si tiene il sì solo se una delle due lo aveva — è un dato
     * che il locale ha raccolto, e cancellarlo per un'unione sarebbe perdere
     * un permesso vero.
     */
    const ultimoConsenso = await tx.consentLog.findFirst({
      where: { guestId: principaleId, channel: "EMAIL" },
      orderBy: { createdAt: "desc" },
      select: { granted: true },
    });
    const consensoMarketing = ultimoConsenso
      ? ultimoConsenso.granted
      : principale.marketingOptIn || duplicato.marketingOptIn;

    await tx.guest.update({
      where: { id: principaleId },
      data: {
        // I buchi si riempiono; quello che c'è non si sovrascrive.
        lastName: principale.lastName ?? duplicato.lastName,
        email: principale.email ?? duplicato.email,
        phone: principale.phone ?? duplicato.phone,
        birthday: principale.birthday ?? duplicato.birthday,
        // Note e allergie si uniscono: perdere un'allergia si paga in sala.
        allergies: unisciTesti(principale.allergies, duplicato.allergies),
        privateNotes: unisciTesti(principale.privateNotes, duplicato.privateNotes),
        // Le preferenze stanno in un campo JSON: `null` non è un valore
        // accettato da Prisma in scrittura, quindi si scrive solo se c'è
        // qualcosa da scrivere.
        ...(principale.preferences == null && duplicato.preferences != null
          ? { preferences: duplicato.preferences as Prisma.InputJsonValue }
          : {}),
        tags: [...new Set([...principale.tags, ...duplicato.tags])],
        marketingOptIn: consensoMarketing,
        // Se una delle due era bloccata, resta bloccata: sbloccare per errore
        // è più grave che tenere un blocco di troppo.
        blocked: principale.blocked || duplicato.blocked,
        blockedAt: principale.blockedAt ?? duplicato.blockedAt,
        blockedReason: principale.blockedReason ?? duplicato.blockedReason,
        // Il livello più alto delle due: chi era VIP non torna «nuovo».
        loyaltyTier: livelloPiuAlto(principale.loyaltyTier, duplicato.loyaltyTier),
      },
    });

    // La scheda vuota si cancella: niente più punta a lei.
    await tx.guest.delete({ where: { id: duplicatoId } });

    // I contatori tornano a essere la somma delle righe, non la somma dei
    // contatori: sommarli avrebbe contato due volte tutto ciò che era già
    // sbagliato.
    const punti = await puntiDi(principaleId, tx);
    await tx.guest.update({ where: { id: principaleId }, data: { loyaltyPoints: punti } });

    return { guestId: principaleId, spostate, punti, consensoMarketing };
  });

  // Visite, assenze e ultima visita: fuori dalla transazione, perché
  // `refreshGuestStats` ha il suo client e legge le righe già spostate.
  await refreshGuestStats(principaleId);

  await recordAudit(opts.actor, "guest.merge", "guest", principaleId, {
    duplicato: duplicatoId,
    spostate: esito.spostate,
    consensoMarketing: esito.consensoMarketing,
  });

  return esito;
}

const ORDINE_LIVELLI = ["NEW", "REGULAR", "VIP", "AMBASSADOR"] as const;
type Livello = (typeof ORDINE_LIVELLI)[number];

export function livelloPiuAlto(a: string, b: string): Livello {
  const ia = ORDINE_LIVELLI.indexOf(a as Livello);
  const ib = ORDINE_LIVELLI.indexOf(b as Livello);
  return ORDINE_LIVELLI[Math.max(ia, ib, 0)];
}
