"use client";

import { useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Il pannello che sale dal basso.
 *
 * ## Perché non una schermata
 *
 * Ogni decisione del pagamento — in quanti siete, cosa hai preso, quanto
 * vuoi lasciare — era una schermata piena che sostituiva il conto. Funziona,
 * ma è il gesto di un sito: la pagina cambia, e con lei sparisce il contesto.
 * Un foglio che sale lascia la cifra visibile dietro il velo e dice da solo
 * come si torna indietro — si tira giù. È il gesto che la gente ha già nelle
 * dita da dieci anni di telefoni, e non va insegnato.
 *
 * ## Cosa mette Radix e cosa resta a noi
 *
 * Il `Dialog` di Radix porta le cose che sarebbe un errore riscrivere: la
 * trappola del fuoco, Esc, il blocco dello scorrimento sotto, `aria-modal` e
 * il legame fra titolo e pannello. Qui sopra restano due cose sue: la
 * **scivolata dal basso** e il **trascinamento**.
 *
 * Il trascinamento vive solo sulla maniglia e sulla testata, non su tutto il
 * foglio: dentro c'è una lista che scorre, e un foglio che si chiude mentre
 * si cerca il proprio secondo è un foglio che si impara a non toccare. Il
 * mouse è escluso del tutto — sul desktop si tira giù una finestra solo per
 * sbaglio.
 *
 * ## Desktop
 *
 * Resta ancorato in basso e si centra con un margine negativo invece che con
 * `translate-x`: la scivolata d'ingresso è anche lei una `transform`, e le due
 * si sovrascriverebbero a vicenda.
 */

/** Quanto bisogna tirare giù perché il foglio si chiuda davvero. */
const SOGLIA_PX = 110;

export function Foglio({
  aperto,
  onApertoCambia,
  titolo,
  sottotitolo,
  /** Il piede resta fermo mentre il contenuto scorre: lì vive la CTA. */
  piede,
  /** A sinistra della testata, dove il foglio è un passo di un percorso. */
  indietro,
  children,
}: {
  aperto: boolean;
  onApertoCambia: (v: boolean) => void;
  titolo: string;
  sottotitolo?: string;
  piede?: React.ReactNode;
  indietro?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [trascina, setTrascina] = useState(0);
  const partenza = useRef<number | null>(null);

  function presa(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    partenza.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function tira(e: React.PointerEvent) {
    if (partenza.current === null) return;
    // Solo verso il basso: tirare in su un foglio già in basso non vuol dire
    // niente, e lasciarlo fare lo staccherebbe dal bordo dello schermo.
    setTrascina(Math.max(0, e.clientY - partenza.current));
  }

  function lascia() {
    if (partenza.current === null) return;
    const percorso = trascina;
    partenza.current = null;
    setTrascina(0);
    if (percorso > SOGLIA_PX) onApertoCambia(false);
  }

  return (
    <DialogPrimitive.Root open={aperto} onOpenChange={onApertoCambia}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-carbon-900/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:duration-200 data-[state=closed]:duration-200 motion-reduce:animate-none" />

        <DialogPrimitive.Content
          // Mentre il dito trascina non ci va nessuna transizione: il foglio
          // deve stare attaccato al polpastrello, non inseguirlo.
          style={trascina > 0 ? { transform: `translateY(${trascina}px)`, transition: "none" } : undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col",
            "rounded-t-[28px] border-t border-border bg-forest text-foreground",
            "shadow-[0_-20px_60px_rgba(0,0,0,0.55)]",
            "sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-ml-[14rem] sm:w-[28rem] sm:rounded-[28px] sm:border",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200",
            "motion-reduce:animate-none",
          )}
        >
          <div
            onPointerDown={presa}
            onPointerMove={tira}
            onPointerUp={lascia}
            onPointerCancel={lascia}
            className="shrink-0 touch-none px-5 pb-3 pt-2.5"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong sm:hidden"
            />
            <div className="flex items-start gap-3">
              {indietro}
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-display text-[19px] leading-tight">
                  {titolo}
                </DialogPrimitive.Title>
                {sottotitolo && (
                  <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
                    {sottotitolo}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Chiudi</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-1">{children}</div>

          {piede && (
            <div className="shrink-0 border-t border-border/70 px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              {piede}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Il pulsante pieno in fondo a un foglio.
 *
 * Esisteva già identico in quattro schermate, copiato ogni volta con la stessa
 * riga di classi lunga due schermi. Qui è uno.
 */
export function BottoneFoglio({
  disabilitato,
  onClick,
  children,
}: {
  disabilitato?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabilitato}
      onClick={onClick}
      className="w-full rounded-2xl bg-cream px-5 py-4 text-[17px] font-semibold text-clay-ink shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition duration-200 hover:brightness-105 active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-forest"
    >
      {children}
    </button>
  );
}
