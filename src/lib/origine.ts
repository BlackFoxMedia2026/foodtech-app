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
