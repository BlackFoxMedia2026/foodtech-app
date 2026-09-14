import { randomInt } from "node:crypto";

/**
 * Il numero della tessera fedeltà.
 *
 * ## Perché non bastava quello che c'era
 *
 * Un cliente aveva già un identificativo univoco — il `cuid` della riga
 * `Guest`, `cmtvlxsis002u12zpw54950kr` — e si sarebbe potuto mettere quello
 * dentro il QR. Sarebbe stato sbagliato per due ragioni che non hanno niente a
 * che fare con l'estetica.
 *
 * La prima: è **la chiave primaria di una riga**. Stamparla su una tessera di
 * plastica significa consegnarla a chi la possiede, e da quel momento non si
 * può più cambiare, né revocare a un cliente che ha perso la carta, né
 * rigenerare dopo una fusione di due schede doppie. Un identificatore che è
 * uscito dal database non è più un dettaglio interno.
 *
 * La seconda: non si detta al telefono. Ventiquattro caratteri
 * indistinguibili — con `l`, `1`, `O` e `0` tutti presenti — sono un numero
 * che il cliente non saprà mai leggere ad alta voce, e chi sta alla cassa non
 * saprà mai digitare.
 *
 * ## La forma
 *
 * `TV-4K7P-9RX2`: due gruppi di quattro, alfabeto **Crockford base32** senza
 * `I`, `L`, `O` e `U`. Le prime tre lettere escluse perché si confondono con
 * `1` e `0` sia scritte a mano sia lette da uno schermo storto; la `U` perché
 * è l'unica che, unita alle altre, produce parolacce nei codici generati a
 * caso — è la ragione per cui Crockford la toglie, e vale anche qui.
 *
 * Otto caratteri su un alfabeto di 32 fanno 32^8 ≈ 1,1 × 10^12 combinazioni:
 * per un archivio da qualche decina di migliaia di clienti la probabilità di
 * una collisione resta sotto il miliardesimo, e comunque **non ci si fida del
 * calcolo** — l'unicità la garantisce il vincolo sulla colonna, e chi assegna
 * il codice riprova se il database dice che è già preso.
 *
 * Il prefisso `TV` non è decorazione: distingue un codice tessera da un
 * coupon o da una gift card quando arrivano nello stesso campo di ricerca, e
 * permette di riconoscerlo per quello che è senza interrogare niente.
 */

/** L'alfabeto Crockford: niente `I`, `L`, `O`, `U`. */
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const PREFISSO = "TV";
const LUNGHEZZA = 8;

/**
 * Un codice nuovo, a caso.
 *
 * `randomInt` di `node:crypto` e non `Math.random()`: un numero di tessera è
 * un identificativo che un cliente porta con sé, e un generatore prevedibile
 * permetterebbe di indovinare le tessere degli altri a partire dalla propria.
 * Non è un segreto — da solo non autorizza niente — ma indovinabile e
 * non-segreto sono due cose diverse.
 */
export function generaCodiceTessera(): string {
  let corpo = "";
  for (let i = 0; i < LUNGHEZZA; i++) corpo += ALFABETO[randomInt(ALFABETO.length)];
  return `${PREFISSO}-${corpo.slice(0, 4)}-${corpo.slice(4)}`;
}

/**
 * Come si scrive un codice quando qualcuno lo digita storto.
 *
 * Chi legge una tessera scrive `tv 4k7p 9rx2`, oppure incolla il risultato di
 * uno scanner che ha aggiunto uno spazio in fondo. Tutte queste sono lo
 * stesso codice, e la ricerca deve trovarlo: maiuscolo, senza separatori,
 * e con le quattro lettere ambigue riportate alla cifra che somigliano —
 * `O` è uno zero, `I` e `L` sono un uno. È la regola di Crockford, e serve
 * esattamente al caso del cliente che detta il numero al telefono.
 */
export function normalizzaCodiceTessera(raw: string): string {
  const pulito = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return pulito.startsWith(PREFISSO) ? pulito.slice(PREFISSO.length) : pulito;
}

/**
 * Vero se questo testo **sembra** un numero di tessera.
 *
 * Serve alla ricerca dell'elenco ospiti: `TV-4K7P-9RX2` va cercato fra i
 * codici, `Elena` fra i nomi. Senza questa distinzione ogni ricerca
 * interrogherebbe anche la colonna dei codici — o, peggio, un cliente che si
 * chiama come un pezzo di codice non si troverebbe più.
 */
export function sembraCodiceTessera(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 4) return false;
  // Col prefisso basta quello: nessun nome comincia per «TV-».
  if (/^tv[\s-]?/i.test(t)) return true;
  // Senza prefisso serve la forma piena, altrimenti «Anna» — quattro
  // caratteri dell'alfabeto — verrebbe presa per mezza tessera.
  return normalizzaCodiceTessera(t).length === LUNGHEZZA && /^[0-9A-Z\s-]+$/i.test(t);
}

/** Come si mostra: sempre a gruppi, sempre col prefisso. */
export function formattaCodiceTessera(codice: string): string {
  const corpo = normalizzaCodiceTessera(codice);
  if (corpo.length !== LUNGHEZZA) return codice;
  return `${PREFISSO}-${corpo.slice(0, 4)}-${corpo.slice(4)}`;
}
