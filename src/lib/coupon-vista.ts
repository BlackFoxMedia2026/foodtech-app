import type { CouponView } from "@/server/coupons";

/**
 * Come si legge un coupon.
 *
 * Sta in `lib` e non dentro un componente perché le stesse tre domande —
 * *in che gruppo sta*, *che stato mostra*, *a quali condizioni vale* — servono
 * alla scheda dell'elenco, al pannello «Gestisci» e alle linguette che contano
 * quanti ce n'è per gruppo. Scritte tre volte, prima o poi la linguetta
 * «In pausa» direbbe 1 e la pillola sulla scheda direbbe «Valido».
 */

export const CATEGORIA: Record<string, string> = {
  GENERIC: "Generico",
  BIRTHDAY: "Compleanno",
  WINBACK: "Recupero",
  EVENT: "Evento",
  NEW_CUSTOMER: "Nuovo cliente",
  WIFI: "Wi-Fi",
  REFERRAL: "Passaparola",
  STAFF: "Personale",
};

export function categoriaDi(c: Pick<CouponView, "category">): string {
  return CATEGORIA[c.category] ?? c.category;
}

/* -------------------------------------------------------------------------- */
/*  I gruppi                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * I quattro gruppi delle linguette.
 *
 * Non sono i quattro valori di `CouponStatus`: **«terminato» non è uno stato
 * salvato**, è il verdetto dell'orologio e del contatore. Un coupon scaduto ha
 * `status: ACTIVE` nel database e non varrà mai più, e metterlo fra gli attivi
 * vorrebbe dire che la linguetta «Attivi» conta cose che non funzionano.
 *
 * `wrong_day` e `not_yet_valid` invece restano fra gli attivi di proposito:
 * un coupon del martedì, letto di lunedì, non è finito — è un coupon che vale
 * domani, e sparirlo dalla vista principale sarebbe un difetto, non un filtro.
 */
export type GruppoCoupon = "attivi" | "pausa" | "terminati" | "archiviati";

export const GRUPPI: { id: GruppoCoupon; nome: string }[] = [
  { id: "attivi", nome: "Attivi" },
  { id: "pausa", nome: "In pausa" },
  { id: "terminati", nome: "Terminati" },
  { id: "archiviati", nome: "Archiviati" },
];

export function gruppoDi(c: Pick<CouponView, "status" | "stato">): GruppoCoupon {
  if (c.status === "ARCHIVED") return "archiviati";
  if (c.status === "PAUSED") return "pausa";
  if (c.stato === "expired" || c.stato === "exhausted") return "terminati";
  return "attivi";
}

/* -------------------------------------------------------------------------- */
/*  Lo stato, in una pillola                                                  */
/* -------------------------------------------------------------------------- */

export type TonoStato = "success" | "warning" | "gold" | "info" | "neutral";

/**
 * Lo stato che si vede: una parola, un tono, e se il pallino è pieno o vuoto.
 *
 * Il pallino pieno vuol dire «sta succedendo adesso», l'anello «è concluso»:
 * è la stessa convenzione delle prenotazioni (`.badge-dot-anello`), e porta
 * metà dell'informazione senza aggiungere un colore.
 *
 * `spento` non è una terza informazione: è la conseguenza visiva di un coupon
 * che **adesso non si può usare e non è questione di orario**. La scheda
 * scende di opacità, come le righe non assegnabili in Staff, così scorrendo la
 * colonna si vede cosa è vivo senza leggere una pillola per volta. Un coupon
 * valido solo il martedì, letto di lunedì, resta acceso: vale domani.
 */
export function statoDi(c: Pick<CouponView, "status" | "stato">): {
  testo: string;
  tono: TonoStato;
  concluso: boolean;
  spento: boolean;
} {
  if (c.status === "ARCHIVED") {
    return { testo: "Archiviato", tono: "neutral", concluso: true, spento: true };
  }
  if (c.status === "PAUSED") {
    return { testo: "In pausa", tono: "warning", concluso: true, spento: true };
  }
  switch (c.stato) {
    case "usabile":
      return { testo: "Valido", tono: "success", concluso: false, spento: false };
    case "expired":
      return { testo: "Scaduto", tono: "neutral", concluso: true, spento: true };
    case "exhausted":
      return { testo: "Esaurito", tono: "neutral", concluso: true, spento: true };
    case "not_yet_valid":
      return { testo: "Non ancora", tono: "gold", concluso: false, spento: false };
    case "wrong_day":
      return { testo: "Non oggi", tono: "info", concluso: false, spento: false };
    default:
      // Gli altri motivi (cliente sbagliato, tetto per persona, spesa minima)
      // dipendono da chi sta usando il coupon e da quanto ha speso: nell'elenco
      // quei due non ci sono, quindi qui non possono comparire. Il ramo resta
      // perché `NonValido` è un'unione che cresce, e un coupon senza pillola
      // sarebbe peggio di uno con una pillola generica.
      return { testo: "Non valido", tono: "neutral", concluso: true, spento: true };
  }
}

