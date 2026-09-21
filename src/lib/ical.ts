/**
 * Il testo di un calendario, nel formato che leggono tutti.
 *
 * ## Perché scritto a mano
 *
 * Perché di iCalendar serve una fetta sottile: un elenco di appuntamenti in
 * sola lettura, senza inviti, senza allegati, senza ricorrenze. Una libreria
 * completa porterebbe mille casi che non useremo, e ognuno è una cosa che può
 * rompersi — mentre le tre regole che contano stanno qui sotto e si provano.
 *
 * ## Le tre regole che i calendari veri fanno rispettare
 *
 * **1. Le righe si piegano a 75 caratteri.** Non è estetica: una riga più
 * lunga viene troncata da alcuni lettori, e una nota di prenotazione lunga fa
 * sparire l'appuntamento invece della nota. La riga continua con **uno spazio**
 * in testa.
 *
 * **2. Virgole, punti e virgola, barre rovesciate e capi a riga si
 * proteggono.** Una prenotazione «Rossi, 4 persone» senza protezione diventa
 * due campi, e il nome si perde.
 *
 * **3. Gli istanti si scrivono in tempo universale**, con lo `Z` finale. Così
 * non serve dichiarare nessun fuso: ogni calendario li mostra nell'ora di chi
 * guarda, che per il ristoratore è la sua. Scriverli in ora locale senza
 * dichiarare il fuso è il modo classico di far comparire le cene alle due del
 * pomeriggio.
 */

/** Un appuntamento, già pronto: questo file non sa niente di prenotazioni. */
export type EventoCalendario = {
  /** Identificativo stabile: lo stesso appuntamento non deve duplicarsi. */
  uid: string;
  inizio: Date;
  fine: Date;
  titolo: string;
  /** Righe di dettaglio; vuote e assenti si scartano. */
  dettagli?: (string | null | undefined)[];
  luogo?: string | null;
  /** Quando la riga è stata scritta l'ultima volta: i lettori la usano per
   *  capire se un appuntamento è cambiato. */
  aggiornato?: Date;
};

/** `20260921T183000Z` — il formato degli istanti in iCalendar. */
export function istanteIcal(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

/** Protegge i caratteri che nel formato hanno un significato. */
export function proteggiTesto(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Piega una riga a 75 caratteri, come vuole il formato.
 *
 * Si conta in **byte** e non in caratteri: il limite dello standard è in
 * ottetti, e una riga di nomi accentati sta sotto i 75 caratteri e sopra i 75
 * byte. Piegare nel posto sbagliato spezza una lettera a metà, e allora il
 * nome arriva con un carattere strano — o l'appuntamento non arriva.
 */
export function piegaRiga(riga: string): string[] {
  const byte = Buffer.from(riga, "utf8");
  if (byte.length <= 75) return [riga];

  const pezzi: string[] = [];
  let corrente = Buffer.alloc(0);
  /* Si scorre per **caratteri interi** (`...riga` itera i punti di codice) e
     si chiude la riga prima di sforare: così una lettera non viene mai
     divisa. Il primo pezzo può usare 75 byte, i successivi 74 perché il primo
     byte lo occupa lo spazio di continuazione. */
  for (const carattere of riga) {
    const c = Buffer.from(carattere, "utf8");
    const tetto = pezzi.length === 0 ? 75 : 74;
    if (corrente.length + c.length > tetto) {
      pezzi.push(corrente.toString("utf8"));
      corrente = Buffer.alloc(0);
    }
    corrente = Buffer.concat([corrente, c]);
  }
  if (corrente.length > 0) pezzi.push(corrente.toString("utf8"));

  return pezzi.map((p, i) => (i === 0 ? p : ` ${p}`));
}

/**
 * Il calendario completo.
 *
 * `nome` compare come nome del calendario su cui ci si abbona: va scritto col
 * nome del locale, altrimenti nel telefono del ristoratore appare un
 * «Calendario» senza padre fra gli altri dieci.
 */
export function calendarioIcal(opz: {
  nome: string;
  eventi: EventoCalendario[];
  /** L'istante in cui si serve il file: sta nella riga di ogni evento. */
  adesso?: Date;
}): string {
  const adesso = opz.adesso ?? new Date();
  const righe: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tavolo//Prenotazioni//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${proteggiTesto(opz.nome)}`,
    /* Ogni quanto il calendario di chi legge torna a chiedere. Un
       suggerimento, non un obbligo: i lettori lo rispettano quasi tutti, e
       senza di esso alcuni aggiornano una volta al giorno — troppo poco per
       una sala che cambia durante il servizio. */
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ];

  for (const e of opz.eventi) {
    const dettagli = (e.dettagli ?? []).filter((d): d is string => !!d && d.trim().length > 0);
    righe.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${istanteIcal(e.aggiornato ?? adesso)}`,
      `DTSTART:${istanteIcal(e.inizio)}`,
      `DTEND:${istanteIcal(e.fine)}`,
      `SUMMARY:${proteggiTesto(e.titolo)}`,
      ...(dettagli.length > 0 ? [`DESCRIPTION:${proteggiTesto(dettagli.join("\n"))}`] : []),
      ...(e.luogo ? [`LOCATION:${proteggiTesto(e.luogo)}`] : []),
      "END:VEVENT",
    );
  }

  righe.push("END:VCALENDAR");

  /* I capi a riga sono `\r\n`: lo standard lo pretende, e alcuni lettori
     (Outlook fra questi) rifiutano il file con i soli `\n`. */
  return righe.flatMap(piegaRiga).join("\r\n") + "\r\n";
}
