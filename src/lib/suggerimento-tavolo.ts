/**
 * **Quale tavolo dare a chi è appena arrivato.**
 *
 * ## Perché non basta l'elenco dei tavoli liberi
 *
 * `server/table-search.ts` risponde già a «chi è libero adesso», e lo fa
 * interrogando il motore di disponibilità tavolo per tavolo: quella resta la
 * verità su cosa si può occupare, e questo modulo non la rifà.
 *
 * La domanda di chi ha quattro persone davanti è un'altra: **quale**. E fra
 * tre tavoli liberi da quattro la differenza è tutta — uno ha una
 * prenotazione fra un'ora, uno è il sei posti che stasera serve alla tavolata
 * di otto, uno è nella sala dove la prenotazione era stata scritta. Finora
 * quella scelta la faceva il cameriere a memoria, in piedi, con le persone
 * che lo guardavano.
 *
 * ## Come si ordina
 *
 * Il punteggio è un costo: **più basso è meglio**, e ogni addendo ha un
 * motivo che si può dire a voce.
 *
 * - **i posti sprecati** pesano per primi. Mettere due persone su un sei
 *   posti è il modo più rapido di riempire la sala e ritrovarsi senza posto
 *   per il gruppo che arriva dopo. È la stessa regola che `findFreeTables`
 *   applica ordinando per posti crescenti — qui diventa un peso fra altri,
 *   perché a volte un posto sprecato è il prezzo giusto per non dare un
 *   tavolo che fra quaranta minuti serve;
 * - **la prossima prenotazione** su quel tavolo. Se non ci sta la seduta
 *   intera il tavolo è «stretto» e finisce in fondo; se ci sta ma per poco,
 *   pesa un po';
 * - **il tavolo già scritto sulla prenotazione** vince quasi sempre: qualcuno
 *   l'ha deciso prima, e disfare quella decisione senza motivo è il modo di
 *   far litigare la sala col registro;
 * - **i propri tavoli** valgono un po' di più: l'ospite prende chi lo ha in
 *   carico, non un tavolo che nessuno guarda;
 * - **la sala della prenotazione**, quando ne era stata scritta una.
 *
 * ## Niente percentuali
 *
 * Il punteggio **non si mostra**. «Compatibilità 92%» non è una ragione, è un
 * numero che sembra una ragione: chi lo legge non può controllarlo e non
 * impara niente. Quello che esce da qui è una frase — «quattro posti esatti,
 * nessuna prenotazione fino alle 22:30» — e una frase la si può contestare.
 */

/** Quanto conta un posto sprecato. */
const COSTO_POSTO_SPRECATO = 10;

/** Quanto conta un tavolo su cui la seduta non ci sta intera. */
const COSTO_NON_CI_STA = 500;

/** Il massimo che può pesare una prenotazione vicina che comunque ci sta. */
const COSTO_PRENOTAZIONE_VICINA = 40;

/**
 * Oltre questo margine, una prenotazione successiva non pesa più niente: un
 * tavolo che si libera due ore prima del prossimo nome è un tavolo libero.
 */
const MARGINE_TRANQUILLO_MIN = 90;

/** Lo sconto del tavolo già scritto sulla prenotazione. */
const SCONTO_TAVOLO_ATTESO = 60;

/** Lo sconto del tavolo assegnato a chi sta accomodando. */
const SCONTO_TAVOLO_PROPRIO = 8;

/** Lo sconto della sala in cui la prenotazione era stata scritta. */
const SCONTO_SALA_ATTESA = 12;

/**
 * Un tavolo come lo si può giudicare: la sua misura, e cosa gli succede dopo.
 *
 * Tutti i campi sono **fatti già calcolati altrove** — lo stato viene dalla
 * derivazione della sala, la prossima prenotazione dal registro del giorno,
 * l'assegnazione dalle due tabelle che il maître compila. Qui non si
 * interroga niente: è la ragione per cui questo file si può provare senza un
 * database, ed è la ragione per cui la sala e il suggerimento non possono
 * dire due cose diverse dello stesso tavolo.
 */