/* -------------------------------------------------------------------------- */
/*  Le condizioni                                                             */
/* -------------------------------------------------------------------------- */

const GIORNI_CORTI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
export const GIORNI_INTERI = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
];

export function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export function giornoEMese(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(d);
}

/**
 * La preposizione che sta davanti a una data, elisa dove l'italiano la elide.
 *
 * «fino al 8 ottobre» era scritto così da sempre, e si legge come un errore di
 * battitura in una pagina che il ristoratore mostra ai suoi. Gli unici giorni
 * che cominciano per vocale sono l'8 e l'11: «fino all'8 ottobre»,
 * «scaduto l'11 marzo».
 */
export function conData(prep: "a" | "da" | "il", d: Date): string {
  const elide = d.getDate() === 8 || d.getDate() === 11;
  const articolo =
    prep === "a" ? (elide ? "all'" : "al ") : prep === "da" ? (elide ? "dall'" : "dal ") : elide ? "l'" : "il ";
  return `${articolo}${giornoEMese(d)}`;
}

/** Quanti giorni mancano a una data, contati per giorni di calendario. */
export function giorniA(data: Date, adesso: Date): number {
  const a = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const b = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** Una settimana: sotto questa soglia la scadenza smette di essere un dettaglio. */
export const GIORNI_DI_PREAVVISO = 7;

export type Condizione = { testo: string; avviso?: boolean };

/**
 * Le condizioni a cui un coupon vale, in ordine di quanto restringono.
 *
 * Restano sulla scheda, in grigio, e non finiscono nel pannello: sono **il
 * motivo per cui un coupon non vale oggi**, e un elenco in cui si legge
 * «Non oggi» senza poter vedere perché costringe ad aprire undici pannelli.
 *
 * Chi è il destinatario viene per primo quando c'è: sui coupon del Wi-Fi —
 * che sono uno per persona e tutti uguali — il nome è l'unica cosa che
 * distingue una scheda dalla successiva.
 *
 * La descrizione libera invece **non** è qui. «Sconto per chi si è collegato
 * alla rete del locale», ripetuto identico su venti schede, allargava la riga
 * di mezzo schermo per dire una cosa che il nome del coupon già dice: sta nel
 * pannello, dove si legge una volta.
 */
export function condizioniDi(c: CouponView, adesso: Date): Condizione[] {
  const out: Condizione[] = [];

  if (c.guestName) out.push({ testo: c.guestName });

  out.push({ testo: `${c.maxPerGuest} per cliente` });

  if (c.minSpendCents != null) out.push({ testo: `da ${euro(c.minSpendCents)} di conto` });

  const giorni = c.validWeekdays ?? [];
  if (giorni.length > 0) {
    out.push({
      testo: `solo ${giorni
        .slice()
        .sort((a, b) => a - b)
        .map((g) => GIORNI_CORTI[g])
        .join(", ")}`,
    });
  }

  if (c.validFrom && new Date(c.validFrom) > adesso) {
    out.push({ testo: conData("da", new Date(c.validFrom)) });
  }

  if (c.validUntil) {
    const fine = new Date(c.validUntil);
    const mancano = giorniA(fine, adesso);
    if (mancano < 0) {
      out.push({ testo: `scaduto ${conData("il", fine)}` });
    } else if (mancano === 0) {
      out.push({ testo: "scade oggi", avviso: true });
    } else if (mancano <= GIORNI_DI_PREAVVISO) {
      // La sola condizione che si accende: una scadenza fra quattro giorni è
      // l'unica cosa in questo elenco su cui si può ancora fare qualcosa.
      out.push({
        testo: mancano === 1 ? "scade domani" : `scade fra ${mancano} giorni`,
        avviso: true,
      });
    } else {
      out.push({ testo: `fino ${conData("a", fine)}` });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  La ricerca                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Cerca dove si cerca davvero: nome, codice, tipo e destinatario.
 *
 * Il codice **senza il trattino** conta come il codice: chi lo legge da un
 * messaggio o lo detta al telefono scrive «martedigsoy», e una ricerca che non
 * lo trova sembra rotta.
 */
export function corrisponde(c: CouponView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qSenzaTrattini = q.replace(/-/g, "");
  return (
    c.name.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q) ||
    c.code.toLowerCase().replace(/-/g, "").includes(qSenzaTrattini) ||
    categoriaDi(c).toLowerCase().includes(q) ||
    (c.guestName?.toLowerCase().includes(q) ?? false) ||
    c.descrizione.toLowerCase().includes(q)
  );
}
