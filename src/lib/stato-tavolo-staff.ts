import type { ComandaStatus } from "@prisma/client";
import type { TableLiveStatus } from "./table-status";

/**
 * **Lo stato di un tavolo come lo legge chi lo serve.**
 *
 * ## Perché non bastava quello che c'era
 *
 * `deriveTableLiveStatus` risponde a chi guarda **la sala**: libero,
 * prenotato, in arrivo, occupato, al conto, da riassettare, bloccato. Sono i
 * sette stati che servono a decidere dove far sedere qualcuno, e restano la
 * base — questa funzione li prende come punto di partenza, non li rifà.
 *
 * Chi ha quel tavolo in carico si fa una domanda diversa: «cosa devo fare
 * adesso?». E fra due tavoli entrambi «occupati» la differenza è tutta:
 * a uno bisogna andare a prendere l'ordine, l'altro sta aspettando i primi.
 *
 * ## Niente colonne nuove
 *
 * Gli stati in più — `ORDINAZIONE`, `COMANDA_INVIATA`, `IN_SERVIZIO` — sono
 * **raffinamenti di `OCCUPATO`**, dedotti dalle comande di quel tavolo. Non
 * esiste una colonna «stato del tavolo» e non deve esistere: due fonti per lo
 * stesso fatto si contraddicono il giorno in cui una delle due non viene
 * aggiornata, ed è il motivo per cui questo progetto ha derivato anche i
 * sette di prima.
 *
 * L'unica eccezione è `CONTO`, che adesso ha un fatto dietro
 * (`Order.contoRichiestoAt`) oltre alla stima sulla durata: un tavolo può
 * stare due ore senza chiedere niente, e uno chiedere il conto dopo quaranta
 * minuti. Le due cose non si escludono — la stima resta per i tavoli di cui
 * nessuno ha premuto niente.
 */

export type StatoTavoloStaff =
  | "LIBERO"
  | "PRENOTATO"
  | "IN_ARRIVO"
  /** Seduti, nessuna comanda ancora aperta. Il tavolo aspetta qualcuno. */
  | "ACCOMODATI"
  /** C'è una comanda in bozza con qualcosa dentro: si sta prendendo l'ordine. */
  | "ORDINAZIONE"
  /** Partita, la cucina non l'ha ancora presa in mano. */
  | "COMANDA_INVIATA"
  /** La cucina ci sta lavorando, o ci sono piatti pronti da portare. */
  | "IN_SERVIZIO"
  /**
   * **Tutto quello che è stato ordinato è arrivato**, e non c'è niente in
   * cucina né al passe.
   *
   * Non è un settimo raffinamento per il gusto di averlo: senza, un tavolo
   * che ha finito i secondi ricadeva in `ACCOMODATI` — perché di comande vive
   * non ne ha più nessuna — e la dashboard gli scriveva sopra «appena seduti,
   * nessuna comanda ancora» a gente che aveva appena mangiato. Era il difetto
   * più sciocco e il più visibile.
   *
   * È anche il momento in cui il servizio ha una decisione da prendere:
   * dolci, caffè o conto. Da qui nasce il richiamo «da controllare».
   */
  | "SERVITO"
  /**
   * La **stima** della sala: seduti oltre la durata prevista, quindi
   * probabilmente verso il conto. Nessuno ha premuto niente.
   *
   * Sta separato da `CONTO` perché sono due cose diverse e questo prodotto
   * passa il tempo a non farle sembrare una sola: «conto richiesto» è un
   * fatto con un'ora, «probabilmente al conto» è un'ipotesi su una durata
   * media. Scriverli con la stessa etichetta vorrebbe dire mandare un
   * cameriere al tavolo dicendo «me l'hai chiesto tu» a qualcuno che non ha
   * chiesto niente.
   */
  | "VERSO_IL_CONTO"
  | "CONTO"
  | "PAGAMENTO"
  /** Appena liberato, da riassettare. */
  | "DA_LIBERARE"
  | "BLOCCATO";

