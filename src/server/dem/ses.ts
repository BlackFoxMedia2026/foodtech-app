import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateEmailIdentityCommand,
  CreateTenantCommand,
  CreateTenantResourceAssociationCommand,
  GetAccountCommand,
  GetEmailIdentityCommand,
  GetTenantCommand,
  PutEmailIdentityMailFromAttributesCommand,
  SESv2Client,
  type GetEmailIdentityResponse,
} from "@aws-sdk/client-sesv2";
import { logAttenzione, logErrore } from "@/lib/observability";

/**
 * L'infrastruttura di invio, e il muro che la tiene nascosta.
 *
 * Questo è **l'unico** file del progetto che sa che le email escono da Amazon.
 * Tutto quello che sta sopra — schermate, modelli, statistiche, reputazione —
 * parla di «dominio di invio», «invii disponibili», «reputazione»: parole che
 * un ristoratore capisce e che non cambiano se un domani l'infrastruttura
 * cambia. Il confine è una scelta di prodotto prima che tecnica: il cliente ha
 * comprato Foodtech, non un pannello AWS con un vestito sopra.
 *
 * Conseguenza pratica, e va rispettata: **nessun messaggio d'errore di Amazon
 * arriva all'interfaccia**. Qui dentro si traduce, o si registra nei log per
 * chi fa assistenza. `MessageRejected` non significa niente per chi ha un
 * ristorante.
 *
 * ## Le chiavi
 *
 * Solo server. Non esiste un percorso per cui una di queste variabili
 * raggiunga il browser: non sono `NEXT_PUBLIC_`, e questo file non viene mai
 * importato da un componente client (lo garantisce l'import di `@aws-sdk`, che
 * in un client component farebbe fallire la compilazione).
 *
 * ## Perché un tenant per cliente
 *
 * Amazon permette di dividere un account in spazi separati. Con uno spazio per
 * ristorante, la lista dei soppressi, le metriche e lo stato di invio di uno
 * non toccano gli altri: un indirizzo che rimbalza per il Ristorante A non
 * smette di ricevere le email del Ristorante B. **Non** è una garanzia
 * completa — la reputazione dell'account resta condivisa, ed è per questo che
 * esistono anche le protezioni applicative in `reputazione.ts`.
 */

/** La funzione è accesa? Senza, il modulo esiste ma non parla con nessuno. */
export function sesAttivo(): boolean {
  return process.env.DEM_SES_ENABLED === "1" && !!process.env.AWS_REGION;
}

let cliente: SESv2Client | null = null;

/**
 * Il client, o `null` se questa installazione non ha l'invio configurato.
 *
 * Niente eccezioni al caricamento del modulo: mezzo prodotto lo importa, e in
 * sviluppo non c'è nessuna chiave AWS. Le schermate dicono «non ancora
 * configurato» invece di rompersi, che è la differenza fra una funzione spenta
 * e un guasto.
 *
 * Le credenziali non si passano a mano: le trova la catena standard dell'SDK,
 * così in produzione si può usare un ruolo IAM — che è meglio di una chiave
 * scritta in una variabile — senza cambiare una riga qui.
 */
export function sesOpzionale(): SESv2Client | null {
  if (!sesAttivo()) return null;
  if (!cliente) cliente = new SESv2Client({ region: process.env.AWS_REGION });
  return cliente;
}

export class InvioNonConfigurato extends Error {
  readonly code = "dem_sending_not_configured";
  constructor() {
    super("L'invio delle newsletter non è ancora configurato su questa installazione.");
    this.name = "InvioNonConfigurato";
  }
}

export function sesRichiesto(): SESv2Client {
  const c = sesOpzionale();
  if (!c) throw new InvioNonConfigurato();
  return c;
}

/**
 * Il nome dello spazio di un locale, e quello del suo insieme di
 * configurazione.
 *
 * Si **ricava** dall'identificativo del locale invece di essere salvato e
 * riletto: ritrovare lo spazio di un cliente non deve dipendere da una riga
 * scritta bene. Se la riga si perde, il nome è ancora calcolabile.
 *
 * Gli identificativi del progetto sono `cuid` — solo lettere minuscole e cifre
 * — quindi il nome risultante è già dentro i caratteri ammessi. Il taglio a 64
 * è il limite del servizio.
 */
