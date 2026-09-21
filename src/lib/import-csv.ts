/**
 * Leggere il file che arriva da un altro gestionale.
 *
 * ## Perché questo file esiste
 *
 * Perché **Quandoo spegne tutto il 31 dicembre 2026** e lascia circa seimila
 * ristoranti italiani senza sistema, con i dati da esportare a mano. Chi
 * cambia gestionale non porta via le prenotazioni di domani: porta via
 * **l'elenco dei clienti**, che è l'unica cosa che non si ricompra. Un
 * ristoratore che deve reinserire duemila nomi a mano non cambia gestionale —
 * resta dove sta, o riparte da zero e perde dieci anni di storia.
 *
 * Quindi l'importazione non è una funzione di comodo: è la porta d'ingresso.
 *
 * ## Perché la lettura sta in un file puro
 *
 * Perché è la parte che sbaglia, ed è l'unica che si può provare davvero. Un
 * separatore indovinato male, una data letta all'americana, una colonna che
 * cambia nome fra due esportazioni: tutti difetti che **non danno errore** —
 * danno duemila prenotazioni al giorno sbagliato, o duemila righe scartate in
 * silenzio. Qui dentro non c'è database, non c'è fuso orario, non c'è rete:
 * entra testo, esce un elenco di righe lette e un elenco di scarti **con il
 * motivo**.
 *
 * Il fuso lo mette chi scrive nel database: «20:30» in un file è un orario
 * scritto da una persona che pensa all'ora del suo locale, e diventa un
 * istante solo quando si sa di quale locale si parla.
 *
 * ## Cosa NON legge, di proposito
 *
 * **Il consenso al marketing.** Alcuni gestionali lo esportano come colonna, e
 * copiarlo qui dentro sarebbe la cosa più facile e più sbagliata del mondo: un
 * consenso è una prova che una persona ha dato a *qualcun altro*, e non si
 * eredita con un file CSV. Gli ospiti importati si possono avvisare della
 * **loro** prenotazione; per scrivergli una campagna il consenso lo devono
 * dare qui. Vedi `docs/GDPR.md` se un giorno esisterà.
 */

/** Il tetto di righe per file. Oltre, si chiede di dividerlo. */
export const RIGHE_MASSIME = 5_000;

/**
 * I nomi che una colonna può avere.
 *
 * Non è una lista di cortesia: è la differenza fra un file che si importa e un
 * file che va riscritto a mano. Ci sono dentro le parole italiane e inglesi,
 * quelle di Quandoo e TheFork (`pax`, `guests`, `covers`), e le varianti che
 * Excel produce esportando (`Nome cliente`, `Telefono cellulare`).
 *
 * Il confronto è **senza accenti, senza spazi e senza maiuscole**: un file
 * esportato da un foglio di calcolo italiano ha intestazioni come «Data
 * prenotazione » con lo spazio in coda, e scartarlo per uno spazio sarebbe
 * assurdo.
 */
const ALIAS: Record<string, string[]> = {
  nome: [
    "nome",
    "name",
    "firstname",
    "first name",
    "nomecliente",
    "nome cliente",
    "cliente",
    "guest",
    "guestname",
    "guest name",
    "customer",
    "customername",
  ],
  cognome: ["cognome", "lastname", "last name", "surname", "famiglia"],
  telefono: [
    "telefono",
    "phone",
    "mobile",
    "cellulare",
    "telefonocellulare",
    "telefono cellulare",
    "phonenumber",
    "phone number",
    "numero",
    "tel",
  ],
  email: ["email", "mail", "indirizzoemail", "e-mail", "posta elettronica"],
  giorno: [
    "giorno",
    "data",
    "date",
    "datapren",
    "datapenotazione",
    "data prenotazione",
    "bookingdate",
    "booking date",
    "giornoprenotazione",
  ],
  ora: [
    "ora",
    "orario",
    "time",
    "oraprenotazione",
    "ora prenotazione",
    "bookingtime",
    "booking time",
    "hour",
  ],
  quando: [
    "quando",
    "datetime",
    "data e ora",
    "dataora",
    "datahora",
    "timestamp",
    "arrivo",
    "arrival",
  ],
  persone: [
    "persone",
    "coperti",
    "pax",
    "guests",
    "covers",
    "partysize",
    "party size",
    "numeropersone",
    "numero persone",
    "ospiti",
    "seats",
  ],
  note: [
    "note",
    "notes",
    "comment",
    "comments",
    "commento",
    "richieste",
    "specialrequests",
    "special requests",
    "annotazioni",
  ],
  stato: ["stato", "status", "esito"],
};