export const STATO_STAFF_LABEL: Record<StatoTavoloStaff, string> = {
  LIBERO: "Libero",
  PRENOTATO: "Prenotato",
  IN_ARRIVO: "In arrivo",
  ACCOMODATI: "Accomodati",
  ORDINAZIONE: "Ordinazione in corso",
  COMANDA_INVIATA: "Comanda inviata",
  IN_SERVIZIO: "In servizio",
  SERVITO: "Servito",
  VERSO_IL_CONTO: "Verso il conto",
  CONTO: "Conto richiesto",
  PAGAMENTO: "Pagamento in corso",
  DA_LIBERARE: "Da liberare",
  BLOCCATO: "Fuori servizio",
};

/**
 * Gli stessi stati **in forma corta**, per le card disegnate della Home.
 *
 * Sotto un tavolo largo novanta pixel «Ordinazione in corso» non ci sta:
 * andava a capo o si troncava in «Ordinazione in cor…». Non è la stessa
 * scala tipografica scritta più piccola — è che in un elenco si legge una
 * riga, in una griglia si legge una parola.
 *
 * Restano parole intere del mestiere, non abbreviazioni: «Ordinazione» sì,
 * «Ord.» no. L'etichetta lunga resta quella di `STATO_STAFF_LABEL` e la
 * usano l'elenco della Sala e la testata del tavolo aperto, dove lo spazio
 * c'è — ed è anche quella che finisce nell'etichetta accessibile della
 * card, perché a chi ascolta lo spazio non manca mai.
 */
export const STATO_STAFF_BREVE: Record<StatoTavoloStaff, string> = {
  LIBERO: "Libero",
  PRENOTATO: "Prenotato",
  IN_ARRIVO: "In arrivo",
  ACCOMODATI: "Accomodati",
  ORDINAZIONE: "Ordinazione",
  COMANDA_INVIATA: "In cucina",
  IN_SERVIZIO: "In servizio",
  SERVITO: "Servito",
  VERSO_IL_CONTO: "Verso il conto",
  CONTO: "Conto",
  PAGAMENTO: "Pagamento",
  DA_LIBERARE: "Da liberare",
  BLOCCATO: "Fuori servizio",
};

/**
 * Il colore di ogni stato, come **famiglia di token**, non come classe.
 *
 * Il valore è la chiave di una mappa di classi Tailwind che vive nel
 * componente: qui sta la semantica, là la resa. Il motivo è una lezione già
 * pagata — le classi scritte in un file di dati smettono di esistere quando
 * il compilatore di Tailwind non le vede, e falliscono in silenzio.
 */
export type TonoStato = "neutro" | "attesa" | "attivo" | "urgente" | "spento";

export const TONO_STATO: Record<StatoTavoloStaff, TonoStato> = {
  LIBERO: "neutro",
  PRENOTATO: "attesa",
  IN_ARRIVO: "attesa",
  ACCOMODATI: "attivo",
  ORDINAZIONE: "attivo",
  COMANDA_INVIATA: "attivo",
  IN_SERVIZIO: "attivo",
  SERVITO: "attivo",
  /* Un'ipotesi non è un'urgenza: chi guarda deve poterlo distinguere anche
     senza leggere l'etichetta. */
  VERSO_IL_CONTO: "attesa",
  CONTO: "urgente",
  PAGAMENTO: "urgente",
  DA_LIBERARE: "attesa",
  BLOCCATO: "spento",
};

/** Cosa sappiamo delle comande di questo tavolo, in forma minima. */
export type ComandeDelTavolo = {
  /** Comande in bozza che hanno almeno una riga. Una bozza vuota non conta. */
  bozzeConRighe: number;
  /** Partite ma non ancora prese in mano dalla cucina. */
  inviate: number;
  inPreparazione: number;
  /** Piatti pronti al passe, non ancora portati. */
  pronte: number;
  /**
   * Comande **portate al tavolo e finite**.
   *
   * Contano per una cosa sola e importante: distinguere un tavolo che ha
   * mangiato da uno che non ha ancora ordinato. Senza di loro un tavolo con
   * tre comande tutte servite ha zero comande vive, cioè è indistinguibile da
   * una tovaglia vuota — ed è esattamente l'errore che scriveva «appena
   * seduti» sotto il nome di chi aveva appena finito i secondi.
   */
  servite: number;
};

