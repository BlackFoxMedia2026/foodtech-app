import {
  AlertTriangle,
  BellRing,
  ChefHat,
  Eye,
  NotebookPen,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import type { MotivoRichiamo } from "@/lib/stato-tavolo-staff";

/**
 * **Un'icona per motivo, in un posto solo.**
 *
 * Questa mappa esisteva in due copie — la griglia della Sala e le righe della
 * Home — con quattro voci ciascuna. Due copie di quattro icone sono una cosa
 * da niente finché i motivi restano quattro; da quando sono sette, sono due
 * posti in cui aggiungerne uno e uno solo in cui ci si ricorda di farlo.
 *
 * Le icone dicono **cosa**, non quanto: l'urgenza la porta il colore, che è
 * la sola cosa che si riconosce da un braccio di distanza, di sera, in
 * movimento.
 */
export const ICONA_RICHIAMO: Record<MotivoRichiamo, typeof BellRing> = {
  PIATTI_PRONTI: BellRing,
  CONTO: ReceiptText,
  SENZA_COMANDA: NotebookPen,
  ALLERGIA: AlertTriangle,
  DA_CONTROLLARE: Eye,
  DA_LIBERARE: Sparkles,
  NOTA: ChefHat,
};

/**
 * **Quanto scalda la card.**
 *
 * Tre livelli e non sette, perché un colore per motivo sarebbe una tavolozza
 * da imparare invece di una gerarchia da vedere:
 *
 * - `allarme` è il rosso, e ce l'ha **solo l'allergia**: è l'unica cosa in
 *   questa app che può fare male a qualcuno;
 * - `ora` è l'accento caldo — piatti, conto, tavolo senza comanda: le tre
 *   cose per cui ci si alza adesso;
 * - `poi` non ha colore. Un tavolo da controllare e uno da riassettare sono
 *   lavoro vero, e se prendessero lo stesso arancione dei piatti al passe il
 *   cameriere smetterebbe di fidarsi dell'arancione.
 */
export type Calore = "allarme" | "ora" | "poi";

export const CALORE_RICHIAMO: Record<MotivoRichiamo, Calore> = {
  PIATTI_PRONTI: "ora",
  CONTO: "ora",
  SENZA_COMANDA: "ora",
  ALLERGIA: "allarme",
  DA_CONTROLLARE: "poi",
  DA_LIBERARE: "poi",
  NOTA: "poi",
};

/**
 * «da 3 min», «da 1h02».
 *
 * Sopra l'ora si passa alle ore, e non è vezzo: «da 74 min» richiede un
 * calcolo mentale, e questa app esiste per non farne fare nessuno. Sotto il
 * minuto non si scrive niente — un tavolo appena accomodato ha già il suo
 * badge, e «da 0 min» è rumore.
 *
 * I minuti dell'ora si scrivono **a due cifre e attaccati**, come su un
 * orologio. Il primo tentativo scriveva «da 1 h 2» e si leggeva sbagliato:
 * sembrava un'ora e due qualcosa, o un «2» a cui mancava l'unità di misura.
 * «1h02» è la forma che nessuno deve interpretare.
 */
export function daQuanto(minuti: number | null | undefined): string | null {
  if (minuti === null || minuti === undefined || minuti < 1) return null;
  if (minuti < 60) return `da ${minuti} min`;
  const ore = Math.floor(minuti / 60);
  const resto = minuti % 60;
  return resto === 0 ? `da ${ore}h` : `da ${ore}h${String(resto).padStart(2, "0")}`;
}
