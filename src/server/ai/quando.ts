import { zonedCalendarDate, zonedTimeToInstant } from "@/server/availability";

/**
 * «domani alle 20:30» → un istante.
 *
 * ## Perché un elenco corto di forme, e non un interprete generoso
 *
 * Perché questo valore finisce in una **prenotazione vera**, e la terza regola
 * degli strumenti di scrittura dice: se un dato non c'è, non si inventa. Un
 * interprete che indovina «per il weekend» scriverebbe un sabato che nessuno
 * ha detto, e chi lo legge non ha modo di sapere che è stato indovinato.
 *
 * Quindi: si riconoscono le forme in cui una persona dice un momento preciso —
 * oggi, stasera, domani, dopodomani, un giorno della settimana, una data — e
 * **sempre con un'ora**. Tutto il resto restituisce `null`, e chi chiama
 * chiede di ripeterlo. Meglio una domanda in più che un tavolo il giorno
 * sbagliato.
 *
 * ## L'ora è quella del locale
 *
 * «alle 20:30» significa le 20:30 **in sala**, non nel fuso del server né in
 * quello del browser di chi scrive. Per questo si passa da
 * `zonedTimeToInstant`, che è la funzione con cui il prodotto costruisce ogni
 * altro istante di prenotazione — compresi i giorni in cui l'ora cambia.
 */

const GIORNI = [
  ["domenica", "dom"],
  ["lunedi", "lun"],
  ["martedi", "mar"],
  ["mercoledi", "mer"],
  ["giovedi", "gio"],
  ["venerdi", "ven"],
  ["sabato", "sab"],
] as const;

export type QuandoLetto = {
  istante: Date;
  /** Come si è capito, per poterlo ripetere a chi ha parlato. */
  come: string;
};

/**
 * Legge un momento da una frase. `null` quando non è sicuro.
 *
 * Il testo arriva già normalizzato (minuscolo, senza accenti) dal router degli
 * intenti.
 */
export function interpretaQuando(
  testo: string,
  fuso: string,
  adesso: Date = new Date(),
): QuandoLetto | null {
  const ora = leggiOra(testo);
  /* Senza un'ora non si prenota niente. «domani» da solo non è un momento: è
     un giorno, e un giorno con l'ora messa da noi è un'invenzione. */
  if (ora == null) return null;

  const oggi = zonedCalendarDate(adesso, fuso);
  const giornoOggi = numeroGiornoSettimana(adesso, fuso);

  let salta: number | null = null;
  let comeGiorno = "";

  if (/\bdopodomani\b/.test(testo)) {
    salta = 2;
    comeGiorno = "dopodomani";
  } else if (/\bdomani\b/.test(testo)) {
    salta = 1;
    comeGiorno = "domani";
  } else if (
    /\b(oggi|stasera|stanotte|stamattina|adesso|subito)\b/.test(testo)
  ) {
    salta = 0;
    comeGiorno = /stasera/.test(testo) ? "stasera" : "oggi";
  } else {
    for (const [nome, corto] of GIORNI) {
      if (new RegExp(`\\b(${nome}|${corto})\\b`).test(testo)) {
        const voluto = GIORNI.findIndex((g) => g[0] === nome);
        /* «sabato» detto di sabato vuol dire **il sabato prossimo**, non
           adesso: chi intende oggi dice «oggi» o «stasera». Sette giorni e
           non zero. */
        const diff = (voluto - giornoOggi + 7) % 7;
        salta = diff === 0 ? 7 : diff;
        comeGiorno = nome;
        break;
      }
    }
  }

  /* Una data scritta: «24/12», «24 dicembre». Solo giorno e mese, e l'anno lo
     mette il calendario — una data già passata si intende l'anno prossimo, che
     è l'unica lettura sensata per una prenotazione.
   
     Si guarda **solo se non c'è già una parola di giorno**: in «alle 8 di sera
     domani» la parola «domani» è la cosa più sicura della frase, e cercare
     anche una data lì dentro ha prodotto l'8 dicembre. Quando una persona dice
     «domani», domani è. */
  const dataEsplicita = salta == null ? leggiData(testo, oggi) : null;
  if (dataEsplicita) {
    const istante = zonedTimeToInstant(dataEsplicita, ora.minuti, fuso);
    return {
      istante,
      come: `${dataEsplicita.day}/${dataEsplicita.month} alle ${ora.testo}`,
    };
  }

  if (salta == null) return null;

  const base = new Date(Date.UTC(oggi.year, oggi.month - 1, oggi.day));
  base.setUTCDate(base.getUTCDate() + salta);
  const istante = zonedTimeToInstant(
    {
      year: base.getUTCFullYear(),
      month: base.getUTCMonth() + 1,
      day: base.getUTCDate(),
    },
    ora.minuti,
    fuso,
  );

  return { istante, come: `${comeGiorno} alle ${ora.testo}` };
}

