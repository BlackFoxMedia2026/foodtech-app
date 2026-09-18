import type { ReactNode } from "react";
import { PARTI, type ParteId } from "@/lib/parti-impostazioni";

/**
 * Una sezione delle Impostazioni: la testata e i suoi gruppi.
 *
 * ## Cos'era e perché non lo è più
 *
 * Era un componente `"use client"` con un `IntersectionObserver` dietro: le
 * cinque sezioni stavano tutte in pagina, si registravano in un contesto, e
 * lo scorrere accendeva la voce giusta in barra. Ottanta righe di codice —
 * osservatore, fascia sensibile, tregua dopo il clic perché la pillola non
 * lampeggiasse attraversando le sezioni in mezzo — per far funzionare una
 * pagina alta ottomila pixel.
 *
 * Adesso se ne apre **una per volta** dall'indice a schede, quindi la sezione
 * in pagina è una sola: la voce accesa la dice l'indirizzo, e tutto quel
 * meccanismo non ha più niente da fare. Il codice che è andato via è la parte
 * migliore di questo cambiamento.
 */
export function SezioneImpostazioni({
  id,
  children,
}: {
  id: ParteId;
  children: ReactNode;
}) {
  const parte = PARTI.find((p) => p.id === id)!;

  return (
    <section id={id} aria-labelledby={`titolo-${id}`}>
      <header className="border-b border-border pb-3 md:pb-4">
        <h2 id={`titolo-${id}`} className="t-titolo-pagina">
          {parte.titolo}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {parte.sottotitolo}
        </p>
      </header>

      <div className="mt-5 space-y-4 md:mt-6 md:space-y-5">{children}</div>
    </section>
  );
}
