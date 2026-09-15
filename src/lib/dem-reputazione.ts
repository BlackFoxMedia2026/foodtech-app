/**
 * Come si giudica la reputazione di invio, e con quali numeri.
 *
 * ## Perché le soglie stanno in configurazione
 *
 * Chi consegna le email pubblica delle soglie oltre le quali interviene, e
 * **le cambia**. Scriverle nel codice significherebbe inseguire la sua
 * documentazione con una pubblicazione ogni volta, e trovarsi un giorno con un
 * limite nostro più permissivo del suo — cioè con un cliente che viene fermato
 * da fuori mentre le nostre schermate dicono che va tutto bene.
 *
 * Quindi le soglie qui sotto sono **nostre**, dichiarate nell'ambiente e
 * pensate per intervenire *prima*: preferiamo fermare una campagna e
 * spiegarlo, che vedere sospeso un account su cui stanno tutti i clienti.
 *
 * ## Perché un giudizio e non un numero
 *
 * «0,42% di rimbalzi» non dice a un ristoratore se deve preoccuparsi. «Buona»
 * sì. Il numero resta sotto, per chi lo sa leggere e per l'assistenza.
 */

export type LivelloReputazione = "OTTIMA" | "BUONA" | "DA_CONTROLLARE" | "A_RISCHIO" | "SOSPESA";

export type SoglieReputazione = {
  rimbalziAvviso: number;
  rimbalziCritico: number;
  segnalazioniAvviso: number;
  segnalazioniCritico: number;
};

/**
 * I valori per difetto, usati quando l'ambiente non dice altro.
 *
 * Sono prudenti di proposito: un rimbalzo su venticinque è già una lista
 * vecchia, e due segnalazioni di spam su mille sono il punto in cui i provider
 * cominciano a guardare male tutto quello che esce dallo stesso posto.
 */
export const SOGLIE_PREDEFINITE: SoglieReputazione = {
  rimbalziAvviso: 4,
  rimbalziCritico: 8,
  segnalazioniAvviso: 0.2,
  segnalazioniCritico: 0.5,
};

function numeroDaAmbiente(valore: string | undefined, difetto: number): number {
  const n = Number(valore);
  return Number.isFinite(n) && n > 0 ? n : difetto;
}

export function soglie(env: NodeJS.ProcessEnv = process.env): SoglieReputazione {
  return {
    rimbalziAvviso: numeroDaAmbiente(env.DEM_BOUNCE_WARNING, SOGLIE_PREDEFINITE.rimbalziAvviso),
    rimbalziCritico: numeroDaAmbiente(env.DEM_BOUNCE_CRITICAL, SOGLIE_PREDEFINITE.rimbalziCritico),
    segnalazioniAvviso: numeroDaAmbiente(
      env.DEM_COMPLAINT_WARNING,
      SOGLIE_PREDEFINITE.segnalazioniAvviso,
    ),
    segnalazioniCritico: numeroDaAmbiente(
      env.DEM_COMPLAINT_CRITICAL,
      SOGLIE_PREDEFINITE.segnalazioniCritico,
    ),
  };
}

/**
 * Sotto quanti invii una percentuale non significa niente.
 *
 * È la stessa regola delle assenze in `lib/quota.ts`, applicata qui: un
 * rimbalzo su cinque email fa «20% di rimbalzi», che ha la forma di un
 * disastro ed è un indirizzo scritto male. Finché non ci sono abbastanza invii
 * la reputazione non si giudica — si dice che è presto.
 */
export const INVII_MINIMI_PER_GIUDIZIO = 50;

export type MisureReputazione = {
  inviate: number;
  rimbalzi: number;
  segnalazioni: number;
  /** Il dominio è verificato e firma? Senza, il resto conta poco. */
  dominioPronto: boolean;
  /** Gli invii sono già fermi? Allora il giudizio è quello e basta. */
  sospesa: boolean;
};

