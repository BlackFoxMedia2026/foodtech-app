/**
 * Quali migrazioni può applicare un'anteprima, e quali no.
 *
 * Su Vercel `DATABASE_URL` è la stessa per produzione e anteprime, e il build
 * esegue `prisma migrate deploy`. Conseguenza scoperta il 7 settembre 2026:
 * **l'anteprima di una richiesta di modifica migrava il database di
 * produzione**, prima che nessuno avesse fuso niente. È andata bene perché
 * tutte le migrazioni erano additive; una che cancella una colonna avrebbe
 * cancellato dati veri partendo da un ramo mai approvato.
 *
 * La soluzione giusta sarebbe un database separato per le anteprime. Finché
 * non c'è, qui si traccia il confine dove sta il pericolo vero: **una
 * migrazione additiva può passare** (aggiunge, e il codice vecchio la ignora),
 * **una distruttiva no** — quella la applica solo una pubblicazione vera.
 *
 * Non è un controllo di sicurezza contro un avversario: è un freno contro la
 * distrazione, che è il modo in cui questi danni succedono davvero.
 */

/**
 * Le forme di SQL che portano via dati.
 *
 * `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` e `DELETE` sono ovvie. `ALTER
 * COLUMN ... TYPE` e `SET NOT NULL` lo sono meno, e vanno nella lista per lo
 * stesso motivo: la prima può trasformare i valori esistenti, la seconda
 * fallisce o richiede un valore inventato per le righe già in tabella. La sola
 * eccezione è diventare `text`: vedi `VERSO_TESTO`.
 *
 * `DROP CONSTRAINT` e `DROP INDEX` non portano via righe e restano fuori: sono
 * il modo normale di rinominare un vincolo, e vietarli bloccherebbe metà delle
 * migrazioni innocue.
 */
/**
 * L'unica eccezione al «cambia il tipo di una colonna»: diventare `text`.
 *
 * `varchar(n) → text` è l'unico cambio di tipo che **non può restringere
 * niente**: `text` in Postgres non ha limite di lunghezza, quindi qualunque
 * valore già in tabella ci sta, e nessun codice che scriveva prima comincia a
 * ricevere errori dopo.
 *
 * Restringere invece resta fuori, e non per il dato — Postgres fa fallire
 * l'istruzione invece di troncare — ma per il **codice**: una colonna
 * ristretta da un'anteprima farebbe cominciare a fallire le scritture della
 * produzione, che è un guasto vero partito da un ramo mai approvato.
 *
 * E vale solo per questa forma esatta: `TYPE integer USING ...` resta
 * distruttivo, perché lì la conversione la scrive chi fa la migrazione e può
 * fare qualunque cosa.
 */
const VERSO_TESTO = /\bALTER\s+COLUMN\s+"?[A-Za-z_][A-Za-z0-9_]*"?\s+TYPE\s+TEXT\s*;?\s*$/im;

const DISTRUTTIVE: { pattern: RegExp; cosa: string; tranne?: RegExp }[] = [
  { pattern: /\bDROP\s+TABLE\b/i, cosa: "cancella una tabella" },
  { pattern: /\bDROP\s+COLUMN\b/i, cosa: "cancella una colonna" },
  { pattern: /\bTRUNCATE\b/i, cosa: "svuota una tabella" },
  { pattern: /\bDELETE\s+FROM\b/i, cosa: "cancella righe" },
  { pattern: /\bDROP\s+SCHEMA\b/i, cosa: "cancella uno schema" },
  { pattern: /\bDROP\s+(?:TYPE|ENUM)\b/i, cosa: "cancella un tipo" },
  { pattern: /\bALTER\s+COLUMN\s+.*\bTYPE\b/i, cosa: "cambia il tipo di una colonna", tranne: VERSO_TESTO },
  { pattern: /\bSET\s+NOT\s+NULL\b/i, cosa: "rende obbligatoria una colonna esistente" },
  { pattern: /\bRENAME\s+(?:TO|COLUMN)\b/i, cosa: "rinomina" },
];

/**
 * L'errore di chi ha trovato la serratura del database occupata.
 *
 * `prisma migrate deploy` prende un *advisory lock* e dopo dieci secondi
 * rinuncia con `P1002`. Su Vercel due build si sovrappongono spesso, e quella
 * che arriva seconda faceva fallire la pubblicazione per un motivo che non
 * aveva niente a che vedere col codice: va aspettato il turno, non abbandonato
 * il campo. Si riconosce **solo** questo errore, perché una migrazione scritta
 * male deve fallire subito e forte.
 */
export function serraturaOccupata(uscita: string): boolean {
  return /advisory lock|P1002/i.test(uscita);
}

/** Via i commenti, così un `-- DROP TABLE` in una nota non fa scattare niente. */
export function senzaCommenti(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((riga) => riga.replace(/--.*$/, ""))
    .join("\n");
}

export type Verdetto =
  | { distruttiva: false }
  | { distruttiva: true; motivi: string[] };

/** Questa migrazione porta via dati? */
export function esaminaMigrazione(sql: string): Verdetto {
  const pulito = senzaCommenti(sql);
  const motivi = DISTRUTTIVE.filter((d) => {
    if (!d.pattern.test(pulito)) return false;
    /**
     * L'eccezione si applica **solo se tutte** le istruzioni che hanno fatto
     * scattare la regola sono innocue: una migrazione che allarga una colonna
     * e ne converte un'altra resta distruttiva.
     */
    if (!d.tranne) return true;
    const colpevoli = pulito
      .split(";")
      .map((x) => `${x.trim()};`)
      .filter((x) => d.pattern.test(x));
    return !colpevoli.every((x) => d.tranne!.test(x));
  }).map((d) => d.cosa);
  return motivi.length > 0 ? { distruttiva: true, motivi: [...new Set(motivi)] } : { distruttiva: false };
}