export const NESSUNA_COMANDA: ComandeDelTavolo = {
  bozzeConRighe: 0,
  inviate: 0,
  inPreparazione: 0,
  pronte: 0,
  servite: 0,
};

export function riassumiComande(
  comande: readonly { status: ComandaStatus; righe: number }[],
): ComandeDelTavolo {
  const r = { ...NESSUNA_COMANDA };
  for (const c of comande) {
    if (c.status === "BOZZA") {
      if (c.righe > 0) r.bozzeConRighe += 1;
    } else if (c.status === "INVIATA" || c.status === "RICEVUTA") r.inviate += 1;
    else if (c.status === "IN_PREPARAZIONE") r.inPreparazione += 1;
    else if (c.status === "PRONTA") r.pronte += 1;
    else if (c.status === "SERVITA") r.servite += 1;
  }
  return r;
}

export type SegnaliConto = {
  /** Qualcuno ha premuto «Richiedi conto». */
  contoRichiesto: boolean;
  /** C'è un pagamento in corso: il cliente sta pagando adesso, di solito col QR. */
  pagamentoInCorso: boolean;
};

/**
 * Lo stato operativo del tavolo.
 *
 * L'ordine dei controlli **è** la definizione, e va letto come una scala di
 * urgenza: quello che si decide prima è quello che il cameriere deve vedere
 * anche quando più cose valgono insieme. Un tavolo che sta pagando e ha un
 * dolce in preparazione è «pagamento», non «in servizio»: il dolce lo porta la
 * cucina, il pagamento lo perde il locale.
 *
 * I tre stati fuori seduta (`BLOCCATO`, `LIBERO`, `PRENOTATO`, `IN_ARRIVO`,
 * `DA_LIBERARE`) passano **inalterati** da `deriveTableLiveStatus`: di un
 * tavolo vuoto non c'è niente da raffinare, e rifarne il calcolo qui sarebbe
 * la seconda fonte di verità che questo modulo esiste per non creare.
 */
export function statoTavoloStaff(
  base: TableLiveStatus,
  comande: ComandeDelTavolo = NESSUNA_COMANDA,
  conto: SegnaliConto = { contoRichiesto: false, pagamentoInCorso: false },
): StatoTavoloStaff {
  if (base === "BLOCCATO") return "BLOCCATO";
  if (base === "PULIZIA") return "DA_LIBERARE";
  if (base === "LIBERO") return "LIBERO";
  if (base === "PRENOTATO") return "PRENOTATO";
  if (base === "IN_ARRIVO") return "IN_ARRIVO";

  /* Da qui in giù ci sono persone sedute: `OCCUPATO` o `CONTO`. */

  if (conto.pagamentoInCorso) return "PAGAMENTO";
  if (conto.contoRichiesto) return "CONTO";

  if (comande.pronte > 0 || comande.inPreparazione > 0) return "IN_SERVIZIO";
  if (comande.inviate > 0) return "COMANDA_INVIATA";
  if (comande.bozzeConRighe > 0) return "ORDINAZIONE";

  /*
    Hanno mangiato tutto quello che avevano ordinato e in cucina non c'è
    niente di loro. Sta **prima** della stima sulla durata perché è un fatto e
    quella è un'ipotesi: un tavolo che ha appena ricevuto il dolce non è
    «verso il conto» solo perché è seduto da due ore.
  */
  if (comande.servite > 0) return "SERVITO";

  /*
    Nessuna comanda, e la sala dice «al conto»: è la stima sulla durata. Si
    riporta come stima — `VERSO_IL_CONTO` — non come il fatto che qualcuno
    l'abbia chiesto. Con delle comande in ballo invece i tre casi qui sopra
    sono più informativi: un tavolo con i secondi in preparazione non è
    «verso il conto» solo perché è seduto da due ore.
  */
  if (base === "CONTO") return "VERSO_IL_CONTO";
  return "ACCOMODATI";
}

