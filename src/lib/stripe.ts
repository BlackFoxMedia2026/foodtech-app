import Stripe from "stripe";

/**
 * L'unico punto da cui Tavolo parla con Stripe.
 *
 * ## Perché Connect, e non un conto solo
 *
 * Gli incassi di una cena appartengono al ristorante che l'ha servita. Se
 * arrivassero sull'account di Tavolo, la piattaforma diventerebbe
 * l'incassante legale di ogni coperto dei suoi clienti: soldi altrui sul
 * proprio conto, con gli obblighi antiriciclaggio e fiscali che ne derivano, e
 * il dovere di ridistribuirli. È un mestiere diverso da quello di vendere un
 * gestionale.
 *
 * Quindi **addebiti diretti** sull'account del locale: la carta del cliente
 * viene addebitata da Stripe *per conto del ristorante*, il denaro non passa
 * mai da Tavolo, e sull'estratto conto del cliente compare il nome del locale
 * — che è anche l'unica cosa sensata da far comparire, visto che è lì che ha
 * cenato.
 *
 * Nel database di Tavolo finisce **solo** `Venue.stripeAccountId`, che non è un
 * segreto. Le chiavi del ristorante restano da Stripe: non le vediamo, non le
 * salviamo, e un accesso in lettura a questo database non permette di muovere
 * un euro di nessuno.
 *
 * ## Perché può non esserci
 *
 * `STRIPE_SECRET_KEY` è dichiarata nel progetto da mesi ed è **vuota**: i
 * pagamenti non erano mai stati implementati. Quindi qui non si esplode al
 * caricamento del modulo — mezza applicazione lo importerebbe e morirebbe in
 * fase di build — ma si risponde «non configurato» a chi chiede. Le schermate
 * lo dicono invece di rompersi, che è la differenza fra una funzione spenta e
 * un guasto.
 */

const CHIAVE = process.env.STRIPE_SECRET_KEY ?? "";

/**
 * La versione delle API è fissata a mano e non lasciata al valore predefinito
 * dell'SDK: così aggiornare il pacchetto non cambia, da solo, il formato delle
 * risposte su cui il webhook fa affidamento.
 */
const API_VERSION = "2025-02-24.acacia" as const;

let cliente: Stripe | null = null;

/** Vero se questa installazione ha davvero delle chiavi. */
export function stripeConfigurato(): boolean {
  return CHIAVE.length > 0;
}

/** Il client, o `null` se Stripe non è configurato. */
export function stripeOpzionale(): Stripe | null {
  if (!stripeConfigurato()) return null;
  if (!cliente) {
    cliente = new Stripe(CHIAVE, {
      apiVersion: API_VERSION,
      // Stripe lo mostra nel proprio registro: quando un pagamento va storto,
      // si vede da dove arrivava.
      appInfo: { name: "Tavolo", url: "https://tavolo.app" },
      // Un problema di rete non deve lasciare il cliente davanti a una
      // rotella: si riprova due volte e poi si dice che non si è riusciti.
      maxNetworkRetries: 2,
      timeout: 15_000,
    });
  }
  return cliente;
}

export class StripeNonConfigurato extends Error {
  constructor() {
    super("Stripe non è configurato su questa installazione");
    this.name = "StripeNonConfigurato";
  }
}

/** Il client, o un errore parlante. Per chi non può proseguire senza. */
export function stripeRichiesto(): Stripe {
  const s = stripeOpzionale();
  if (!s) throw new StripeNonConfigurato();
  return s;
}

/**
 * Le opzioni che dirottano una chiamata sull'account del ristorante.
 *
 * Si passano a **ogni** chiamata che riguarda il denaro di un locale. La
 * dimenticanza non è un errore che si vede: la chiamata riesce, e crea la
 * sessione di pagamento sull'account della piattaforma — cioè incassa i soldi
 * sul conto sbagliato, in silenzio. Per questo esiste questa funzione invece
 * di scrivere l'opzione a mano nei punti di chiamata: è una cosa sola da
 * cercare quando si controlla che non manchi da nessuna parte.
 */
export function perConto(stripeAccountId: string): Stripe.RequestOptions {
  return { stripeAccount: stripeAccountId };
}

/**
 * La chiave d'idempotenza di Stripe.
 *
 * Due richieste identiche con la stessa chiave creano **una** sessione di
 * pagamento. Serve al doppio tocco sul pulsante «paga» — che su un telefono
 * lento succede sempre — e alla richiesta ritentata dopo un errore di rete di
 * cui non si sa se sia arrivata.
 */
export function chiaveIdempotenza(paymentId: string): Stripe.RequestOptions {
  return { idempotencyKey: `tavolo_pay_${paymentId}` };
}

/**
 * Come ha pagato il cliente, in una parola da mostrare al ristoratore.
 *
 * Stripe lo racconta in una struttura annidata che cambia forma a seconda del
 * metodo; qui si riduce a `card`, `apple_pay`, `link`… — quanto basta a
 * riconciliare con l'estratto conto senza portarsi dietro l'oggetto intero.
 */
export function metodoLeggibile(
  pm: Stripe.PaymentMethod | Stripe.Charge.PaymentMethodDetails | null | undefined,
): string | null {
  if (!pm) return null;
  const tipo = (pm as { type?: string }).type;
  if (!tipo) return null;
  // Apple Pay e Google Pay sono carte con un portafoglio davanti: Stripe le
  // marca `card` e mette il portafoglio dentro. Al ristoratore interessa il
  // portafoglio, perché è quello che il cliente ricorda di aver usato.
  const carta = (pm as { card?: { wallet?: { type?: string } | null } }).card;
  const wallet = carta?.wallet?.type;
  return (wallet ?? tipo).slice(0, 40);
}
