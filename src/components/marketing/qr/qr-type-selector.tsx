"use client";

import { useState } from "react";
import {
  CalendarCheck,
  CreditCard,
  SlidersHorizontal,
  UtensilsCrossed,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SCHEDE_TIPO, type SchedaTipo, type TipoQr } from "@/lib/qr-tipi";
import { cn } from "@/lib/utils";

const ICONE: Record<SchedaTipo["icona"], LucideIcon> = {
  CreditCard,
  UtensilsCrossed,
  Wifi,
  CalendarCheck,
  SlidersHorizontal,
};

/**
 * La prima domanda: che cosa deve aprire questo codice.
 *
 * Prima il pulsante «Nuovo QR code» apriva un modulo con dentro un campo «URL
 * di destinazione», cioè chiedeva a un ristoratore l'unica cosa che non sa e
 * che il prodotto sa già. Adesso chiede l'unica cosa che sa lui — **cosa
 * vuole** — e da lì l'indirizzo lo mette il prodotto.
 *
 * Le stesse schede grandi della creazione di una campagna: icona, nome, una
 * riga di spiegazione. Cinque porte che si leggono in un colpo d'occhio, non
 * cinque voci di una tendina che si leggono una per una.
 */
export function QrTypeSelector({
  aperto,
  onApertoCambia,
  onScelta,
}: {
  aperto: boolean;
  onApertoCambia: (v: boolean) => void;
  onScelta: (tipo: TipoQr) => void;
}) {
  /* La selezione vive un attimo: serve a far vedere che il clic è arrivato
     prima che la pagina cambi. Senza, la card si illumina e basta. */
  const [scelto, setScelto] = useState<TipoQr | null>(null);

  function scegli(tipo: TipoQr) {
    setScelto(tipo);
    onScelta(tipo);
  }

  return (
    <Dialog
      open={aperto}
      onOpenChange={(v) => {
        onApertoCambia(v);
        if (!v) setScelto(null);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-display text-2xl">Cosa vuoi creare?</DialogTitle>
          <p className="text-sm text-muted-foreground">Scegli cosa deve aprire il QR code.</p>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCHEDE_TIPO.map((scheda) => (
            <SchedaQr
              key={scheda.id}
              scheda={scheda}
              selezionata={scelto === scheda.id}
              onScegli={() => scegli(scheda.id)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SchedaQr({
  scheda,
  selezionata,
  onScegli,
}: {
  scheda: SchedaTipo;
  selezionata: boolean;
  onScegli: () => void;
}) {
  const Icona = ICONE[scheda.icona];
  return (
    <button
      type="button"
      onClick={onScegli}
      aria-pressed={selezionata}
      className={cn(
        "group flex h-full flex-col gap-2 rounded-xl border p-4 text-left",
        "transition-[background-color,border-color,transform] duration-200",
        /* Il clic si sente: due pixel in giù e ritorno. Non è decorazione — su
           una griglia di cinque schede uguali è il solo modo di sapere quale
           si è premuta prima che la schermata cambi. */
        "active:translate-y-[2px] motion-reduce:active:translate-y-0",
        selezionata
          ? "border-accent-strong bg-accent-strong/10"
          : "border-border hover:border-border-strong hover:bg-secondary/60",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
          selezionata ? "bg-accent-strong/20" : "bg-secondary/70 group-hover:bg-secondary",
        )}
      >
        <Icona
          className={cn("h-5 w-5", selezionata ? "text-accent-strong" : "text-muted-foreground")}
          aria-hidden="true"
        />
      </span>
      <span className="t-titolo-scheda">{scheda.titolo}</span>
      <span className="text-xs leading-relaxed text-muted-foreground">{scheda.descrizione}</span>
    </button>
  );
}

/** Il pulsante che apre la scelta: lo stesso gesto da due posti diversi. */
export function NuovoQrButton({
  onClick,
  variant = "accent",
  children = "Nuovo QR code",
  icona,
}: {
  onClick: () => void;
  variant?: "accent" | "outline";
  children?: React.ReactNode;
  icona?: React.ReactNode;
}) {
  return (
    <Button variant={variant} onClick={onClick}>
      {icona}
      {children}
    </Button>
  );
}
