/**
 * La salute della catena di invio, senza parlare con Amazon.
 *
 * Questo modulo riceve una **fotografia** — cosa dice AWS, cosa dice il nostro
 * database — e la traduce in stati leggibili. Sta separato dalle chiamate per
 * la ragione di sempre: così i diciannove casi che contano (destinazione
 * assente, destinazione spenta, evento mancante, permesso negato, nessun invio
 * ancora fatto…) si provano tutti, e nessuno di loro richiede un account AWS.
 *
 * Una regola che attraversa tutto il file: **«non lo so» non è «è rotto»**.
 * Una lettura che fallisce per un permesso mancante, una catena non ancora
 * collegata perché il deploy non c'è stato, un contatore a zero perché non è
 * mai partita una campagna: sono tutti «configurazione incompleta», non
 * errori. Un pannello che grida al guasto quando manca solo un passo di
 * configurazione è un pannello che si smette di guardare.
 */

export type Livello = "OPERATIVO" | "CONFIGURAZIONE_INCOMPLETA" | "ATTENZIONE" | "ERRORE" | "SCONOSCIUTO";

export const TESTO_LIVELLO: Record<Livello, string> = {
  OPERATIVO: "Operativo",
  CONFIGURAZIONE_INCOMPLETA: "Configurazione incompleta",
  ATTENZIONE: "Attenzione",
  ERRORE: "Errore",
  SCONOSCIUTO: "Non verificabile",
};

/**
 * `NON_ATTIVO` è un caso suo, scoperto sul campo: il permesso IAM c'è e Amazon
 * risponde «User not enabled for cost explorer access». Non è un permesso
 * mancante — è Cost Explorer che non è mai stato **attivato** sull'account, o
 * l'accesso degli utenti IAM ai dati di fatturazione che è spento. Si risolve
 * in due clic nella console di fatturazione, non toccando la policy, e
 * confonderlo con un problema di permessi manda a cercare nel posto sbagliato.
 */
export type StatoCostExplorer =
  | "CONNESSO"
  | "DISABILITATO"
  | "NON_ATTIVO"
  | "IN_PREPARAZIONE"
  | "PERMESSO_MANCANTE"
  | "ERRORE";

/** Cosa siamo riusciti a leggere da AWS. `null` = non leggibile. */
export type LettureAws = {
  account: { sandbox: boolean; invioAbilitato: boolean; quota24h: number | null } | null;
  /** I nomi dei tenant esistenti, o `null` se non abbiamo potuto chiederli. */
  tenant: string[] | null;
  configurationSet: string[] | null;
  /** Per insieme di configurazione: la destinazione `foodtech-eventi`. */
  destinazioni: Record<string, DestinazioneAws | null> | null;
  costExplorer: StatoCostExplorer;
};

export type DestinazioneAws = {
  presente: boolean;
  abilitata: boolean;
  eventi: string[];
};

/** Cosa dice il nostro database. */
export type LettureNostre = {
  /** I locali che hanno un dominio di invio configurato: sono quelli che devono avere un tenant. */
  localiAttesi: { venueId: string; nome: string; tenant: string; configurationSet: string }[];
  /** Invii davvero partiti da SES, fuori dalla finestra di tolleranza. */
  inviiSes: number;
  conMessageId: number;
  eventiSend: number;
  /** Invii troppo recenti perché i loro eventi siano già tornati. */
  inviiRecenti: number;
  ultimoEvento: Date | null;
  ultimaRiconciliazione: Date | null;
};

export type Verifica = {
  chiave: string;
  titolo: string;
  livello: Livello;
  valore: string;
  /** Il dettaglio che dice cosa fare, quando c'è qualcosa da fare. */
  nota?: string;
  /** Gli elementi coinvolti, per l'approfondimento (nomi di locali, eventi). */
  elenco?: string[];
};

export type Salute = {
  complessivo: Livello;
  verifiche: Verifica[];
};

/** Quanti eventi possono mancare senza che sia un problema. */
const TOLLERANZA_EVENTI = 0.02;

/**
 * Compone il quadro completo.
 *
 * `eventiAttesi` arriva da chi configura le destinazioni (`EVENTI_ATTESI` in
 * `server/dem/ses.ts`): è la stessa costante, quindi il giorno che si aggiunge
 * un tipo di evento il controllo se ne accorge da solo invece di continuare a
 * dire che va tutto bene.
 */