/** Il testo di un'intestazione ridotto alla sua sostanza. */
export function chiaveIntestazione(testo: string): string {
  return (
    testo
      .normalize("NFD")
      /* Via i segni diacritici: «Città» e «Citta» sono la stessa colonna, e un
       file esportato da Windows può avere l'accento composto in due modi. */
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[_\-.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export type Campo = keyof typeof ALIAS;

export type MappaColonne = {
  /** Campo → indice della colonna nel file. */
  indici: Partial<Record<Campo, number>>;
  /** Le intestazioni che non abbiamo riconosciuto: si dicono, non si nascondono. */
  ignorate: string[];
};

/**
 * Quale colonna è quale.
 *
 * Le colonne che non si riconoscono **si elencano**: un'importazione che
 * scarta in silenzio una colonna «Allergie» fa perdere un dato che il locale
 * aveva, e non lo scopre nessuno. Dirlo permette di chiedere: «questa la
 * mettiamo nelle note?».
 */
export function mappaColonne(intestazioni: string[]): MappaColonne {
  const indici: Partial<Record<Campo, number>> = {};
  const ignorate: string[] = [];

  intestazioni.forEach((testo, i) => {
    const chiave = chiaveIntestazione(testo);
    if (!chiave) return;
    const campo = (Object.keys(ALIAS) as Campo[]).find((c) =>
      ALIAS[c]!.some((alias) => chiaveIntestazione(alias) === chiave),
    );
    /* La prima colonna vince: se un file ha due colonne «telefono», la seconda
       è quasi sempre un residuo vuoto dell'esportazione. */
    if (campo && indici[campo] === undefined) indici[campo] = i;
    else if (!campo) ignorate.push(testo.trim());
  });

  return { indici, ignorate };
}

/* -------------------------------------------------------------------------- */
/*  Il CSV                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Quale separatore usa questo file.
 *
 * Non è una finezza: **Excel in italiano esporta con il punto e virgola**, e
 * un lettore che assume la virgola legge tutto il file come una colonna sola.
 * Il sintomo è «nessuna colonna riconosciuta» su un file perfetto, e chi lo
 * riceve pensa che il nostro prodotto non funzioni.
 *
 * Si guarda **la prima riga**: il separatore giusto è quello che compare più
 * volte fuori dalle virgolette.
 */
export function separatore(testo: string): string {
  const prima = testo.split(/\r?\n/, 1)[0] ?? "";
  const candidati = [";", ",", "\t", "|"];
  let scelto = ",";
  let massimo = 0;
  for (const c of candidati) {
    let quante = 0;
    let dentro = false;
    for (const ch of prima) {
      if (ch === '"') dentro = !dentro;
      else if (ch === c && !dentro) quante += 1;
    }
    if (quante > massimo) {
      massimo = quante;
      scelto = c;
    }
  }
  return scelto;
}

/**
 * Da testo a righe di celle.
 *
 * Scritto a mano e non con una libreria per una ragione sola: le librerie CSV
 * serie pesano, e quello che serve qui è poco e preciso — virgolette, virgolette
 * doppie dentro le virgolette, ritorni a capo dentro una cella (una nota su due
 * righe), il BOM che Excel mette in testa al file e che rende irriconoscibile
 * la prima intestazione.
 *
 * Quel BOM è il difetto più stupido e più frequente di tutti: senza toglierlo,
 * la colonna «Nome» del file si chiama «﻿Nome» e non combacia con niente.
 */
export function righeCsv(testo: string, sep = separatore(testo)): string[][] {
  const pulito = testo.replace(/^﻿/, "");
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = "";
  let dentroVirgolette = false;

  for (let i = 0; i < pulito.length; i++) {
    const ch = pulito[i]!;

    if (dentroVirgolette) {
      if (ch === '"') {
        if (pulito[i + 1] === '"') {
          cella += '"';
          i += 1;
        } else dentroVirgolette = false;
      } else cella += ch;
      continue;
    }

    if (ch === '"') {
      dentroVirgolette = true;
    } else if (ch === sep) {
      riga.push(cella);
      cella = "";
    } else if (ch === "\n") {
      riga.push(cella);
      righe.push(riga);
      riga = [];
      cella = "";
    } else if (ch === "\r") {
      /* Ignorato: il fine riga vero è il `\n` che segue. Un file salvato su
         Mac classico (solo `\r`) non lo produce più nessuno dal 2001. */
    } else {
      cella += ch;
    }
  }

  if (cella !== "" || riga.length > 0) {
    riga.push(cella);
    righe.push(riga);
  }

  /* Le righe completamente vuote si buttano qui: un'esportazione finisce
     spesso con una riga di soli separatori, e contarla fra gli scarti
     spaventerebbe per niente. */
  return righe.filter((r) => r.some((c) => c.trim() !== ""));
}

/* -------------------------------------------------------------------------- */
/*  Giorno e ora                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Una data scritta da una persona → `AAAA-MM-GG`.
 *
 * Accetta l'ordine italiano (`25/09/2026`) e quello ISO (`2026-09-25`), con
 * qualunque separatore. **Rifiuta** l'ordine americano quando è ambiguo, e
 * questa è la decisione più importante del file: `03/04/2026` è il 3 aprile per
 * un italiano e il 4 marzo per un americano, e nessuno dei due può saperlo
 * guardando il file. Indovinare vorrebbe dire duemila prenotazioni spostate di
 * un mese senza che nessuno se ne accorga — quindi con il giorno **sotto il
 * tredici** si assume l'ordine italiano (è un file italiano, di un gestionale
 * italiano), e sopra il tredici l'ordine si deduce: `25/09` non può che essere
 * giorno-mese.
 */
export function leggiGiorno(valore: string): string | null {
  const t = valore.trim();
  if (!t) return null;

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (iso) return componiGiorno(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const eu = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t);
  if (eu) {
    const primo = Number(eu[1]);
    const secondo = Number(eu[2]);
    const anno = Number(eu[3]!.length === 2 ? `20${eu[3]}` : eu[3]);

    /* Quando **uno dei due** non può essere un mese, l'ordine non è più una
       supposizione: `25/09` è giorno-mese, `09/25` è mese-giorno. Si accetta,
       invece di scartare una riga che si capisce benissimo. */
    if (primo > 12 && secondo <= 12) return componiGiorno(anno, secondo, primo);
    if (secondo > 12 && primo <= 12) return componiGiorno(anno, primo, secondo);

    /* Entrambi sotto il tredici: ambiguo, e si tiene l'ordine italiano. È un
       file italiano di un gestionale italiano, e indovinare al contrario
       sposterebbe la prenotazione di un mese senza dirlo a nessuno. */
    return componiGiorno(anno, secondo, primo);
  }

  return null;
}

function componiGiorno(
  anno: number,
  mese: number,
  giorno: number,
): string | null {
  if (!Number.isInteger(anno) || anno < 1990 || anno > 2100) return null;
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null;
  /* Il 31 febbraio non esiste, e `new Date` lo trasformerebbe nel 3 marzo in
     silenzio: si controlla che il giorno sopravviva al giro. */
  const prova = new Date(Date.UTC(anno, mese - 1, giorno));
  if (prova.getUTCMonth() !== mese - 1 || prova.getUTCDate() !== giorno)
    return null;
  const due = (n: number) => String(n).padStart(2, "0");
  return `${anno}-${due(mese)}-${due(giorno)}`;
}

/** Un orario scritto da una persona → `HH:MM`. */
export function leggiOra(valore: string): string | null {
  const t = valore.trim();
  if (!t) return null;
  const m = /^(\d{1,2})[:.,h]?(\d{2})?$/.exec(t.replace(/\s/g, ""));
  if (!m) return null;
  const ore = Number(m[1]);
  const minuti = Number(m[2] ?? "0");
  if (ore > 23 || minuti > 59) return null;
  return `${String(ore).padStart(2, "0")}:${String(minuti).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  Le righe                                                                  */
/* -------------------------------------------------------------------------- */

export type RigaLetta = {
  /** Il numero di riga nel file, intestazione compresa: serve per dire dove. */
  riga: number;
  nome: string;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  /** `AAAA-MM-GG` e `HH:MM` nell'ora **del locale**: il fuso lo mette chi scrive. */
  giorno: string | null;
  ora: string | null;
  persone: number | null;
  note: string | null;
};

export type Scarto = {
  riga: number;
  perche: string;
};

export type EsitoLettura = {
  colonne: MappaColonne;
  righe: RigaLetta[];
  scarti: Scarto[];
  /** Quante righe aveva il file, senza l'intestazione. */
  totali: number;
  /** Vero quando il file è stato tagliato perché troppo lungo. */
  tagliato: boolean;
};

/**
 * Da testo a righe lette, con gli scarti motivati.
 *
 * Una riga scartata non è un errore dell'importazione: è un dato che quel file
 * non ha. Dirlo per riga — «riga 48: manca il nome» — è la differenza fra un
 * ristoratore che sistema tre celle e un ristoratore che rinuncia.
 */
export function leggiFile(testo: string): EsitoLettura {
  const sep = separatore(testo);
  const righeGrezze = righeCsv(testo, sep);
  if (righeGrezze.length === 0) {
    return {
      colonne: { indici: {}, ignorate: [] },
      righe: [],
      scarti: [],
      totali: 0,
      tagliato: false,
    };
  }

  const colonne = mappaColonne(righeGrezze[0]!);
  const corpo = righeGrezze.slice(1);
  const tagliato = corpo.length > RIGHE_MASSIME;
  const daLeggere = tagliato ? corpo.slice(0, RIGHE_MASSIME) : corpo;

  const righe: RigaLetta[] = [];
  const scarti: Scarto[] = [];

  daLeggere.forEach((celle, i) => {
    /* +2: l'intestazione è la riga 1, e gli indici partono da zero. È il
       numero che il ristoratore vede aprendo il file col foglio di calcolo. */
    const numero = i + 2;
    const prendi = (campo: Campo): string => {
      const idx = colonne.indici[campo];
      return idx === undefined ? "" : (celle[idx] ?? "").trim();
    };

    const nome = prendi("nome");
    const telefono = prendi("telefono");
    const email = prendi("email");

    if (!nome && !telefono && !email) {
      scarti.push({ riga: numero, perche: "nessun nome, telefono o email" });
      return;
    }

    /* Un'unica colonna «data e ora» è il caso di metà dei gestionali. */
    const quando = prendi("quando");
    const [quandoGiorno, quandoOra] = quando
      ? spezzaQuando(quando)
      : [null, null];

    const giorno = leggiGiorno(prendi("giorno")) ?? quandoGiorno;
    const ora = leggiOra(prendi("ora")) ?? quandoOra;

    if (prendi("giorno") && !giorno) {
      scarti.push({
        riga: numero,
        perche: `data non riconosciuta: «${prendi("giorno")}»`,
      });
      return;
    }

    const personeGrezze = prendi("persone").replace(/[^\d]/g, "");
    const persone = personeGrezze ? Number(personeGrezze) : null;

    righe.push({
      riga: numero,
      /* Senza nome si usa il contatto come nome: è meglio di «Sconosciuto», e
         chi importa la rubrica di un gestionale che teneva solo i numeri non
         deve perdere le righe. */
      nome: nome || telefono || email,
      cognome: prendi("cognome") || null,
      telefono: telefono || null,
      email: email || null,
      giorno,
      ora,
      persone: persone && persone > 0 && persone < 500 ? persone : null,
      note: prendi("note") || null,
    });
  });

  return { colonne, righe, scarti, totali: corpo.length, tagliato };
}

/** «2026-09-25 20:30» → giorno e ora separati. */
function spezzaQuando(valore: string): [string | null, string | null] {
  const pezzi = valore.trim().split(/[\sT]+/);
  const giorno = leggiGiorno(pezzi[0] ?? "");
  const ora = pezzi.length > 1 ? leggiOra(pezzi[1]!) : null;
  return [giorno, ora];
}
