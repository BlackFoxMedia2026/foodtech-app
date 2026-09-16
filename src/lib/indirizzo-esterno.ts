/**
 * Quali indirizzi il server può andare a prendere per conto di qualcun altro.
 *
 * Il logo di un QR è un indirizzo che arriva dal disegno, cioè da qualcosa che
 * si può scrivere in una richiesta. Senza un filtro, una funzione che lo scarica
 * diventa un modo per far bussare il nostro server a indirizzi che solo lui
 * può raggiungere — il pannello del fornitore, un servizio interno, il
 * metadata service della macchina.
 *
 * Si accetta quindi **solo https pubblico**, e si escludono i nomi e gli
 * indirizzi che portano dentro la rete.
 *
 * Non copre tutto: un nome pubblico può risolvere a un indirizzo privato, e per
 * chiudere anche quello servirebbe risolvere il nome e controllare l'indirizzo
 * prima di connettersi. Chiude i casi che si scrivono a mano, che sono quelli
 * che succedono, e il danno residuo è una richiesta GET senza credenziali.
 */
export function indirizzoEsternoAmmesso(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  /* Gli indirizzi IPv6 arrivano fra parentesi quadre: si escludono tutti
     invece di enumerare gli intervalli riservati, che sono molti e si
     scrivono in troppi modi diversi. */
  if (host.startsWith("[")) return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  return true;
}