export function valutaSalute(
  aws: LettureAws,
  nostre: LettureNostre,
  eventiAttesi: readonly string[],
): Salute {
  const verifiche: Verifica[] = [];

  // ── L'account: sandbox o produzione ──────────────────────────────────────
  if (!aws.account) {
    verifiche.push({
      chiave: "account",
      titolo: "Stato account",
      livello: "SCONOSCIUTO",
      valore: "non leggibile",
      nota: "Non siamo riusciti a chiedere lo stato dell'account. Di solito è il permesso ses:GetAccount.",
    });
  } else if (aws.account.sandbox) {
    verifiche.push({
      chiave: "account",
      titolo: "Stato account",
      livello: "CONFIGURAZIONE_INCOMPLETA",
      valore: "Sandbox",
      nota:
        "Amazon SES è ancora in sandbox. Gli invii sono soggetti ai limiti dell'account e ai destinatari " +
        "consentiti da AWS.",
    });
  } else {
    verifiche.push({
      chiave: "account",
      titolo: "Stato account",
      livello: aws.account.invioAbilitato ? "OPERATIVO" : "ERRORE",
      valore: aws.account.invioAbilitato ? "Produzione" : "Produzione, invio sospeso da AWS",
    });
  }

  // ── Tenant: quelli previsti e quelli che esistono ────────────────────────
  const attesi = nostre.localiAttesi;
  if (aws.tenant === null) {
    verifiche.push(nonLeggibile("tenant", "Tenant SES", "ses:ListTenants"));
  } else {
    const mancanti = attesi.filter((l) => !aws.tenant!.includes(l.tenant));
    verifiche.push({
      chiave: "tenant",
      titolo: "Tenant SES",
      livello: attesi.length === 0 ? "CONFIGURAZIONE_INCOMPLETA" : mancanti.length === 0 ? "OPERATIVO" : "ATTENZIONE",
      valore:
        attesi.length === 0
          ? "nessun locale configurato"
          : `${aws.tenant.length} su AWS · ${attesi.length} previsti`,
      nota: mancanti.length > 0 ? `${mancanti.length} tenant mancante${mancanti.length > 1 ? "i" : ""}.` : undefined,
      elenco: mancanti.map((l) => l.nome),
    });
  }

  // ── Insiemi di configurazione ────────────────────────────────────────────
  if (aws.configurationSet === null) {
    verifiche.push(nonLeggibile("configurationSet", "Configuration Set", "ses:ListConfigurationSets"));
  } else {
    const mancanti = attesi.filter((l) => !aws.configurationSet!.includes(l.configurationSet));
    verifiche.push({
      chiave: "configurationSet",
      titolo: "Configuration Set",
      livello: attesi.length === 0 ? "CONFIGURAZIONE_INCOMPLETA" : mancanti.length === 0 ? "OPERATIVO" : "ATTENZIONE",
      valore:
        attesi.length === 0 ? "nessuno previsto" : `${aws.configurationSet.length} su AWS · ${attesi.length} previsti`,
      nota: mancanti.length > 0 ? `${mancanti.length} mancante${mancanti.length > 1 ? "i" : ""}.` : undefined,
      elenco: mancanti.map((l) => l.nome),
    });
  }

  // ── Destinazioni eventi: presente, abilitata, completa ───────────────────
  if (aws.destinazioni === null) {
    verifiche.push(
      nonLeggibile("destinazioni", "Destinazione eventi", "ses:GetConfigurationSetEventDestinations"),
    );
  } else {
    const nomi = Object.keys(aws.destinazioni);
    const assenti = nomi.filter((n) => !aws.destinazioni![n]?.presente);
    const spente = nomi.filter((n) => aws.destinazioni![n]?.presente && !aws.destinazioni![n]!.abilitata);

    /* Tre fatti diversi con tre righe diverse: «non c'è», «c'è ma è spenta» e
       «c'è, è accesa, ma non ascolta tutti gli eventi» si risolvono in tre modi
       e un unico booleano li appiattirebbe. */
    verifiche.push({
      chiave: "destinazione-presente",
      titolo: "Destinazione eventi",
      livello: nomi.length === 0 ? "CONFIGURAZIONE_INCOMPLETA" : assenti.length === 0 ? "OPERATIVO" : "ATTENZIONE",
      valore:
        nomi.length === 0
          ? "nessun insieme da verificare"
          : `${nomi.length - assenti.length} su ${nomi.length} configurate`,
      elenco: assenti,
    });

    if (nomi.length > 0) {
      verifiche.push({
        chiave: "destinazione-abilitata",
        titolo: "Destinazione abilitata",
        livello: spente.length === 0 ? "OPERATIVO" : "ATTENZIONE",
        valore: spente.length === 0 ? "tutte attive" : `${spente.length} disattivata${spente.length > 1 ? "e" : ""}`,
        elenco: spente,
        nota: spente.length > 0 ? "Una destinazione spenta accetta la configurazione e non consegna niente." : undefined,
      });

      const mancanti = eventiMancanti(aws.destinazioni, eventiAttesi);
      verifiche.push({
        chiave: "eventi-attesi",
        titolo: "Eventi configurati",
        livello: mancanti.length === 0 ? "OPERATIVO" : "ATTENZIONE",
        valore: mancanti.length === 0 ? "completi" : `configurazione parziale`,
        elenco: mancanti,
        nota:
          mancanti.length > 0
            ? "Gli eventi mancanti non arriveranno mai: le statistiche che li usano resteranno a zero."
            : undefined,
      });
    }
  }

  // ── Il collegamento fra invii ed eventi ──────────────────────────────────
  verifiche.push(copertura(nostre));
  verifiche.push(pipeline(nostre));
  verifiche.push(webhook(nostre));

  // ── Cost Explorer ────────────────────────────────────────────────────────
  verifiche.push({
    chiave: "costExplorer",
    titolo: "Cost Explorer",
    livello:
      aws.costExplorer === "CONNESSO"
        ? "OPERATIVO"
        : aws.costExplorer === "ERRORE"
          ? "ATTENZIONE"
          : "CONFIGURAZIONE_INCOMPLETA",
    valore: VALORE_COST_EXPLORER[aws.costExplorer],
    nota: NOTA_COST_EXPLORER[aws.costExplorer],
  });

  return { complessivo: complessivo(verifiche), verifiche };
}

