"use client";

import { RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { contrasto, rapportoLeggibile } from "@/lib/colore-leggibile";
import { CONTRASTO_MINIMO, CONTRASTO_TRANQUILLO } from "@/lib/qr-validazione";
import { DESIGN_PREDEFINITO, type DesignQr } from "@/lib/qr-disegno";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Sei combinazioni già buone, tutte dentro la palette del prodotto. */
const ACCOSTAMENTI: { nome: string; qr: string; sfondo: string }[] = [
  { nome: "Bosco su crema", qr: "#13332C", sfondo: "#F2E7D0" },
  { nome: "Inchiostro su crema", qr: "#2F1F11", sfondo: "#F2E7D0" },
  { nome: "Terracotta su crema", qr: "#74432D", sfondo: "#F2E7D0" },
  { nome: "Nero su bianco", qr: "#111111", sfondo: "#FFFFFF" },
  { nome: "Bosco su bianco", qr: "#13332C", sfondo: "#FFFFFF" },
  { nome: "Crema su bosco", qr: "#F2E7D0", sfondo: "#13332C" },
];

/**
 * I due colori del codice.
 *
 * Con un avviso che non è una nota di stile: sotto una certa distanza fra i
 * due colori il telefono **non trova più il confine** fra un modulo e l'altro,
 * e il codice smette di essere un codice. Il numero si mostra perché sia una
 * misura e non un'opinione — e perché chi ha scelto un accostamento appena
 * sotto soglia possa vedere quanto gli manca.
 */
export function QrColorPicker({
  design,
  onCambia,
}: {
  design: DesignQr;
  onCambia: (patch: Partial<DesignQr>) => void;
}) {
  const trasparente = design.sfondoTrasparente;
  const rapporto = contrasto(design.coloreQr, design.coloreSfondo);
  const predefinito =
    design.coloreQr === DESIGN_PREDEFINITO.coloreQr &&
    design.coloreSfondo === DESIGN_PREDEFINITO.coloreSfondo &&
    !trasparente;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etichetta="Colore QR"
          valore={design.coloreQr}
          onCambia={(v) => onCambia({ coloreQr: v })}
        />
        <Campo
          etichetta="Colore sfondo"
          valore={design.coloreSfondo}
          onCambia={(v) => onCambia({ coloreSfondo: v })}
          /* Spento, non svuotato: il colore resta scritto sotto
             l'interruttore, ed è quello che torna spegnendo la trasparenza. */
          spento={trasparente}
        />
      </div>

      {/*
        L'interruttore sta su una riga sua, sotto i due campi.

        Riguarda il fondo, ma quello che cambia non è un colore: è **il file
        che esce**. Un PNG con il canale alfa vuoto dove prima c'era la carta
        non è una variante di «bianco», ed è la ragione per cui non è la
        settima pastiglia della fila qui sotto.
      */}
      <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <span className="min-w-0">
          <span className="block text-sm">Sfondo trasparente</span>
          <span className="t-nota block">
            Il codice esce senza fondo: prende la superficie su cui lo appoggi.
          </span>
        </span>
        <Switch
          checked={trasparente}
          onCheckedChange={(v) => onCambia({ sfondoTrasparente: v })}
          aria-label="Sfondo trasparente"
        />
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        {ACCOSTAMENTI.map((a) => (
          <button
            key={a.nome}
            type="button"
            title={a.nome}
            aria-label={a.nome}
            /* Scegliere un accostamento è scegliere anche un fondo: se la
               trasparenza era accesa si spegne, altrimenti si sceglierebbe un
               colore che poi non compare da nessuna parte. */
            onClick={() => onCambia({ coloreQr: a.qr, coloreSfondo: a.sfondo, sfondoTrasparente: false })}
            className="h-8 w-8 overflow-hidden rounded-md border border-border transition-transform hover:scale-105 active:scale-95 motion-reduce:transform-none"
            style={{ background: a.sfondo }}
          >
            <span className="mx-auto block h-3.5 w-3.5 rounded-sm" style={{ background: a.qr }} />
          </button>
        ))}
        {!predefinito && (
          <button
            type="button"
            onClick={() =>
              onCambia({
                coloreQr: DESIGN_PREDEFINITO.coloreQr,
                coloreSfondo: DESIGN_PREDEFINITO.coloreSfondo,
                sfondoTrasparente: false,
              })
            }
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Ripristina colori
          </button>
        )}
      </div>

      {/* Senza fondo il rapporto fra i due colori non descrive più niente: il
          secondo colore lo mette chi impagina. Vedi `qr-validazione.ts`. */}
      {trasparente ? (
        <p className="t-nota">
          Senza fondo il contrasto lo decide la superficie sotto: appoggialo su un colore pieno e molto più
          chiaro del codice, non su una foto.
        </p>
      ) : (
        rapporto !== null && (
          <p className={rapporto < CONTRASTO_MINIMO ? "text-xs font-medium text-destructive-soft" : "t-nota"}>
            {rapporto < CONTRASTO_MINIMO
              ? `I due colori distano ${rapportoLeggibile(rapporto)} volte: ne servono almeno ${CONTRASTO_MINIMO} perché un telefono trovi i moduli.`
              : rapporto < CONTRASTO_TRANQUILLO
                ? `I due colori distano ${rapportoLeggibile(rapporto)} volte: si legge, ma con poca luce può faticare.`
                : `I due colori distano ${rapportoLeggibile(rapporto)} volte: il codice si legge senza problemi.`}
          </p>
        )
      )}
    </div>
  );
}

function Campo({
  etichetta,
  valore,
  spento = false,
  onCambia,
}: {
  etichetta: string;
  valore: string;
  /**
   * Il campo c'è ancora e dice ancora il suo valore, ma non si tocca.
   *
   * Nasconderlo mentre la trasparenza è accesa farebbe saltare la riga e
   * toglierebbe l'unica cosa che spiega cosa succede spegnendola: il colore
   * che torna è **quello scritto lì**.
   */
  spento?: boolean;
  onCambia: (v: string) => void;
}) {
  /* Il selettore del sistema accetta solo `#rrggbb`: mentre si scrive a mano
     un valore incompleto, gli si tiene l'ultimo colore valido invece di
     farlo saltare al nero a ogni carattere. */
  const perSelettore = HEX.test(valore) ? valore : "#000000";
  return (
    <div className={cn("space-y-1.5", spento && "opacity-55")}>
      <Label>{etichetta}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={perSelettore}
          onChange={(e) => onCambia(e.target.value.toUpperCase())}
          disabled={spento}
          className="riquadro h-9 w-11 shrink-0 cursor-pointer bg-transparent p-0.5 disabled:cursor-not-allowed"
          aria-label={etichetta}
        />
        <Input
          value={valore}
          onChange={(e) => onCambia(e.target.value.toUpperCase())}
          disabled={spento}
          placeholder="#13332C"
          maxLength={7}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}
