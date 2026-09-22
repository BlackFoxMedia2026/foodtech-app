/**
 * «Buongiorno», «Buon pomeriggio», «Buonasera».
 *
 * Una funzione per tre parole sembra troppo, e non lo è per due motivi.
 *
 * Il primo: l'ora va letta **nel fuso del locale**, non del server. Un server
 * a UTC saluterebbe con «buongiorno» un cameriere italiano alle undici di
 * sera — la stessa classe di errore che `lib/venue-time.ts` esiste per
 * togliere di mezzo, e che qui sarebbe la prima cosa che si legge aprendo
 * l'app.
 *
 * Il secondo: i confini sono una scelta e vanno scritti dove si possono
 * discutere. Le 18 e non le 17 perché in un ristorante «sera» comincia quando
 * comincia il servizio; le 5 e non le 6 perché chi apre per le colazioni è già
 * in piedi da un pezzo e «buonanotte» sarebbe una presa in giro.
 */
export function saluto(timeZone: string, adesso = new Date()): string {
  const ora = Number(
    new Intl.DateTimeFormat("it-IT", { timeZone, hour: "2-digit", hour12: false }).format(adesso),
  );
  if (ora >= 18 || ora < 5) return "Buonasera";
  if (ora >= 13) return "Buon pomeriggio";
  return "Buongiorno";
}

/**
 * «Buonasera, Luca».
 *
 * Il nome proprio e non il cognome: è come si chiamano fra loro in sala, ed è
 * l'unico posto del prodotto in cui il tono è quello di una persona che parla
 * a un'altra. Senza nome resta il saluto secco, che è sempre meglio di
 * «Buonasera, ».
 */
export function salutoCon(timeZone: string, nome: string | null, adesso = new Date()): string {
  const s = saluto(timeZone, adesso);
  const pulito = nome?.trim();
  return pulito ? `${s}, ${pulito}` : s;
}
