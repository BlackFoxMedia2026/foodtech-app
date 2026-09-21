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
};

export const NESSUNA_COMANDA: ComandeDelTavolo = {
  bozzeConRighe: 0,
  inviate: 0,
  inPreparazione: 0,
  pronte: 0,
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
    Nessuna comanda, e la sala dice «al conto»: è la stima sulla durata. Si
    riporta come stima — `VERSO_IL_CONTO` — non come il fatto che qualcuno
    l'abbia chiesto. Con delle comande in ballo invece i tre casi qui sopra
    sono più informativi: un tavolo con i secondi in preparazione non è
    «verso il conto» solo perché è seduto da due ore.
  */
  if (base === "CONTO") return "VERSO_IL_CONTO";
  return "ACCOMODATI";
}

/**
 * Il **richiamo** del tavolo: la cosa che chiede attenzione adesso.
 *
 * Diverso dallo stato: lo stato dice dov'è il tavolo nel suo percorso, il
 * richiamo dice se bisogna alzarsi. Un tavolo «in servizio» con due piatti
 * pronti al passe e uno senza sono lo stesso stato e due situazioni diverse.
 *
 * `null` quando non c'è niente da fare: la card resta silenziosa, che è la
 * condizione normale di quasi tutti i tavoli quasi sempre.
 */
export type Richiamo = { tipo: "PIATTI_PRONTI" | "CONTO" | "ALLERGIA" | "NOTA"; testo: string };

export function richiamoTavolo(opts: {
  comande: ComandeDelTavolo;
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
}): Richiamo | null {
  if (opts.piattiPronti > 0) {
    return {
      tipo: "PIATTI_PRONTI",
      testo: opts.piattiPronti === 1 ? "1 piatto pronto" : `${opts.piattiPronti} piatti pronti`,
    };
  }
  if (opts.contoRichiesto) return { tipo: "CONTO", testo: "Conto richiesto" };
  if (opts.allergie > 0) {
    return {
      tipo: "ALLERGIA",
      testo: opts.dettaglioAllergia
        ? `Allergie: ${opts.dettaglioAllergia}`
        : opts.allergie === 1
          ? "1 allergia al tavolo"
          : `${opts.allergie} allergie al tavolo`,
    };
  }
  if (opts.notaImportante) return { tipo: "NOTA", testo: opts.notaImportante };
  return null;
}
