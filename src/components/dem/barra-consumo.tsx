import { cn } from "@/lib/utils";
import { invii } from "@/lib/dem-piani";

/**
 * Quanto del piano è stato consumato, in una riga.
 *
 * Due segmenti e non uno: gli invii **già partiti** e quelli **impegnati** da
 * una campagna programmata. Sommarli in una barra sola direbbe una cosa falsa
 * in due direzioni — che sono stati spediti messaggi che non sono partiti, e
 * che ci sono invii disponibili che invece sono già promessi a una campagna in
 * calendario.
 *
 * Il colore è lo stesso di «già pagato» nel conto al tavolo: nel prodotto il
 * verde salvia significa «fatto», e questo è lo stesso significato.
 */
export function BarraConsumo({
  limite,
  usati,
  riservati,
  className,
}: {
  limite: number;
  usati: number;
  riservati: number;
  className?: string;
}) {
  const quota = (n: number) => (limite > 0 ? Math.min(100, (n / limite) * 100) : 0);
  const quotaUsati = quota(usati);
  // Il segmento impegnato non può sfondare la barra quando i due insieme
  // superano il tetto: si ferma a quello che resta.
  const quotaRiservati = Math.max(0, Math.min(100 - quotaUsati, quota(riservati)));

  const descrizione =
    riservati > 0
      ? `${invii(usati)} inviate e ${invii(riservati)} impegnate su ${invii(limite)}`
      : `${invii(usati)} inviate su ${invii(limite)}`;

  return (
    <div
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-border", className)}
      role="img"
      aria-label={descrizione}
    >
      <span className="h-full bg-sage-strong" style={{ width: `${quotaUsati}%` }} />
      <span className="h-full bg-sage-strong/35" style={{ width: `${quotaRiservati}%` }} />
    </div>
  );
}