export type TavoloCandidato = {
  tableId: string;
  label: string;
  posti: number;
  roomId: string | null;
  roomName: string | null;
  /** Nessuno seduto, nessun arrivo imminente, non fuori servizio. */
  libero: boolean;
  /** Si può accostare a un altro (`Table.combinable`). */
  unibile: boolean;
  /** Assegnato a chi sta accomodando. */
  mio: boolean;
  /** È il tavolo che la prenotazione aveva già scritto sopra. */
  atteso: boolean;
  /**
   * Minuti da adesso alla prossima prenotazione su questo tavolo, `null` se
   * per stasera non ne ha altre.
   */
  minutiAllaProssima: number | null;
  /** L'ora della prossima prenotazione, già scritta («21:15»). */
  oraProssima: string | null;
};

/**
 * Quanto un tavolo va bene per questo gruppo, **in parole**.
 *
 * - `CONSIGLIATO`: il primo dell'ordine, quello su cui sta il pulsante grande;
 * - `DISPONIBILE`: ci si può accomodare adesso senza pensarci;
 * - `STRETTO`: è libero, ma la seduta non ci sta intera prima del prossimo
 *   nome. Si può usare — lo decide chi è in sala — e si dice quando si libera;
 * - `NON_COMPATIBILE`: libero e troppo piccolo. Resta visibile perché sparire
 *   è peggio: un cameriere che non trova il due posti nell'elenco pensa che
 *   l'elenco sia rotto, non che il tavolo sia piccolo;
 * - `OCCUPATO`: c'è gente, o sta arrivando, o è fuori servizio. Non si offre.
 */
export type Idoneita =
  | "CONSIGLIATO"
  | "DISPONIBILE"
  | "STRETTO"
  | "NON_COMPATIBILE"
  | "OCCUPATO";

export type TavoloProposto = TavoloCandidato & {
  idoneita: Idoneita;
  /**
   * La riga sotto il nome del tavolo: «Libero fino alle 22:30», «Prenotato
   * tra 90 min», «2 posti». Una sola, e sempre un fatto.
   */
  dettaglio: string;
  /** Vero se ci si può accomodare: `CONSIGLIATO`, `DISPONIBILE` o `STRETTO`. */
  offribile: boolean;
};

export type Unione = {
  /** In ordine: il primo è il tavolo principale della tavolata. */
  tableIds: string[];
  /** «T11 + T12». */
  label: string;
  posti: number;
  roomName: string | null;
  dettaglio: string;
};

export type Proposta = {
  /** Il tavolo su cui sta il pulsante grande, se c'è. */
  migliore: TavoloProposto | null;
  /**
   * Perché quello e non un altro, in una frase. `null` quando non c'è niente
   * da spiegare — un tavolo solo libero in tutta la sala non ha bisogno di
   * una motivazione.
   */
  motivo: string | null;
  /** Le altre strade, già in ordine. Il migliore non è qui dentro. */
  alternative: TavoloProposto[];
  /** Accostamenti, quando da soli i tavoli non bastano. */
  unioni: Unione[];
  /** Tutti i tavoli giudicati, per mettere in secondo piano quelli inadatti. */
  tutti: TavoloProposto[];
};

/* -------------------------------------------------------------------------- */
/*  Il giudizio su un tavolo solo                                             */
/* -------------------------------------------------------------------------- */

