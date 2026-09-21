import { describe, expect, it } from "vitest";
import {
  RIGHE_MASSIME,
  chiaveIntestazione,
  leggiFile,
  leggiGiorno,
  leggiOra,
  mappaColonne,
  righeCsv,
  separatore,
} from "@/lib/import-csv";

/**
 * Leggere il file di un altro gestionale.
 *
 * Qui si prova la parte che, sbagliando, **non dà nessun errore**: un
 * separatore indovinato male («nessuna colonna riconosciuta» su un file
 * perfetto), una data letta all'americana (duemila prenotazioni spostate di un
 * mese), il BOM di Excel che rende irriconoscibile la prima intestazione.
 *
 * Sono i difetti che si scoprono dal ristoratore che rinuncia a cambiare
 * gestionale, e questo file è la porta d'ingresso del prodotto: Quandoo spegne
 * tutto il 31 dicembre 2026.
 */

describe("il separatore", () => {
  it("riconosce il punto e virgola di Excel in italiano", () => {
    /* Assumere la virgola su un file così vuol dire leggere tutto come una
       colonna sola, e rispondere «non ho riconosciuto niente» a un file
       perfetto. */
    expect(separatore("Nome;Telefono;Data\nMario;333;2026-09-25")).toBe(";");
  });

  it("riconosce la virgola, la tabulazione e la barra verticale", () => {
    expect(separatore("Nome,Telefono\nMario,333")).toBe(",");
    expect(separatore("Nome\tTelefono\nMario\t333")).toBe("\t");
    expect(separatore("Nome|Telefono\nMario|333")).toBe("|");
  });

  it("non si fa ingannare da una virgola dentro le virgolette", () => {
    expect(separatore('"Rossi, Mario";333;2026-09-25')).toBe(";");
  });
});

describe("le celle", () => {
  it("legge le virgolette, le virgolette dentro le virgolette e i capoversi", () => {
    const testo = 'Nome;Note\n"Rossi, Mario";"dice ""niente pesce"".\nAllergico"';
    expect(righeCsv(testo)).toEqual([
      ["Nome", "Note"],
      ["Rossi, Mario", 'dice "niente pesce".\nAllergico'],
    ]);
  });

  it("toglie il BOM che Excel mette in testa al file", () => {
    /* È il difetto più stupido e più frequente: senza togliere quei tre byte,
       la colonna «Nome» si chiama «﻿Nome» e non combacia con niente. */
    const righe = righeCsv("﻿Nome;Telefono\nMario;333");
    expect(righe[0]![0]).toBe("Nome");
    expect(mappaColonne(righe[0]!).indici.nome).toBe(0);
  });

  it("butta le righe vuote in coda, che ogni esportazione ha", () => {
    expect(righeCsv("Nome;Tel\nMario;333\n;\n\n")).toHaveLength(2);
  });

  it("legge il CRLF di Windows", () => {
    expect(righeCsv("Nome;Tel\r\nMario;333\r\n")).toEqual([
      ["Nome", "Tel"],
      ["Mario", "333"],
    ]);
  });
});

describe("le intestazioni", () => {
  it("riconosce le stesse colonne scritte in dieci modi", () => {
    const { indici } = mappaColonne([
      "  NOME Cliente ",
      "Telefono cellulare",
      "Data prenotazione",
      "Ora",
      "PAX",
      "Note",
    ]);
    expect(indici).toEqual({ nome: 0, telefono: 1, giorno: 2, ora: 3, persone: 4, note: 5 });
  });

  it("riconosce le intestazioni inglesi di Quandoo e TheFork", () => {
    const { indici } = mappaColonne(["Guest name", "Phone number", "Booking date", "Time", "Covers"]);
    expect(indici).toEqual({ nome: 0, telefono: 1, giorno: 2, ora: 3, persone: 4 });
  });

  it("non si ferma per un accento o un trattino", () => {
    expect(chiaveIntestazione("E-Mail")).toBe(chiaveIntestazione("e mail"));
    expect(chiaveIntestazione("Città")).toBe("citta");
  });

  it("**elenca** le colonne che non ha capito, invece di nasconderle", () => {
    /* Una colonna «Allergie» scartata in silenzio è un dato che il locale
       aveva e non ha più, e non lo scopre nessuno. Dirlo permette di chiedere
       «questa la mettiamo nelle note?». */
    const { ignorate } = mappaColonne(["Nome", "Allergie", "Tavolo assegnato"]);
    expect(ignorate).toEqual(["Allergie", "Tavolo assegnato"]);
  });

  it("con due colonne uguali tiene la prima", () => {
    const { indici } = mappaColonne(["Telefono", "Telefono"]);
    expect(indici.telefono).toBe(0);
  });
});