const VALORE_COST_EXPLORER: Record<StatoCostExplorer, string> = {
  CONNESSO: "connesso",
  DISABILITATO: "disabilitato",
  NON_ATTIVO: "non attivato sull'account",
  IN_PREPARAZIONE: "dati in preparazione",
  PERMESSO_MANCANTE: "permesso mancante",
  ERRORE: "AWS non risponde",
};

const NOTA_COST_EXPLORER: Record<StatoCostExplorer, string | undefined> = {
  CONNESSO: undefined,
  DISABILITATO: "Si accende con AWS_COST_EXPLORER_ENABLED=1.",
  /* Attivato da poco: permesso e accesso funzionano, i dati non ci sono
     ancora. Si risolve aspettando, ed è l'unico caso in cui non c'è niente da
     fare — quindi va detto, altrimenti si va a cercare un guasto che non c'è. */
  IN_PREPARAZIONE:
    "Cost Explorer è stato appena attivato: Amazon prepara i dati entro 24 ore. Non c'è niente da fare.",
  NON_ATTIVO:
    "Cost Explorer va attivato una volta dalla console di fatturazione, e l'accesso degli utenti IAM ai dati " +
    "di fatturazione va abilitato dall'utente root. I dati compaiono entro 24 ore.",
  PERMESSO_MANCANTE: "Serve ce:GetCostAndUsage sulla policy dell'utente di invio.",
  ERRORE: undefined,
};

/** Quali eventi previsti dal codice non sono configurati su AWS. */
export function eventiMancanti(
  destinazioni: Record<string, DestinazioneAws | null>,
  attesi: readonly string[],
): string[] {
  const presenti = new Set<string>();
  for (const d of Object.values(destinazioni)) {
    if (d?.presente) for (const e of d.eventi) presenti.add(e);
  }
  if (presenti.size === 0) return [];
  return attesi.filter((e) => !presenti.has(e));
}

/**
 * Gli invii sono collegabili ai loro eventi?
 *
 * Senza `providerMessageId` un evento arriva e non si sa di chi è: le
 * statistiche restano vuote mentre le email partono. È il guasto che non dà
 * nessun segnale, ed è per questo che ha una riga sua.
 */
function copertura(n: LettureNostre): Verifica {
  const totale = n.inviiSes + n.inviiRecenti;
  if (totale === 0) {
    return {
      chiave: "message-id",
      titolo: "Collegamento eventi",
      livello: "CONFIGURAZIONE_INCOMPLETA",
      valore: "nessun invio da verificare",
      nota: "Nessun invio SES disponibile per verificare il collegamento eventi.",
    };
  }

  const pct = Math.round((n.conMessageId / totale) * 1000) / 10;
  return {
    chiave: "message-id",
    titolo: "Collegamento eventi",
    livello: pct >= 99 ? "OPERATIVO" : pct > 0 ? "ATTENZIONE" : "ERRORE",
    valore: `${pct}% dei messaggi collegabile`,
    nota:
      pct === 0
        ? "Gli invii vengono effettuati ma non è possibile collegare gli eventi SES ai destinatari."
        : undefined,
  };
}