function costo(
  t: TavoloCandidato,
  coperti: number,
  durataMin: number,
  roomIdAtteso: string | null,
): number {
  let c = (t.posti - coperti) * COSTO_POSTO_SPRECATO;

  if (t.minutiAllaProssima !== null) {
    if (t.minutiAllaProssima < durataMin) {
      c += COSTO_NON_CI_STA;
    } else {
      /* Ci sta, ma quanto respira? Il margine oltre la durata prevista, con
         un tetto: passati novanta minuti di margine la prenotazione di dopo
         non è più un fatto di adesso. */
      const margine = Math.min(t.minutiAllaProssima - durataMin, MARGINE_TRANQUILLO_MIN);
      c += Math.round(COSTO_PRENOTAZIONE_VICINA * (1 - margine / MARGINE_TRANQUILLO_MIN));
    }
  }

  if (t.atteso) c -= SCONTO_TAVOLO_ATTESO;
  if (t.mio) c -= SCONTO_TAVOLO_PROPRIO;
  if (roomIdAtteso && t.roomId === roomIdAtteso) c -= SCONTO_SALA_ATTESA;

  return c;
}

function ora(minuti: number): string {
  return minuti >= 60
    ? `${Math.round(minuti / 60)} h`
    : `${minuti} min`;
}

function dettaglio(t: TavoloCandidato, coperti: number, durataMin: number): string {
  const posti = t.posti === 1 ? "1 posto" : `${t.posti} posti`;

  if (!t.libero) return posti;
  if (t.posti < coperti) return `${posti} · troppo piccolo`;

  if (t.minutiAllaProssima === null || t.oraProssima === null) return `${posti} · libero`;
  if (t.minutiAllaProssima < durataMin) {
    return `${posti} · prenotato tra ${ora(t.minutiAllaProssima)}`;
  }
  return `${posti} · libero fino alle ${t.oraProssima}`;
}

/* -------------------------------------------------------------------------- */
/*  La frase                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * **Perché questo tavolo**, in una frase che un cameriere può ripetere.
 *
 * Si costruisce dal confronto col secondo della lista, non dal punteggio del
 * primo: «è il migliore» non dice niente, «lascia libero B3 per i gruppi
 * grandi» dice cosa si sta proteggendo. Massimo due ragioni, perché la terza
 * nessuno la legge.
 */
function motivazione(
  migliore: TavoloProposto,
  resto: TavoloProposto[],
  coperti: number,
): string | null {
  const ragioni: string[] = [];

  if (migliore.atteso) ragioni.push("è il tavolo scritto sulla prenotazione");
  else if (migliore.posti === coperti) ragioni.push("ha i posti esatti");

  /* Il tavolo più grande che si sta **lasciando stare**: è la decisione che
     il cameriere non vede, e quindi quella che vale la pena dire. */
  const grandeLasciato = resto.find((t) => t.offribile && t.posti > migliore.posti);
  if (grandeLasciato) {
    ragioni.push(`lascia libero ${grandeLasciato.label} per un gruppo più numeroso`);
  }

  /* Un'alternativa scartata perché ha un nome vicino: l'altra decisione
     invisibile. */
  if (ragioni.length < 2) {
    const conPrenotazione = resto.find(
      (t) => t.libero && t.posti >= coperti && t.oraProssima && !t.offribile,
    );
    if (conPrenotazione) {
      ragioni.push(`${conPrenotazione.label} ha già una prenotazione alle ${conPrenotazione.oraProssima}`);
    }
  }

  if (ragioni.length === 0) return null;
  return maiuscola(ragioni.slice(0, 2).join(" e "));
}