describe("la data", () => {
  it("legge l'ordine italiano e quello ISO", () => {
    expect(leggiGiorno("25/09/2026")).toBe("2026-09-25");
    expect(leggiGiorno("25-09-2026")).toBe("2026-09-25");
    expect(leggiGiorno("2026-09-25")).toBe("2026-09-25");
    expect(leggiGiorno("25.09.26")).toBe("2026-09-25");
  });

  it("quando è ambiguo tiene l'ordine italiano, e lo fa sempre", () => {
    /*
      `03/04/2026` è il 3 aprile per un italiano e il 4 marzo per un
      americano, e nessuno dei due si può dedurre dal file. Indovinare al
      contrario sposterebbe duemila prenotazioni di un mese **senza dirlo a
      nessuno**: è il difetto peggiore di tutto questo lavoro.
    */
    expect(leggiGiorno("03/04/2026")).toBe("2026-04-03");
    expect(leggiGiorno("01/02/2026")).toBe("2026-02-01");
  });

  it("quando NON è ambiguo accetta anche l'ordine americano", () => {
    /* `09/25` non può che essere mese-giorno: scartare una riga che si capisce
       benissimo sarebbe scortesia inutile. */
    expect(leggiGiorno("09/25/2026")).toBe("2026-09-25");
  });

  it("rifiuta una data che non esiste invece di spostarla", () => {
    /* `new Date("2026-02-31")` diventa il 3 marzo, in silenzio. */
    expect(leggiGiorno("31/02/2026")).toBeNull();
    expect(leggiGiorno("32/01/2026")).toBeNull();
    expect(leggiGiorno("25/13/2026")).toBeNull();
    expect(leggiGiorno("venerdì prossimo")).toBeNull();
    expect(leggiGiorno("")).toBeNull();
  });

  it("rifiuta un anno fuori dal mondo", () => {
    expect(leggiGiorno("25/09/1492")).toBeNull();
  });
});

describe("l'ora", () => {
  it("legge i modi in cui la scrive una persona", () => {
    expect(leggiOra("20:30")).toBe("20:30");
    expect(leggiOra("20.30")).toBe("20:30");
    expect(leggiOra("8:05")).toBe("08:05");
    expect(leggiOra("20")).toBe("20:00");
  });

  it("rifiuta un orario impossibile", () => {
    expect(leggiOra("25:00")).toBeNull();
    expect(leggiOra("20:70")).toBeNull();
    expect(leggiOra("sera")).toBeNull();
  });
});

describe("il file intero", () => {
  const file = [
    "Nome;Cognome;Telefono;Email;Data;Ora;PAX;Note;Tavolo",
    "Mario;Rossi;333 111 2233;mario@prova.test;25/09/2026;20:30;4;Niente pesce;12",
    "Giulia;Bianchi;;giulia@prova.test;26/09/2026;21:00;2;;",
    ";;;;27/09/2026;20:00;2;;",
    "Luca;Verdi;3339998877;;30/02/2026;20:00;2;;",
  ].join("\n");

  it("legge le righe buone e dice **dove** sono quelle scartate", () => {
    const esito = leggiFile(file);

    expect(esito.totali).toBe(4);
    expect(esito.righe).toHaveLength(2);
    expect(esito.righe[0]).toMatchObject({
      riga: 2,
      nome: "Mario",
      cognome: "Rossi",
      telefono: "333 111 2233",
      giorno: "2026-09-25",
      ora: "20:30",
      persone: 4,
      note: "Niente pesce",
    });

    /* Il numero di riga è quello che il ristoratore vede aprendo il file col
       foglio di calcolo: l'intestazione è la riga 1. Senza questo, «tre righe
       scartate» è un'informazione inutilizzabile. */
    expect(esito.scarti).toEqual([
      { riga: 4, perche: "nessun nome, telefono o email" },
      { riga: 5, perche: "data non riconosciuta: «30/02/2026»" },
    ]);
  });

  it("dice quali colonne non ha usato", () => {
    expect(leggiFile(file).colonne.ignorate).toEqual(["Tavolo"]);
  });

  it("una sola colonna «data e ora» vale come due", () => {
    /* È il formato di metà dei gestionali. */
    const esito = leggiFile("Cliente;Data e ora;Coperti\nMario;2026-09-25 20:30;4");
    expect(esito.righe[0]).toMatchObject({ giorno: "2026-09-25", ora: "20:30", persone: 4 });
  });

  it("una rubrica senza date si importa comunque", () => {
    /* Chi arriva da un gestionale che teneva solo i contatti porta quelli: è
       l'unica cosa che non si ricompra. Le righe senza data sono clienti, non
       prenotazioni. */
    const esito = leggiFile("Nome;Telefono\nMario;3331112233\nGiulia;3334445566");
    expect(esito.righe).toHaveLength(2);
    expect(esito.righe.every((r) => r.giorno === null)).toBe(true);
    expect(esito.scarti).toEqual([]);
  });

  it("chi ha solo il numero non si perde: il numero diventa il nome", () => {
    const esito = leggiFile("Telefono;Data\n3331112233;25/09/2026");
    expect(esito.righe[0]).toMatchObject({ nome: "3331112233", telefono: "3331112233" });
  });

  it("scarta un numero di coperti assurdo senza scartare la riga", () => {
    const esito = leggiFile("Nome;PAX\nMario;0\nGiulia;700\nLuca;4");
    expect(esito.righe.map((r) => r.persone)).toEqual([null, null, 4]);
  });

  it("un file vuoto non è un guasto", () => {
    expect(leggiFile("")).toMatchObject({ righe: [], scarti: [], totali: 0 });
    expect(leggiFile("Nome;Telefono")).toMatchObject({ righe: [], totali: 0 });
  });

  it("taglia un file troppo lungo e **lo dice**", () => {
    /* Un file tagliato in silenzio è la metà dei clienti che non arriva, e
       nessuno che se ne accorga finché non li cerca. */
    const righe = ["Nome;Telefono"];
    for (let i = 0; i < RIGHE_MASSIME + 10; i++) righe.push(`Cliente ${i};333111${i}`);
    const esito = leggiFile(righe.join("\n"));

    expect(esito.tagliato).toBe(true);
    expect(esito.righe).toHaveLength(RIGHE_MASSIME);
    expect(esito.totali).toBe(RIGHE_MASSIME + 10);
  });
});
