import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SommarioSezione } from "./sommario-sezione";
import { PARTI, type ParteId } from "@/lib/parti-impostazioni";
import { TrattiSfumati } from "@/components/ui/tessera-kpi";
import { SEGNI } from "./segni-impostazioni";

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
  const IconaSezione = SEGNI[id].icona;

  return (
    /*
      **Due colonne da `lg` (19 nov 2026).** Prima la sezione era una colonna
      sola da 896 px in mezzo allo schermo, e su un monitor largo i due lati
      restavano vuoti. Adesso a sinistra c'è una colonna ferma con la via di
      ritorno, il nome della sezione e il sommario dei suoi gruppi; a destra
      i gruppi, larghi quanto prima. Le righe nome/valore non si allargano:
      lo spazio in più va a qualcosa che serve, non al vuoto fra le due.

      Vale per tutte le sezioni da sola: il sommario si legge dai gruppi.
    */
    <section
      id={id}
      aria-labelledby={`titolo-${id}`}
      className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-12"
    >
      <TrattiSfumati />
      <aside className="lg:sticky lg:top-2 lg:self-start lg:pt-2">
        {/*
          La via di ritorno, in cima e su qualunque schermo: la barra in alto
          porta alle altre sezioni ma non all'indice, e senza questa riga
          l'unica strada sarebbe il tasto indietro del browser, che su un
          tablet in cucina non c'è. Alta 44 sul telefono, per il pollice.
        */}
        <Link
          href="/settings"
          className="-ml-1 inline-flex min-h-[44px] items-center gap-2 px-1 text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground md:ml-0 md:min-h-0 md:px-0 md:text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tutte le impostazioni
        </Link>

        {/*
          **Il pannello verde** (19 nov 2026): la colonna di lato era testo
          grigio sullo stesso fondo dei gruppi, e la pagina si leggeva come un
          unico blocco di parole. Verde pieno e scritte bianche la staccano:
          a sinistra «dove sei», a destra «cosa cambi». È lo stesso verde dei
          pulsanti pieni e della voce accesa in barra.
        */}
        <div className="pannello-sezione mt-3 rounded-[6px_28px_28px_28px] p-5 text-white lg:mt-5 lg:p-6">
          <header className="flex items-center gap-4 lg:block">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/25">
              <IconaSezione className="h-7 w-7 text-white" aria-hidden="true" />
            </span>
            <div className="min-w-0 lg:mt-4">
              <h2 id={`titolo-${id}`} className="t-titolo-pagina !text-white">
                {parte.titolo}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/75">
                {parte.sottotitolo}
              </p>
            </div>
          </header>

          <div className="hidden lg:block">
            <SommarioSezione sezione={id} />
          </div>
        </div>
      </aside>

      <div className="mt-5 space-y-4 md:mt-6 md:space-y-5 lg:mt-0">
        {children}
      </div>
    </section>
  );
}
