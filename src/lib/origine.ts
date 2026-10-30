/**
 * L'indirizzo da cui il prodotto è raggiunto in questo momento.
 *
 * Lo stesso locale si apre su domini diversi — l'anteprima di una modifica, il
 * dominio del prodotto, un dominio suo — e un QR **stampato** deve puntare a
 * quello da cui lo si sta creando: un codice nato in anteprima e appeso al
 * tavolo porterebbe i clienti su un'anteprima, per sempre.
 *
 * Si legge dalla richiesta e non da una variabile d'ambiente per questo
 * motivo, e la sola cosa che si fa con questa stringa è comporre indirizzi
 * pubblici.
 */
export function origineDa(h: { get(nome: string): string | null }): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocollo =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocollo}://${host}`;
}

/**
 * L'indirizzo per i link che portano **un segreto**: reimpostare una
 * password, accettare un invito.
 *
 * Qui la regola di `origineDa` si rovescia. L'intestazione `Host` (e ancora di
 * più `X-Forwarded-Host`) la scrive chi fa la richiesta: chi chiede il
 * recupero per l'email di un altro con `Host: sito-mio.it` farebbe arrivare
 * alla vittima un link vero, con un token vero, che punta a casa sua — e il
 * token lo leggerebbe lui al primo clic. Quindi vale `NEXT_PUBLIC_APP_URL`,
 * che si scrive solo avendo accesso all'infrastruttura; la richiesta resta il
 * ripiego per quando la variabile manca (lo sviluppo in locale).
 *
 * Il prezzo: in un'anteprima con la variabile di produzione il link porta in
 * produzione. Per un segreto è il verso giusto in cui sbagliare.
 */
export function origineFidata(h: { get(nome: string): string | null }): string {
  const fissa = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fissa) return fissa.replace(/\/+$/, "");
  return origineDa(h);
}