/**
 * Quanti eventi `SEND` stiamo perdendo.
 *
 * Gli invii molto recenti restano **fuori dal conto**: i loro eventi sono
 * ancora in volo, e contarli come persi farebbe lampeggiare il pannello ogni
 * volta che parte una campagna — cioè proprio quando lo si guarda.
 */
function pipeline(n: LettureNostre): Verifica {
  if (n.inviiSes === 0) {
    return {
      chiave: "pipeline",
      titolo: "Eventi ricevuti",
      livello: "CONFIGURAZIONE_INCOMPLETA",
      valore: n.inviiRecenti > 0 ? "invii troppo recenti per dirlo" : "nessun invio",
    };
  }

  const mancanti = Math.max(0, n.inviiSes - n.eventiSend);
  const copertura = Math.round((Math.min(n.eventiSend, n.inviiSes) / n.inviiSes) * 100_000) / 1000;

  return {
    chiave: "pipeline",
    titolo: "Eventi ricevuti",
    livello:
      n.eventiSend === 0 ? "CONFIGURAZIONE_INCOMPLETA" : mancanti <= n.inviiSes * TOLLERANZA_EVENTI ? "OPERATIVO" : "ATTENZIONE",
    valore: `${copertura}% · ${mancanti} mancanti su ${n.inviiSes}`,
    nota:
      n.eventiSend === 0
        ? "Nessun evento è mai arrivato: la sottoscrizione SNS al webhook probabilmente non esiste ancora."
        : undefined,
  };
}

/** Il webhook ha mai ricevuto qualcosa, e quando. */
function webhook(n: LettureNostre): Verifica {
  if (!n.ultimoEvento) {
    return {
      chiave: "webhook",
      titolo: "Webhook eventi",
      /* Mai collegato **non** è un errore: finché non c'è un dominio pubblico,
         SNS non ha dove consegnare. */
      livello: "CONFIGURAZIONE_INCOMPLETA",
      valore: "nessun evento ricevuto",
    };
  }

  const ore = (Date.now() - n.ultimoEvento.getTime()) / 3_600_000;
  return {
    chiave: "webhook",
    titolo: "Webhook eventi",
    livello: ore <= 48 ? "OPERATIVO" : "ATTENZIONE",
    valore: `ultimo evento ${ore < 1 ? "meno di un'ora fa" : `${Math.round(ore)} ore fa`}`,
    nota: ore > 48 ? "Nessun evento da più di due giorni: da guardare se ci sono stati invii." : undefined,
  };
}

function nonLeggibile(chiave: string, titolo: string, permesso: string): Verifica {
  return {
    chiave,
    titolo,
    livello: "SCONOSCIUTO",
    valore: "non leggibile",
    nota: `Serve il permesso ${permesso} sulla policy dell'utente di invio.`,
  };
}

/**
 * Lo stato complessivo: il peggiore fra quelli trovati, con una precedenza.
 *
 * Un errore vero batte tutto; poi l'attenzione (qualcosa funziona a metà);
 * poi la configurazione incompleta (non è ancora stato fatto un passo); infine
 * «non verificabile», che riguarda noi e non il servizio.
 */
export function complessivo(verifiche: Verifica[]): Livello {
  const livelli = verifiche.map((v) => v.livello);
  if (livelli.includes("ERRORE")) return "ERRORE";
  if (livelli.includes("ATTENZIONE")) return "ATTENZIONE";
  if (livelli.includes("CONFIGURAZIONE_INCOMPLETA")) return "CONFIGURAZIONE_INCOMPLETA";
  if (livelli.includes("SCONOSCIUTO")) return "SCONOSCIUTO";
  return "OPERATIVO";
}

/**
 * L'identificativo dell'account, mascherato.
 *
 * Non è un segreto, ma è un dato che non serve a chi guarda un pannello e che
 * aiuta chi prova a fare danni: compare per intero solo nei log del server.
 */
export function accountMascherato(id: string | undefined): string {
  if (!id || id.length < 6) return "non impostato";
  return `${id.slice(0, 4)}${"*".repeat(Math.max(0, id.length - 6))}${id.slice(-2)}`;
}