/* -------------------------------------------------------------------------- */
/*  Il richiamo: cosa chiede attenzione, adesso                               */
/* -------------------------------------------------------------------------- */

/**
 * **Perché il tavolo compare in «Da gestire ora».**
 *
 * Quattro di questi motivi c'erano già (`PIATTI_PRONTI`, `CONTO`, `ALLERGIA`,
 * `NOTA`) e descrivevano un tavolo che *chiama*. Tre sono nuovi e descrivono
 * un tavolo che **non chiama e va servito lo stesso** — ed è il difetto da
 * cui è partito questo lavoro: una famiglia appena accomodata, senza allergie
 * e senza note, non compariva in nessuna sezione della dashboard. Il cameriere
 * doveva ricordarsela.
 *
 * `SENZA_COMANDA` è quella famiglia. `DA_CONTROLLARE` è il tavolo che ha
 * finito i secondi venti minuti fa e a cui nessuno ha chiesto se vuole un
 * dolce. `DA_LIBERARE` è il tavolo che si è alzato e non è stato rimesso a
 * posto: lavoro vero, ultimo in fila.
 */
export type MotivoRichiamo =
  | "PIATTI_PRONTI"
  | "CONTO"
  | "SENZA_COMANDA"
  | "ALLERGIA"
  | "DA_CONTROLLARE"
  | "DA_LIBERARE"
  | "NOTA";

/**
 * **L'ordine della coda**, e con esso la definizione di urgenza di questo
 * prodotto.
 *
 * Si legge dall'alto: quello che *peggiora aspettando* prima di quello che
 * *costa aspettando*.
 *
 * 1. **i piatti pronti** si freddano — è l'unica cosa in questo elenco che si
 *    rovina da sola;
 * 2. **il conto chiesto** è una persona che vuole andarsene e non può;
 * 3. **il tavolo senza comanda** è una persona seduta davanti a una tovaglia
 *    vuota: non si lamenta, e per questo sparisce;
 * 4. **l'allergia** va letta prima di portare, ma il tavolo che ce l'ha è già
 *    in coda per un altro motivo quasi sempre;
 * 5. **da controllare** è cortesia, non emergenza;
 * 6. **da liberare** è un tavolo che non fa male a nessuno tranne a chi
 *    aspetta in piedi — e quelli hanno una loro riga, più in alto di questa;
 * 7. **la nota** non è una cosa da fare: è una cosa da sapere.
 *
 * Il numero è esportato invece di restare una `switch` interna perché la Sala
 * e la Home ordinano la stessa coda, e due tabelle di priorità in due
 * schermate sono due idee diverse di cosa sia urgente.
 */
export const RANGO_RICHIAMO: Record<MotivoRichiamo, number> = {
  PIATTI_PRONTI: 0,
  CONTO: 1,
  SENZA_COMANDA: 2,
  ALLERGIA: 3,
  DA_CONTROLLARE: 4,
  DA_LIBERARE: 5,
  NOTA: 6,
};

/**
 * Da quanti minuti un tavolo seduto senza comanda smette di essere «appena
 * arrivato» e diventa «qualcuno deve andarci».
 *
 * Dieci minuti è il tempo in cui una tavolata si toglie il cappotto, guarda
 * il menu e comincia a cercare con gli occhi qualcuno. Sotto, scrivere
 * «comanda da prendere» metterebbe fretta a un cameriere che sta facendo la
 * cosa giusta — cioè lasciarli sedere.
 */
export const MINUTI_PRIMA_DELLA_COMANDA = 10;

/**
 * Da quanti minuti un tavolo che ha finito di mangiare vuole essere
 * ricontrollato.
 *
 * Un quarto d'ora dopo l'ultimo piatto servito: il tempo di finirlo. Prima è
 * interrompere una cena, dopo è un tavolo lasciato solo.
 */
export const MINUTI_PRIMA_DEL_CONTROLLO = 15;

