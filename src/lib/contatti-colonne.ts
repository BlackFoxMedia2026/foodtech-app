import { chiaveIntestazione, mappaColonne, RIGHE_MASSIME, righeCsv, separatore } from "./import-csv";

/**
 * Quale colonna del file è quale, per i contatti di una campagna.
 *
 * Il lettore generale (`leggiFile`) riconosce le colonne solo dal nome
 * dell'intestazione, e quando non trova il nome usa il telefono al suo posto:
 * per una rubrica importata da un gestionale ha senso, per una newsletter no
 * — «Ciao 3394995402» è peggio di «Ciao». E un file con «Nominativo» o «Nome e
 * cognome» finiva così.
 *
 * Qui, come in Brevo e GetResponse, l'abbinamento si **propone** (dalle
 * intestazioni e, se non bastano, da cosa c'è dentro le celle) e chi carica il
 * file lo vede e lo corregge prima del controllo. Gira sia nel browser (per
 * mostrare le colonne) sia sul server (per leggere il file con l'abbinamento
 * scelto): niente accessi a dati qui dentro.
 */

export type CampoContatto = "email" | "nome" | "cognome" | "nomeCompleto" | "telefono";

/** Campo → indice della colonna nel file. */
export type AbbinamentoColonne = Partial<Record<CampoContatto, number>>;

export const ETICHETTE_CAMPO: Record<CampoContatto, string> = {
  email: "Email",
  nome: "Nome",
  cognome: "Cognome",
  nomeCompleto: "Nome e cognome",
  telefono: "Telefono",
};

const ALIAS_NOME_COMPLETO = [
  "nominativo",
  "nome e cognome",
  "nome cognome",
  "cognome e nome",
  "cognome nome",
  "nome completo",
  "full name",
  "fullname",
  "intestatario",
  "ragione sociale",
  "nome cliente completo",
].map(chiaveIntestazione);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO = /^\+?[\d\s().-]{6,}$/;

/** Quante celle non vuote di una colonna somigliano a qualcosa. */
function quota(colonna: string[], prova: (v: string) => boolean): number {
  const piene = colonna.filter((v) => v.trim());
  if (piene.length === 0) return 0;
  return piene.filter((v) => prova(v.trim())).length / piene.length;
}

/**
 * La proposta: prima le intestazioni, poi il contenuto per i campi che
 * mancano ancora. Una colonna non viene mai assegnata a due campi.
 */
export function proponiAbbinamento(intestazioni: string[], righe: string[][]): AbbinamentoColonne {
  const proposta: AbbinamentoColonne = {};
  const usate = new Set<number>();
  const prendi = (campo: CampoContatto, i: number | undefined) => {
    if (i === undefined || usate.has(i) || proposta[campo] !== undefined) return;
    proposta[campo] = i;
    usate.add(i);
  };

  // 1. Dalle intestazioni: prima il nome completo, che altrimenti «nome» ruberebbe.
  intestazioni.forEach((t, i) => {
    if (ALIAS_NOME_COMPLETO.includes(chiaveIntestazione(t))) prendi("nomeCompleto", i);
  });
  const { indici } = mappaColonne(intestazioni);
  prendi("email", indici.email);
  if (proposta.nomeCompleto === undefined) prendi("nome", indici.nome);
  prendi("cognome", indici.cognome);
  prendi("telefono", indici.telefono);

  // 2. Dal contenuto, per quello che le intestazioni non hanno detto.
  const colonna = (i: number) => righe.map((r) => r[i] ?? "");
  // «Nome» senza una colonna Cognome, ma dentro c'è «Mario Rossi»: è il nome completo.
  if (
    proposta.nome !== undefined &&
    proposta.cognome === undefined &&
    quota(colonna(proposta.nome), (v) => /\S\s+\S/.test(v)) >= 0.5
  ) {
    proposta.nomeCompleto = proposta.nome;
    delete proposta.nome;
  }
  const libere = () => intestazioni.map((_, i) => i).filter((i) => !usate.has(i));
  if (proposta.email === undefined) {
    prendi(
      "email",
      libere().find((i) => quota(colonna(i), (v) => EMAIL.test(v)) >= 0.6),
    );
  }
  if (proposta.telefono === undefined) {
    prendi(
      "telefono",
      libere().find((i) => quota(colonna(i), (v) => TELEFONO.test(v)) >= 0.6),
    );
  }
  if (proposta.nome === undefined && proposta.nomeCompleto === undefined) {
    // La prima colonna di testo che non sia né email né numeri.
    const testo = libere().find(
      (i) => quota(colonna(i), (v) => /\p{L}/u.test(v) && !v.includes("@") && !TELEFONO.test(v)) >= 0.6,
    );
    // Con uno spazio dentro quasi sempre è «Mario Rossi».
    if (testo !== undefined) {
      const conSpazio = quota(colonna(testo), (v) => /\S\s+\S/.test(v)) >= 0.5;
      prendi(conSpazio && proposta.cognome === undefined ? "nomeCompleto" : "nome", testo);
    }
  }
  return proposta;
}

/** Le colonne del file e le prime righe, per mostrarle prima del controllo. */
export function colonneDelFile(testo: string): {
  intestazioni: string[];
  esempi: string[][];
  proposta: AbbinamentoColonne;
} {
  const tutte = righeCsv(testo, separatore(testo)).filter((r) => r.some((c) => c.trim()));
  const intestazioni = (tutte[0] ?? []).map((t) => t.trim());
  const corpo = tutte.slice(1, 201);
  return { intestazioni, esempi: corpo.slice(0, 3), proposta: proponiAbbinamento(intestazioni, corpo) };
}

export type ContattoLetto = {
  riga: number;
  email: string;
  nome: string;
  cognome: string | null;
  telefono: string | null;
};

/**
 * Il file letto con l'abbinamento scelto. Il nome resta vuoto se non c'è:
 * mai il telefono o l'email al suo posto.
 */
export function contattiDaFile(
  testo: string,
  abbinamento: AbbinamentoColonne,
): { righe: ContattoLetto[]; totali: number; tagliato: boolean } {
  const tutte = righeCsv(testo, separatore(testo));
  const corpo = tutte.slice(1).filter((r) => r.some((c) => c.trim()));
  const tagliato = corpo.length > RIGHE_MASSIME;
  const cella = (r: string[], campo: CampoContatto) => {
    const i = abbinamento[campo];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  const righe = (tagliato ? corpo.slice(0, RIGHE_MASSIME) : corpo).map((r, i) => {
    let nome = cella(r, "nome");
    let cognome = cella(r, "cognome");
    const completo = cella(r, "nomeCompleto").replace(/\s+/g, " ");
    if (completo && !nome) {
      const [primo, ...resto] = completo.split(" ");
      nome = primo ?? "";
      if (!cognome) cognome = resto.join(" ");
    }
    return {
      // +2: l'intestazione è la riga 1 del foglio di calcolo.
      riga: i + 2,
      email: cella(r, "email"),
      nome,
      cognome: cognome || null,
      telefono: cella(r, "telefono") || null,
    };
  });
  return { righe, totali: corpo.length, tagliato };
}