function maiuscola(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* -------------------------------------------------------------------------- */
/*  Le unioni                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Le coppie di tavoli che insieme bastano, quando da soli non bastano.
 *
 * **Coppie, non combinazioni**: accostare tre tavoli è un gesto che in sala si
 * fa spostando le sedie e che qui produrrebbe decine di proposte fra cui
 * scegliere. Le regole sono quelle che `combineTablesForBooking` applica già
 * scrivendo — stessa sala, tutti unibili, posti sufficienti — e ripeterle qui
 * serve a non proporre una tavolata che il salvataggio poi rifiuta.
 *
 * Al massimo tre, ordinate per posti sprecati: oltre la terza è un elenco da
 * leggere, e chi lo legge ha delle persone in piedi davanti.
 */
function unioniPossibili(
  candidati: TavoloProposto[],
  coperti: number,
  durataMin: number,
): Unione[] {
  const utili = candidati.filter(
    (t) => t.libero && t.unibile && (t.minutiAllaProssima ?? Infinity) >= durataMin,
  );

  const unioni: Unione[] = [];
  for (let i = 0; i < utili.length; i++) {
    for (let j = i + 1; j < utili.length; j++) {
      const a = utili[i];
      const b = utili[j];
      if ((a.roomId ?? "") !== (b.roomId ?? "")) continue;
      const posti = a.posti + b.posti;
      if (posti < coperti) continue;
      /* Due tavoli che da soli bastavano già non sono una tavolata: sono due
         tavoli offerti singolarmente qualche riga più sopra. */
      if (a.posti >= coperti || b.posti >= coperti) continue;

      unioni.push({
        tableIds: [a.tableId, b.tableId],
        label: `${a.label} + ${b.label}`,
        posti,
        roomName: a.roomName,
        dettaglio: `${posti} posti · da accostare`,
      });
    }
  }

  return unioni.sort((x, y) => x.posti - y.posti).slice(0, 3);
}

/* -------------------------------------------------------------------------- */
/*  L'ingresso                                                                */
/* -------------------------------------------------------------------------- */

/**
 * La proposta per un gruppo di `coperti` persone.
 *
 * `durataMin` è la durata con cui si sta accomodando — la stessa che il
 * prodotto usa per prenotare. Cercare con centocinque minuti e poi sedere per
 * centoquaranta vuol dire offrire un tavolo che fra due ore ha già un nome
 * sopra.
 */
export function proponiTavoli(
  candidati: readonly TavoloCandidato[],
  richiesta: { coperti: number; durataMin: number; roomIdAtteso?: string | null },
): Proposta {
  const { coperti, durataMin } = richiesta;
  const roomIdAtteso = richiesta.roomIdAtteso ?? null;

  const giudicati: TavoloProposto[] = candidati.map((t) => {
    const idoneita: Idoneita = !t.libero
      ? "OCCUPATO"
      : t.posti < coperti
        ? "NON_COMPATIBILE"
        : (t.minutiAllaProssima ?? Infinity) < durataMin
          ? "STRETTO"
          : "DISPONIBILE";

    return {
      ...t,
      idoneita,
      offribile: idoneita === "DISPONIBILE" || idoneita === "STRETTO",
      dettaglio: dettaglio(t, coperti, durataMin),
    };
  });

  /*
    L'ordine: prima chi si può offrire, poi il costo, poi l'etichetta — che è
    l'unico ordine stabile fra due tavoli identici, e senza il quale la stessa
    sala si riordinerebbe da sola a ogni aggiornamento.
  */
  const ordinati = [...giudicati].sort((a, b) => {
    if (a.offribile !== b.offribile) return a.offribile ? -1 : 1;
    if (a.offribile) {
      const ca = costo(a, coperti, durataMin, roomIdAtteso);
      const cb = costo(b, coperti, durataMin, roomIdAtteso);
      if (ca !== cb) return ca - cb;
    }
    if (a.idoneita !== b.idoneita) {
      const peso: Record<Idoneita, number> = {
        CONSIGLIATO: 0,
        DISPONIBILE: 1,
        STRETTO: 2,
        NON_COMPATIBILE: 3,
        OCCUPATO: 4,
      };
      return peso[a.idoneita] - peso[b.idoneita];
    }
    return a.label.localeCompare(b.label, "it", { numeric: true });
  });

  const primo = ordinati.find((t) => t.offribile) ?? null;
  if (primo) primo.idoneita = "CONSIGLIATO";

  const alternative = ordinati.filter((t) => t !== primo && t.offribile);

  return {
    migliore: primo,
    motivo: primo ? motivazione(primo, ordinati.filter((t) => t !== primo), coperti) : null,
    alternative,
    unioni: unioniPossibili(ordinati, coperti, durataMin),
    tutti: ordinati,
  };
}