/**
 * Il **richiamo** del tavolo: la cosa che chiede attenzione adesso.
 *
 * Diverso dallo stato: lo stato dice dov'è il tavolo nel suo percorso, il
 * richiamo dice **se bisogna alzarsi, e per cosa**. Un tavolo «in servizio»
 * con due piatti pronti al passe e uno che aspetta i primi sono lo stesso
 * stato e due situazioni diverse.
 *
 * `null` quando non c'è niente da fare — un tavolo con i secondi in
 * preparazione, per esempio: la cucina ci sta lavorando e chi serve non deve
 * fare niente. È la condizione di buona parte dei tavoli quasi sempre, ed è
 * la ragione per cui «Da gestire ora» sparisce invece di dire «tutto a
 * posto».
 *
 * ## L'etichetta e il testo sono due cose
 *
 * `etichetta` è il badge della card, due parole: si **riconosce**, non si
 * legge. `testo` è la riga sotto: si legge, e dice il dettaglio che il badge
 * non può portare (*quali* allergie, *quanti* piatti). Tenerli separati è ciò
 * che permette alla card di essere riconoscibile a un braccio di distanza e
 * completa da vicino.
 */
export type Richiamo = {
  tipo: MotivoRichiamo;
  /** Il badge: «Appena seduti», «Piatti da servire». Due parole, non tre. */
  etichetta: string;
  /** La riga sotto il badge: cosa c'è da fare, per esteso. */
  testo: string;
  /** `RANGO_RICHIAMO[tipo]`, portato con sé per non doverlo ricalcolare. */
  rango: number;
  /**
   * **Da quanti minuti dura questa situazione**, non da quanti il tavolo è
   * seduto.
   *
   * È la metà che mancava: due tavoli «appena seduti» sono la stessa
   * etichetta e due priorità diverse se uno lo è da due minuti e l'altro da
   * quattordici. Nullo quando il momento d'inizio non si sa — un'allergia
   * scritta nella scheda del cliente non è cominciata oggi.
   */
  daMinuti: number | null;
};

function richiamo(
  tipo: MotivoRichiamo,
  etichetta: string,
  testo: string,
  daMinuti: number | null,
): Richiamo {
  return { tipo, etichetta, testo, rango: RANGO_RICHIAMO[tipo], daMinuti };
}

export type SegnaliRichiamo = {
  /** Lo stato operativo già calcolato: evita di ridedurlo qui e sbagliarlo. */
  stato: StatoTavoloStaff;
  piattiPronti: number;
  contoRichiesto: boolean;
  /**
   * Quante allergie ci sono al tavolo, **da qualunque parte arrivino**: le
   * righe di comanda con un allergene dichiarato e la scheda dell'ospite nel
   * CRM. Tenerle separate era un difetto vero e visibile: l'allergia al
   * glutine di una cliente abituale, scritta nella sua scheda, compariva
   * sulla card come una nota qualsiasi — stesso grigio, stessa icona di
   * «compleanno».
   */
  allergie: number;
  /**
   * Quali allergie, quando le sappiamo per nome — di solito dalla scheda del
   * cliente. «Allergie: glutine» dice a un cameriere cosa non portare;
   * «1 allergia al tavolo» gli dice solo di andare a controllare.
   */
  dettaglioAllergia?: string | null;
  notaImportante: string | null;
  /** Minuti nello stato corrente: vedi `Richiamo.daMinuti`. */
  daMinuti?: number | null;
};

/**
 * L'ordine dei controlli **è** la priorità: il primo che risponde vince, e
 * quello che vince è quello che il cameriere vede. Un tavolo con due piatti
 * pronti *e* un'allergia dichiarata è un tavolo a cui portare due piatti —
 * l'allergia la rilegge aprendo il tavolo, dove sta scritta in rosso.
 */