export type EsitoReputazione = {
  livello: LivelloReputazione;
  /** `null` finché gli invii non bastano a dire qualcosa. */
  tassoRimbalzi: number | null;
  tassoSegnalazioni: number | null;
  /** Vero quando si è superata la soglia oltre la quale si ferma tutto. */
  daFermare: boolean;
  /** Una frase per il cliente. Mai un codice, mai una percentuale da sola. */
  messaggio: string;
};

function tasso(parte: number, base: number): number {
  return base > 0 ? Math.round((parte / base) * 1000) / 10 : 0;
}

/**
 * Il giudizio, dai numeri veri.
 *
 * L'ordine dei casi è l'ordine della gravità, e il primo che corrisponde
 * vince: gli invii fermi battono tutto, un dominio non pronto batte le
 * percentuali, e solo alla fine si guardano i tassi.
 */
export function valutaReputazione(
  m: MisureReputazione,
  s: SoglieReputazione = soglie(),
): EsitoReputazione {
  if (m.sospesa) {
    return {
      livello: "SOSPESA",
      tassoRimbalzi: null,
      tassoSegnalazioni: null,
      daFermare: false,
      messaggio:
        "Gli invii sono temporaneamente sospesi. Le campagne, i contatti e le statistiche restano dove sono.",
    };
  }

  if (!m.dominioPronto) {
    return {
      livello: "DA_CONTROLLARE",
      tassoRimbalzi: null,
      tassoSegnalazioni: null,
      daFermare: false,
      messaggio: "Il dominio di invio non è ancora pronto: completa la configurazione per partire.",
    };
  }

  if (m.inviate < INVII_MINIMI_PER_GIUDIZIO) {
    return {
      livello: "BUONA",
      tassoRimbalzi: null,
      tassoSegnalazioni: null,
      daFermare: false,
      messaggio:
        "Hai inviato ancora poche email: appena ce ne saranno abbastanza potremo dirti come sta andando.",
    };
  }

  const rimbalzi = tasso(m.rimbalzi, m.inviate);
  const segnalazioni = tasso(m.segnalazioni, m.inviate);

  const critico = rimbalzi >= s.rimbalziCritico || segnalazioni >= s.segnalazioniCritico;
  const avviso = rimbalzi >= s.rimbalziAvviso || segnalazioni >= s.segnalazioniAvviso;

  if (critico) {
    return {
      livello: "A_RISCHIO",
      tassoRimbalzi: rimbalzi,
      tassoSegnalazioni: segnalazioni,
      daFermare: true,
      messaggio:
        "Troppe email non stanno arrivando a destinazione. Abbiamo fermato gli invii per proteggere " +
        "il tuo dominio: contattaci e sistemiamo insieme la lista dei contatti.",
    };
  }

  if (avviso) {
    return {
      livello: "DA_CONTROLLARE",
      tassoRimbalzi: rimbalzi,
      tassoSegnalazioni: segnalazioni,
      daFermare: false,
      messaggio:
        "Alcune email non arrivano a destinazione più del normale. Spesso è una lista di contatti " +
        "vecchia: togliere gli indirizzi che non rispondono da mesi rimette tutto a posto.",
    };
  }

  // «Ottima» si dice solo quando è davvero pulita: sopra la metà della soglia
  // di avviso siamo in un territorio che non merita un complimento.
  const ottima = rimbalzi < s.rimbalziAvviso / 2 && segnalazioni < s.segnalazioniAvviso / 2;

  return {
    livello: ottima ? "OTTIMA" : "BUONA",
    tassoRimbalzi: rimbalzi,
    tassoSegnalazioni: segnalazioni,
    daFermare: false,
    messaggio:
      "Il tuo dominio è configurato correttamente e gli invii stanno mantenendo una buona reputazione.",
  };
}

/** Il giudizio come si scrive, in italiano. */
export const ETICHETTA_REPUTAZIONE: Record<LivelloReputazione, string> = {
  OTTIMA: "Ottima",
  BUONA: "Buona",
  DA_CONTROLLARE: "Da controllare",
  A_RISCHIO: "A rischio",
  SOSPESA: "Invii sospesi",
};