/**
 * «alle 20:30», «alle 20», «20.30», «alle 8 di sera».
 *
 * Due forme, in quest'ordine, e **nessuna terza**: dopo «alle», oppure un
 * orario scritto con i minuti. Un numero nudo non è un'ora.
 *
 * La prima versione prendeva il primo numero della frase: su «prenota 2
 * persone il 24 dicembre alle 21» leggeva il **2** e scriveva le 14:00. Un
 * numero in una frase può essere quante persone, un giorno, un numero civico;
 * l'unica cosa che lo rende un'ora è una parola che lo dice.
 */
function leggiOra(testo: string): { minuti: number; testo: string } | null {
  const m =
    testo.match(/\balle\s*(\d{1,2})(?:[:.](\d{2}))?\b/) ??
    testo.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (!m) return null;
  let ore = Number(m[1]);
  const minuti = m[2] ? Number(m[2]) : 0;
  if (Number.isNaN(ore) || ore > 24 || minuti > 59) return null;

  /* «alle 8 di sera» sono le venti. Senza questo, una prenotazione detta così
     finirebbe alle otto del mattino — un orario in cui il locale è chiuso, e
     un errore che chi ha parlato non vedrebbe mai. */
  if (/\b(di sera|del pomeriggio|pm)\b/.test(testo) && ore <= 11) ore += 12;
  /* Un locale non prende prenotazioni all'una di notte con «alle 1»: sotto le
     sette, e senza che nessuno abbia detto «di mattina», si intende il
     pomeriggio o la sera. È il verso in cui sbagliano tutti i telefoni. */
  if (ore >= 1 && ore <= 6 && !/\b(di mattina|del mattino|am)\b/.test(testo)) {
    ore += 12;
  }
  if (ore >= 24) return null;

  return {
    minuti: ore * 60 + minuti,
    testo: `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`,
  };
}

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

function leggiData(
  testo: string,
  oggi: { year: number; month: number; day: number },
): { year: number; month: number; day: number } | null {
  let giorno: number | null = null;
  let mese: number | null = null;

  const numerica = testo.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})\b/);
  if (numerica) {
    giorno = Number(numerica[1]);
    mese = Number(numerica[2]);
  } else {
    /* **Tutte** le coppie «numero parola», non la prima: in «prenota 2 persone
       il 24 dicembre» la prima è «2 persone», e fermarsi là faceva scartare la
       data buona che veniva dopo. Si tiene la prima coppia la cui parola è
       davvero un mese. */
    for (const coppia of testo.matchAll(/\b(\d{1,2})\s+([a-z]+)\b/g)) {
      const parola = coppia[2]!;
      /* Almeno tre lettere, e il mese deve cominciare **con la parola
         intera**. Con due lettere «alle 8 di sera» diventava l'8 dicembre:
         «di» è il principio di «dicembre», ed è anche una preposizione. */
      if (parola.length < 3) continue;
      const i = MESI.findIndex((m) => m.startsWith(parola));
      if (i >= 0) {
        giorno = Number(coppia[1]);
        mese = i + 1;
        break;
      }
    }
  }

  if (giorno == null || mese == null) return null;
  if (giorno < 1 || giorno > 31 || mese < 1 || mese > 12) return null;

  /* Una data già passata si intende l'anno prossimo: «il 3 gennaio» detto a
     dicembre non è undici mesi indietro. */
  const anno =
    mese < oggi.month || (mese === oggi.month && giorno < oggi.day)
      ? oggi.year + 1
      : oggi.year;
  return { year: anno, month: mese, day: giorno };
}

/** 0 = domenica, come `Date.getDay()`, ma nel fuso del locale. */
function numeroGiornoSettimana(istante: Date, fuso: string): number {
  const nome = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
  }).format(istante);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome);
}