export function richiamoTavolo(opts: SegnaliRichiamo): Richiamo | null {
  const min = opts.daMinuti ?? null;

  if (opts.piattiPronti > 0) {
    return richiamo(
      "PIATTI_PRONTI",
      "Piatti da servire",
      opts.piattiPronti === 1
        ? "1 piatto pronto al passe"
        : `${opts.piattiPronti} piatti pronti al passe`,
      min,
    );
  }

  if (opts.contoRichiesto) {
    return richiamo("CONTO", "Conto richiesto", "Il tavolo aspetta il conto", min);
  }

  /*
    Seduti, nessuna comanda. L'etichetta cambia con l'attesa e il rango no:
    fra due tavoli senza comanda decide chi aspetta da più tempo, e a parità
    di rango lo fa già l'ordinamento. Due ranghi diversi per lo stesso fatto
    avrebbero prodotto un tavolo che *scavalca* un conto richiesto solo
    perché nessuno gli ha ancora portato il menu.
  */
  if (opts.stato === "ACCOMODATI") {
    const atteso = min !== null && min >= MINUTI_PRIMA_DELLA_COMANDA;
    return richiamo(
      "SENZA_COMANDA",
      atteso ? "Comanda da prendere" : "Appena seduti",
      "Nessuna comanda ancora",
      min,
    );
  }

  if (opts.allergie > 0) {
    return richiamo(
      "ALLERGIA",
      "Allergie al tavolo",
      opts.dettaglioAllergia
        ? `Allergie: ${opts.dettaglioAllergia}`
        : opts.allergie === 1
          ? "1 allergia al tavolo"
          : `${opts.allergie} allergie al tavolo`,
      null,
    );
  }

  /*
    Ha finito di mangiare e nessuno è più passato. Non vale per i tavoli che
    hanno già chiesto il conto — quelli sono usciti due controlli fa — né per
    quelli che stanno pagando: andare a chiedere «tutto bene?» a chi ha la
    carta in mano è il modo di sembrare di avere fretta.
  */
  /*
    Due strade portano qui, e sono la stessa cosa vista da due parti:

    - `SERVITO` è il **fatto**: tutto quello che hanno ordinato è arrivato e
      in cucina non c'è più niente di loro;
    - `VERSO_IL_CONTO` è la **stima della sala**: sono seduti oltre la durata
      prevista e non sta succedendo nulla.

    In tutti e due i casi la domanda da fare al tavolo è la stessa — dolci,
    caffè o conto — e quindi il richiamo è lo stesso. Restano due stati
    diversi perché sull'etichetta del tavolo la differenza fra un fatto e
    un'ipotesi va tenuta: vedi il commento su `VERSO_IL_CONTO`.
  */
  if (
    (opts.stato === "SERVITO" || opts.stato === "VERSO_IL_CONTO") &&
    min !== null &&
    min >= MINUTI_PRIMA_DEL_CONTROLLO
  ) {
    return richiamo("DA_CONTROLLARE", "Da controllare", "Hanno finito: dolci o conto?", min);
  }

  if (opts.stato === "DA_LIBERARE") {
    return richiamo("DA_LIBERARE", "Da liberare", "Il tavolo è da rimettere a posto", min);
  }

  if (opts.notaImportante) {
    return richiamo("NOTA", "Da sapere", opts.notaImportante, null);
  }

  return null;
}

/**
 * **Questo richiamo chiede un gesto?**
 *
 * Tutti tranne la nota. «Prima volta qui», «compleanno», «preferisce il
 * tavolo vicino alla finestra» sono cose da **sapere** mentre si serve, non
 * cose da fare adesso — e metterle in una coda di lavoro è precisamente il
 * difetto da cui è partita questa riscrittura: nello screenshot iniziale
 * l'unica riga sotto «Da fare» era «T9 · Prima volta qui», su un tavolo che
 * andava servito per tutt'altro motivo. Il tavolo si vedeva, ma per la
 * ragione sbagliata, e la ragione giusta non si vedeva affatto.
 *
 * La nota resta dov'è utile: sull'icona del tasto in Sala e dentro il tavolo
 * aperto, dove si legge prima di ordinare.
 */
export function chiedeUnGesto(r: Richiamo | null | undefined): boolean {
  return !!r && r.tipo !== "NOTA";
}
