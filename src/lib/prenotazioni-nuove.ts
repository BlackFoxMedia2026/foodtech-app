import type { BookingStatus } from "@prisma/client";
import { dateKeyInVenue, DEFAULT_VENUE_TIMEZONE, oraInVenue, shiftDateKey } from "@/lib/venue-time";

/**
 * Le regole del riquadro «Prenotazioni» della Panoramica, senza database e
 * senza React: chi è «nuova», come si dice quando arriva, come si divide la
 * giornata, e la coda delle azioni che si possono ancora annullare.
 *
 * Stanno qui perché le usa il componente nel browser e le prove le verificano
 * da sole; la lettura dal database sta in `server/prenotazioni-nuove.ts`.
 */

/** Una prenotazione come la riceve il riquadro: date in ISO, nomi già pronti. */
export type PrenotazioneRiquadro = {
  id: string;
  nome: string;
  partySize: number;
  /** ISO. */
  startsAt: string;
  /** ISO: quando è arrivata. */
  createdAt: string;
  status: BookingStatus;
  /** ISO, o nullo se nessuno l'ha ancora gestita dalla Panoramica. */
  seenAt: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Chi è nuova                                                               */
/* -------------------------------------------------------------------------- */

/**
 * «Nuova» = arrivata e non ancora gestita dallo staff.
 *
 * - in attesa (`PENDING`): aspetta una decisione, sempre;
 * - confermata ma non vista: l'ha confermata un collega da un'altra parte
 *   (l'elenco, la Staff App) e chi guarda la Panoramica non lo sa ancora.
 *
 * Non esiste una conferma automatica: ogni prenotazione da fuori nasce in
 * attesa (`determineBookingStatus`), quindi «Già confermata» vuol dire sempre
 * che **qualcuno** l'ha confermata.
 */
export function eNuova(p: Pick<PrenotazioneRiquadro, "status" | "seenAt">): boolean {
  return p.status === "PENDING" || (p.status === "CONFIRMED" && p.seenAt === null);
}

export type PillaNuova = { tipo: "da-confermare" | "gia-confermata"; parola: string };

export function pillaNuova(p: Pick<PrenotazioneRiquadro, "status">): PillaNuova {
  return p.status === "PENDING"
    ? { tipo: "da-confermare", parola: "Da confermare" }
    : { tipo: "gia-confermata", parola: "Già confermata" };
}

/* -------------------------------------------------------------------------- */
/*  Le parole del tempo                                                       */
/* -------------------------------------------------------------------------- */

/** Da qui in poi è cena: «Stasera alle», e il gruppo Cena nella scheda Oggi. */
export const INIZIO_CENA_MIN = 17 * 60;

/** Il minuto del giorno, nel fuso del locale. */
export function minutoDelGiorno(istante: Date, fuso: string = DEFAULT_VENUE_TIMEZONE): number {
  const [h, m] = oraInVenue(istante, fuso).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type Fascia = "pranzo" | "cena";

export function fascia(istante: Date, fuso: string = DEFAULT_VENUE_TIMEZONE): Fascia {
  return minutoDelGiorno(istante, fuso) < INIZIO_CENA_MIN ? "pranzo" : "cena";
}

function maiuscola(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Quando arriva l'ospite, come lo direbbe chi risponde al telefono: «Stasera
 * alle», «Oggi alle» (a pranzo), «Domani alle», «Sabato 10 alle». Il mese si
 * aggiunge solo se non è questo.
 *
 * L'orario è separato perché nel riquadro va in grassetto.
 */
export function quandoArriva(
  startsAt: Date,
  adesso: Date,
  fuso: string = DEFAULT_VENUE_TIMEZONE,
): { prefisso: string; ora: string } {
  const ora = oraInVenue(startsAt, fuso);
  const giorno = dateKeyInVenue(startsAt, fuso);
  const oggi = dateKeyInVenue(adesso, fuso);

  if (giorno === oggi) {
    return { prefisso: fascia(startsAt, fuso) === "cena" ? "Stasera alle" : "Oggi alle", ora };
  }
  if (giorno === shiftDateKey(oggi, 1)) return { prefisso: "Domani alle", ora };

  const stessoMese = giorno.slice(0, 7) === oggi.slice(0, 7);
  const data = new Intl.DateTimeFormat("it-IT", {
    timeZone: fuso,
    weekday: "long",
    day: "numeric",
    ...(stessoMese ? {} : { month: "long" }),
  }).format(startsAt);
  return { prefisso: `${maiuscola(data)} alle`, ora };
}

/** «ora», «11 min fa», «2 h fa», «3 g fa». */
export function daQuanto(createdAt: Date, adesso: Date): string {
  const minuti = Math.floor((adesso.getTime() - createdAt.getTime()) / 60_000);
  if (minuti < 1) return "ora";
  if (minuti < 60) return `${minuti} min fa`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore} h fa`;
  return `${Math.floor(ore / 24)} g fa`;
}

/** «Martedì 6 ottobre». */
export function dataEstesa(adesso: Date, fuso: string = DEFAULT_VENUE_TIMEZONE): string {
  return maiuscola(
    new Intl.DateTimeFormat("it-IT", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" }).format(
      adesso,
    ),
  );
}

export function persone(n: number): string {
  return `${n} ${n === 1 ? "persona" : "persone"}`;
}

export function contaPrenotazioni(n: number): string {
  return `${n} ${n === 1 ? "prenotazione" : "prenotazioni"}`;
}

/* -------------------------------------------------------------------------- */
/*  La scheda Oggi                                                            */
/* -------------------------------------------------------------------------- */

export type TonoStato = "attesa" | "confermata" | "arrivati" | "chiusa" | "assente";

/** La parola dello stato: il colore la accompagna, non la sostituisce. */
export function statoRiga(status: BookingStatus): { parola: string; tono: TonoStato } {
  switch (status) {
    case "PENDING":
      return { parola: "Da confermare", tono: "attesa" };
    case "CONFIRMED":
      return { parola: "Confermata", tono: "confermata" };
    case "ARRIVED":
      return { parola: "Arrivati", tono: "arrivati" };
    case "SEATED":
      return { parola: "Seduti", tono: "arrivati" };
    case "COMPLETED":
      return { parola: "Completata", tono: "chiusa" };
    case "NO_SHOW":
      return { parola: "Non arrivati", tono: "assente" };
    case "CANCELLED":
      return { parola: "Annullata", tono: "assente" };
  }
}

export type GruppoOggi = {
  fascia: Fascia;
  etichetta: "Pranzo" | "Cena";
  coperti: number;
  righe: PrenotazioneRiquadro[];
};

/**
 * Pranzo e Cena, in quest'ordine, ciascuno in ordine d'orario. Un gruppo
 * senza prenotazioni non c'è: un pannello vuoto con scritto «Pranzo» a un
 * locale che fa solo cene è rumore.
 */
export function gruppiOggi(
  prenotazioni: PrenotazioneRiquadro[],
  fuso: string = DEFAULT_VENUE_TIMEZONE,
): GruppoOggi[] {
  const ordinate = [...prenotazioni].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const gruppi: GruppoOggi[] = [];
  for (const [f, etichetta] of [
    ["pranzo", "Pranzo"],
    ["cena", "Cena"],
  ] as const) {
    const righe = ordinate.filter((p) => fascia(new Date(p.startsAt), fuso) === f);
    if (righe.length === 0) continue;
    // Le assenze e le annullate non occupano posti: non sono coperti.
    const coperti = righe
      .filter((p) => p.status !== "NO_SHOW" && p.status !== "CANCELLED")
      .reduce((n, p) => n + p.partySize, 0);
    gruppi.push({ fascia: f, etichetta, coperti, righe });
  }
  return gruppi;
}

/* -------------------------------------------------------------------------- */
/*  Le azioni, e il tempo per annullarle                                      */
/* -------------------------------------------------------------------------- */

export type AzioneNuova = "conferma" | "rifiuta" | "vista";

/**
 * Per quanto un'azione resta annullabile prima di partire davvero.
 *
 * L'azione **parte dopo**, non si annulla dopo: confermare una prenotazione
 * presa dal risponditore manda un WhatsApp all'ospite, rifiutarla avvisa la
 * sala che c'è un tavolo libero e, con una caparra, che va restituita. Nessuna
 * di queste cose si ritira tornando allo stato di prima.
 */
export const ATTESA_ANNULLA_MS = 5_000;

export type AzioneInSospeso = {
  id: string;
  nome: string;
  azione: AzioneNuova;
  /** Istante (ms) in cui parte se nessuno annulla. */
  parteAlle: number;
};

/**
 * Una nuova azione prende il posto di quella in sospeso, e quella **parte
 * subito**: c'è un solo avviso con «Annulla» per volta, e un'azione rimasta
 * senza il suo avviso non si potrebbe più annullare — né dovrebbe aspettare.
 */
export function avviaAzione(
  inSospeso: AzioneInSospeso | null,
  nuova: Omit<AzioneInSospeso, "parteAlle">,
  adesso: number,
): { inSospeso: AzioneInSospeso; daInviare: AzioneInSospeso | null } {
  return {
    inSospeso: { ...nuova, parteAlle: adesso + ATTESA_ANNULLA_MS },
    daInviare: inSospeso,
  };
}

/** «Annulla»: l'azione non parte, e la prenotazione torna dov'era. */
export function annullaAzione(
  inSospeso: AzioneInSospeso | null,
  id: string,
): { inSospeso: AzioneInSospeso | null; ripristina: string | null } {
  if (!inSospeso || inSospeso.id !== id) return { inSospeso, ripristina: null };
  return { inSospeso: null, ripristina: inSospeso.id };
}

/** Allo scadere del tempo l'azione esce dalla coda e va inviata. */
export function azioneScaduta(
  inSospeso: AzioneInSospeso | null,
  adesso: number,
): { inSospeso: AzioneInSospeso | null; daInviare: AzioneInSospeso | null } {
  if (!inSospeso || adesso < inSospeso.parteAlle) return { inSospeso, daInviare: null };
  return { inSospeso: null, daInviare: inSospeso };
}

/** Il testo dell'avviso: «Francesca Rinaldi confermata». */
export function testoAvviso(a: Pick<AzioneInSospeso, "nome" | "azione">): string {
  switch (a.azione) {
    case "conferma":
      return `${a.nome} confermata`;
    case "rifiuta":
      return `${a.nome} rifiutata`;
    case "vista":
      return `${a.nome} segnata come vista`;
  }
}

/** L'etichetta per chi usa un lettore di schermo, con il nome dell'ospite. */
export function etichettaAzione(azione: AzioneNuova, nome: string): string {
  switch (azione) {
    case "conferma":
      return `Conferma la prenotazione di ${nome}`;
    case "rifiuta":
      return `Rifiuta la prenotazione di ${nome}`;
    case "vista":
      return `Segna come vista la prenotazione di ${nome}`;
  }
}