export function nomeSpazio(venueId: string): string {
  return `foodtech-${venueId}`.slice(0, 64);
}

export function nomeInsiemeConfigurazione(venueId: string): string {
  return `foodtech-${venueId}`.slice(0, 64);
}

/**
 * L'account può scrivere a chiunque, o solo a indirizzi verificati?
 *
 * In prova Amazon tiene gli account in una modalità ristretta in cui si può
 * scrivere solo a destinatari verificati a mano. Chiederlo — invece di dare
 * per scontato che sia finita — è la differenza fra una campagna che parte e
 * una che viene rifiutata destinatario per destinatario, con il credito già
 * scalato.
 */
export async function inviiVersoChiunque(): Promise<boolean | null> {
  const ses = sesOpzionale();
  if (!ses) return null;
  try {
    const account = await ses.send(new GetAccountCommand({}));
    return account.ProductionAccessEnabled ?? false;
  } catch (err) {
    logAttenzione("dem.ses.account_non_letto", { errore: String(err) });
    return null;
  }
}

/**
 * Prepara lo spazio isolato di un locale.
 *
 * Rieseguibile: se lo spazio esiste già non se ne crea un altro e non è un
 * errore. È la regola di tutto questo file — ogni funzione descrive uno stato
 * desiderato, perché queste chiamate stanno dentro un lavoro in coda che può
 * essere ripreso in qualunque momento.
 *
 * La soppressione è **per spazio** e non per account: un indirizzo che
 * rimbalza per un ristorante non deve sparire dalle liste di tutti gli altri.
 * I due motivi sono quelli che contano davvero — un indirizzo che non esiste e
 * una segnalazione di spam — e sono anche gli unici due per cui continuare a
 * scrivere fa danno alla reputazione di tutti.
 */
export async function assicuraSpazio(venueId: string): Promise<string> {
  const ses = sesRichiesto();
  const nome = nomeSpazio(venueId);

  try {
    await ses.send(new GetTenantCommand({ TenantName: nome }));
    return nome;
  } catch {
    // Non c'è: si crea. Un errore di lettura che non fosse «non esiste» si
    // ripresenterebbe subito qui sotto, con il suo messaggio.
  }

  try {
    await ses.send(
      new CreateTenantCommand({
        TenantName: nome,
        SuppressionAttributes: {
          SuppressionScope: "TENANT",
          SuppressedReasons: ["BOUNCE", "COMPLAINT"],
        },
        Tags: [{ Key: "foodtech-venue", Value: venueId }],
      }),
    );
  } catch (err) {
    // Creato da un tentativo precedente fra la lettura e la scrittura: va bene
    // così, ed è proprio il caso per cui queste funzioni sono rieseguibili.
    if (!giaEsiste(err)) throw err;
  }

  return nome;
}

/**
 * Prepara l'insieme di configurazione del locale e lo collega al suo spazio.
 *
 * Serve a due cose: ricevere gli eventi (consegne, aperture, click, rimbalzi)
 * distinti per cliente, e poter spegnere gli invii di **uno solo** senza
 * toccare gli altri.
 */
export async function assicuraInsiemeConfigurazione(venueId: string): Promise<string> {
  const ses = sesRichiesto();
  const nome = nomeInsiemeConfigurazione(venueId);

  try {
    await ses.send(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: nome,
        ReputationOptions: { ReputationMetricsEnabled: true },
        SendingOptions: { SendingEnabled: true },
        Tags: [{ Key: "foodtech-venue", Value: venueId }],
      }),
    );
  } catch (err) {
    if (!giaEsiste(err)) throw err;
  }

  await collegaEventi(nome);
  await associaAlloSpazio(venueId, arnInsiemeConfigurazione(nome));
  return nome;
}

