import { canali, contrasto, luminanza } from "./colore-leggibile";
import { corniceConTesto, MAX_TESTO_CORNICE, type DesignQr } from "./qr-disegno";

/**
 * Il controllo che decide se un QR si può salvare.
 *
 * Un editor di QR ha un difetto che nessun altro editor ha: **il risultato non
 * si verifica guardandolo**. Un colore troppo chiaro, un logo un po' grande,
 * un fondo scuro con moduli chiari — sul monitor sembrano tutti codici. Il
 * guasto si scopre due settimane dopo, al tavolo, con il cliente che gira il
 * cartoncino verso la luce e poi chiama il cameriere.
 *
 * Quindi la verifica non è un consiglio: è un controllo, e quello che è
 * **grave** ferma il salvataggio. Il resto si dice e si lascia decidere.
 *
 * Tutto quello che c'è qui è puro: nessun colore del prodotto, nessuna
 * traduzione presa da fuori, e si prova senza aprire un browser.
 */

export type Avvertenza = {
  chiave: string;
  messaggio: string;
  /** Grave: il codice probabilmente non si legge. Blocca il salvataggio. */
  grave: boolean;
};

/**
 * Le soglie di contrasto, e perché non sono quelle del testo.
 *
 * Un lettore di QR non legge le lettere: cerca il confine fra chiaro e scuro
 * modulo per modulo, e ci riesce con molto meno delle 4,5 : 1 che servono a
 * un occhio su una parola. La letteratura e le prove sul campo convergono
 * attorno a 3 : 1 come limite sotto il quale i telefoni cominciano a
 * rinunciare, con i 4 : 1 come la soglia oltre cui non ci pensa più nessuno —
 * anche con poca luce, anche con una stampa che ha perso un po' di nero.
 */
export const CONTRASTO_MINIMO = 3;
export const CONTRASTO_TRANQUILLO = 4;

/** Oltre questa lunghezza il codice diventa una griglia fittissima. */
export const CONTENUTO_MASSIMO = 900;

export function controllaQr(opts: {
  design: DesignQr;
  contenuto: string;
  /** Quanti moduli per lato ha il codice, se è già stato calcolato. */
  moduli?: number;
}): Avvertenza[] {
  const { design, contenuto } = opts;
  const avvisi: Avvertenza[] = [];

  if (!contenuto.trim()) {
    avvisi.push({
      chiave: "vuoto",
      messaggio: "Manca la destinazione: il QR non porta ancora da nessuna parte.",
      grave: true,
    });
  }

  if (contenuto.length > CONTENUTO_MASSIMO) {
    avvisi.push({
      chiave: "lungo",
      messaggio:
        "Il contenuto è molto lungo: il codice diventa così fitto che stampato in piccolo non si legge. Prova con un link più corto.",
      grave: true,
    });
  }

  /*
    Col fondo trasparente il contrasto non è più una cosa che si può misurare
    qui: il secondo colore non lo scegliamo noi, lo sceglie la superficie su
    cui il codice finirà. Continuare a confrontarlo con `coloreSfondo`
    darebbe un numero che non corrisponde a niente — e, peggio, potrebbe
    **bloccare il salvataggio** per un accostamento che non verrà mai
    stampato. Quindi il controllo si sospende e al suo posto resta la sola
    cosa vera da dire: la responsabilità è passata a chi impagina.
  */
  if (design.sfondoTrasparente) {
    avvisi.push({
      chiave: "trasparente",
      messaggio:
        "Lo sfondo è trasparente: il contrasto lo decide la superficie sotto. Appoggialo su un fondo pieno e molto più chiaro del codice, non su una foto.",
      grave: false,
    });
    if (design.logoUrl && design.posizioneLogo === "centro") {
      avvisi.push({
        chiave: "logo-senza-riparo",
        messaggio:
          "Senza sfondo il logo al centro non ha il riquadro chiaro che lo stacca dai moduli: provalo col telefono prima di stamparlo.",
        grave: false,
      });
    }
  } else {
    const rapporto = contrasto(design.coloreQr, design.coloreSfondo);
    if (rapporto === null) {
      avvisi.push({ chiave: "colore", messaggio: "Uno dei due colori non è valido.", grave: true });
    } else if (rapporto < CONTRASTO_MINIMO) {
      avvisi.push({
        chiave: "contrasto",
        messaggio: "Questa combinazione potrebbe rendere il QR difficile da scansionare.",
        grave: true,
      });
    } else if (rapporto < CONTRASTO_TRANQUILLO) {
      avvisi.push({
        chiave: "contrasto-basso",
        messaggio:
          "I due colori si distinguono poco: con poca luce, o su carta opaca, qualche telefono potrebbe faticare.",
        grave: false,
      });
    }

    /* Il codice invertito: moduli chiari su fondo scuro.
       Non è un errore — molti telefoni recenti lo leggono — ma i lettori più
       vecchi e diverse casse cercano il nero sul bianco e basta. Si dice, non si
       vieta: un QR chiaro su fondo scuro è anche una scelta grafica legittima. */
    const qr = canali(design.coloreQr);
    const sfondo = canali(design.coloreSfondo);
    if (qr && sfondo && luminanza(qr) > luminanza(sfondo)) {
      avvisi.push({
        chiave: "invertito",
        messaggio:
          "Il codice è chiaro su fondo scuro: i telefoni recenti lo leggono, i lettori più vecchi no. Se finisce su uno scontrino, meglio invertire.",
        grave: false,
      });
    }
  }

  if (design.logoUrl && design.posizioneLogo === "centro") {
    avvisi.push({
      chiave: "logo-centro",
      messaggio:
        "Con il logo al centro il codice si stampa più fitto per reggere la copertura: controlla che resti nitido alla misura che userai.",
      grave: false,
    });
  }

  if (corniceConTesto(design.cornice) && design.testoCornice.trim().length > MAX_TESTO_CORNICE) {
    avvisi.push({
      chiave: "testo-lungo",
      messaggio: `L'invito è più lungo di ${MAX_TESTO_CORNICE} caratteri: sulla cornice verrà tagliato.`,
      grave: false,
    });
  }

  /* Un codice con tanti moduli stampato piccolo è illeggibile: sopra la
     versione 20 circa (97 moduli) conviene dirlo prima della stampa. */
  if (opts.moduli && opts.moduli > 97) {
    avvisi.push({
      chiave: "denso",
      messaggio: "Il codice è molto fitto: stampalo almeno a 5 cm di lato, altrimenti i telefoni non lo prendono.",
      grave: false,
    });
  }

  return avvisi;
}

/** Si può salvare? */
export function qrSalvabile(avvisi: Avvertenza[]): boolean {
  return !avvisi.some((a) => a.grave);
}