/**
 * Dove finiscono gli eventi di consegna.
 *
 * Senza questa parte le statistiche non esistono: Amazon accetta il messaggio
 * e poi non ci racconta più niente. Gli eventi arrivano a un argomento SNS che
 * li rigira al nostro indirizzo — la scelta è quella perché non richiede
 * infrastruttura in più, e perché una consegna HTTP firmata la sappiamo già
 * verificare.
 *
 * `RENDERING_FAILURE` e `SUBSCRIPTION` sono nell'elenco anche se oggi non li
 * mostriamo: costano zero da ricevere, e il giorno che servono i dati ci sono
 * già invece di cominciare da quel giorno.
 */
export const EVENTI_ATTESI = [
  "SEND",
  "DELIVERY",
  "OPEN",
  "CLICK",
  "BOUNCE",
  "COMPLAINT",
  "REJECT",
  "DELIVERY_DELAY",
  "RENDERING_FAILURE",
  "SUBSCRIPTION",
] as const;

async function collegaEventi(insieme: string): Promise<void> {
  const topic = process.env.SES_EVENT_SNS_TOPIC_ARN;
  if (!topic) {
    logAttenzione("dem.ses.eventi_non_collegati", { insieme });
    return;
  }

  const ses = sesRichiesto();
  try {
    await ses.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: insieme,
        EventDestinationName: "foodtech-eventi",
        EventDestination: {
          Enabled: true,
          SnsDestination: { TopicArn: topic },
          MatchingEventTypes: [...EVENTI_ATTESI],
        },
      }),
    );
  } catch (err) {
    if (!giaEsiste(err)) throw err;
  }
}

async function associaAlloSpazio(venueId: string, arn: string): Promise<void> {
  const ses = sesRichiesto();
  try {
    await ses.send(
      new CreateTenantResourceAssociationCommand({
        TenantName: nomeSpazio(venueId),
        ResourceArn: arn,
      }),
    );
  } catch (err) {
    if (!giaEsiste(err)) throw err;
  }
}

/** L'ARN di una risorsa, composto dai pezzi che l'ambiente già conosce. */
function arnInsiemeConfigurazione(nome: string): string {
  return arnRisorsa(`configuration-set/${nome}`);
}

function arnIdentita(dominio: string): string {
  return arnRisorsa(`identity/${dominio}`);
}

function arnRisorsa(coda: string): string {
  const regione = process.env.AWS_REGION ?? "";
  const account = process.env.AWS_ACCOUNT_ID ?? "";
  return `arn:aws:ses:${regione}:${account}:${coda}`;
}

export type RecordDns = {
  tipo: "CNAME" | "MX" | "TXT";
  nome: string;
  valore: string;
  /** La priorità, che serve solo agli MX. */
  priorita?: number;
};

export type IdentitaCreata = {
  /** I record che il cliente deve mettere nel suo DNS. */
  record: RecordDns[];
};

/**
 * Registra il dominio di invio e restituisce i record da configurare.
 *
 * I record li genera il servizio e non li inventiamo noi: sono chiavi
 * crittografiche, e una stringa scritta a mano che «sembra giusta» produce un
 * dominio che risulta verificato e firma male.
 *
 * Il ritorno è già nella forma che l'interfaccia mostra in tabella: tipo,
 * nome, valore. Nient'altro — quello che il cliente deve fare è copiare tre
 * righe nel pannello del suo fornitore.
 */
export async function registraDominio(
  venueId: string,
  dominioInvio: string,
  dominioRitorno: string,
): Promise<IdentitaCreata> {
  const ses = sesRichiesto();
  const insieme = await assicuraInsiemeConfigurazione(venueId);

  let dkim: string[] = [];
  try {
    const creata = await ses.send(
      new CreateEmailIdentityCommand({
        EmailIdentity: dominioInvio,
        ConfigurationSetName: insieme,
        Tags: [{ Key: "foodtech-venue", Value: venueId }],
      }),
    );
    dkim = creata.DkimAttributes?.Tokens ?? [];
  } catch (err) {
    if (!giaEsiste(err)) throw err;
    // Esisteva già: le chiavi sono le sue, e si rileggono.
    const esistente = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: dominioInvio }));
    dkim = esistente.DkimAttributes?.Tokens ?? [];
  }

  await associaAlloSpazio(venueId, arnIdentita(dominioInvio));

  /*
    Il dominio del Return-Path, separato da quello del mittente.

    È la parte che quasi tutti sbagliano. Il Return-Path richiede un record MX,
    e un MX dice al mondo «la posta per questo nome la riceve questo server».
    Metterlo sullo stesso nome da cui parte la newsletter significa che quel
    nome non potrà mai ricevere posta per nient'altro — e se il cliente un
    domani ci appoggia una casella, si rompono entrambe le cose.

    `USE_DEFAULT_VALUE` in caso di guasto: se il record MX sparisce, le email
    continuano a partire con il Return-Path predefinito invece di essere
    rifiutate. Una configurazione DNS rotta non deve fermare le campagne.
  */
  await ses.send(
    new PutEmailIdentityMailFromAttributesCommand({
      EmailIdentity: dominioInvio,
      MailFromDomain: dominioRitorno,
      BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
    }),
  );

  const regione = process.env.AWS_REGION ?? "";
  const record: RecordDns[] = [
    ...dkim.map((token) => ({
      tipo: "CNAME" as const,
      nome: `${token}._domainkey.${dominioInvio}`,
      valore: `${token}.dkim.amazonses.com`,
    })),
    {
      tipo: "MX",
      nome: dominioRitorno,
      valore: `feedback-smtp.${regione}.amazonses.com`,
      priorita: 10,
    },
    {
      tipo: "TXT",
      nome: dominioRitorno,
      valore: "v=spf1 include:amazonses.com ~all",
    },
  ];

  return { record };
}

export type StatoIdentita = {
  verificato: boolean;
  dkim: "OK" | "PENDING" | "FAILED" | "UNKNOWN";
  /** Il Return-Path: verificato quando l'MX e l'SPF sono a posto. */
  ritorno: "OK" | "PENDING" | "FAILED" | "UNKNOWN";
};

/**
 * Com'è messo il dominio, adesso, secondo chi spedisce.
 *
 * Il risultato non si inventa e non si ricorda: si chiede ogni volta. Un
 * «verificato» salvato in tabella e mai più controllato è esattamente il modo
 * in cui un cliente scopre che le sue campagne non partono più da tre
 * settimane.
 */
export async function statoDominio(dominio: string): Promise<StatoIdentita | null> {
  const ses = sesOpzionale();
  if (!ses) return null;
  try {
    const r = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: dominio }));
    return leggiStato(r);
  } catch (err) {
    logAttenzione("dem.ses.identita_non_letta", { dominio, errore: String(err) });
    return null;
  }
}

function leggiStato(r: GetEmailIdentityResponse): StatoIdentita {
  const dkim = r.DkimAttributes?.Status;
  const ritorno = r.MailFromAttributes?.MailFromDomainStatus;
  return {
    verificato: r.VerifiedForSendingStatus ?? false,
    dkim: dkim === "SUCCESS" ? "OK" : dkim === "PENDING" ? "PENDING" : dkim ? "FAILED" : "UNKNOWN",
    ritorno:
      ritorno === "SUCCESS" ? "OK" : ritorno === "PENDING" ? "PENDING" : ritorno ? "FAILED" : "UNKNOWN",
  };
}

/**
 * «Esiste già» non è un errore.
 *
 * Amazon lo dice con un'eccezione, e queste funzioni vengono rieseguite per
 * costruzione: distinguere questo caso da un guasto vero è ciò che permette di
 * riprovare un'operazione senza guardare prima se serve.
 */
function giaEsiste(err: unknown): boolean {
  const nome = (err as { name?: string } | null)?.name ?? "";
  return nome === "AlreadyExistsException" || nome === "ConflictException";
}

/**
 * Il messaggio tecnico, per i log, e mai per il cliente.
 *
 * `AccessDeniedException` o `MessageRejected` su una schermata sono una
 * confessione: dicono a un ristoratore che qualcosa che non capisce si è
 * rotto, e non gli dicono cosa fare. Restano qui.
 */
export function registraErroreSes(
  evento: string,
  err: unknown,
  dati: Record<string, string | number | boolean | null | undefined> = {},
): void {
  logErrore(`dem.ses.${evento}`, err, dati);
}
