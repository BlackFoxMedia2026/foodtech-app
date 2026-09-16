"use client";

import {
  NOMI_STILI_ANGOLI,
  NOMI_STILI_MODULI,
  STILI_ANGOLI,
  STILI_MODULI,
  formeCampioneAngoli,
  formeCampioneModuli,
  type DesignQr,
  type StileAngoli,
  type StileModuli,
} from "@/lib/qr-disegno";
import { disegnoInSvg } from "@/lib/qr-svg";
import { cn } from "@/lib/utils";

/**
 * La forma dei moduli e quella dei tre quadrati grandi.
 *
 * Le miniature sono disegnate dallo **stesso codice** che disegna il QR vero,
 * su una matrice finta: due righe di nomi in una tendina — «Soft», «Moderno» —
 * non dicono niente, e un'immagine disegnata a parte prima o poi smette di
 * assomigliare a quello che poi esce.
 */
export function QrStylePanel({
  design,
  onCambia,
}: {
  design: DesignQr;
  onCambia: (patch: Partial<DesignQr>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="t-etichetta">Stile dei moduli</p>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-3">
          {STILI_MODULI.map((s) => (
            <Miniatura
              key={s}
              nome={NOMI_STILI_MODULI[s]}
              selezionata={design.stileModuli === s}
              onScegli={() => onCambia({ stileModuli: s })}
              svg={campioneModuli(s, design)}
              sfondo={design.coloreSfondo}
              trasparente={design.sfondoTrasparente}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="t-etichetta">Angoli</p>
        <div className="grid grid-cols-4 gap-1.5">
          {STILI_ANGOLI.map((s) => (
            <Miniatura
              key={s}
              nome={NOMI_STILI_ANGOLI[s]}
              selezionata={design.stileAngoli === s}
              onScegli={() => onCambia({ stileAngoli: s })}
              svg={campioneAngoli(s, design)}
              sfondo={design.coloreSfondo}
              trasparente={design.sfondoTrasparente}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function campioneModuli(stile: StileModuli, design: DesignQr): string {
  const { lato, forme } = formeCampioneModuli(stile, design.coloreQr);
  return disegnoInSvg({ larghezza: lato, altezza: lato, riquadroQr: { x: 0, y: 0, lato }, forme });
}

function campioneAngoli(stile: StileAngoli, design: DesignQr): string {
  /* Senza fondo l'occhio è un anello e non due riempimenti sovrapposti: se la
     miniatura non lo sapesse, mostrerebbe un quadrato pieno dove il codice
     vero ha un buco — cioè la forma sbagliata proprio nel pannello che serve
     a scegliere la forma. */
  const { lato, forme } = formeCampioneAngoli(
    stile,
    design.coloreQr,
    design.coloreSfondo,
    design.sfondoTrasparente,
  );
  return disegnoInSvg({ larghezza: lato, altezza: lato, riquadroQr: { x: 0, y: 0, lato }, forme });
}

function Miniatura({
  nome,
  svg,
  sfondo,
  trasparente = false,
  selezionata,
  onScegli,
}: {
  nome: string;
  svg: string;
  sfondo: string;
  trasparente?: boolean;
  selezionata: boolean;
  onScegli: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onScegli}
      title={nome}
      aria-label={nome}
      aria-pressed={selezionata}
      className={cn(
        "group space-y-1 rounded-lg border p-1.5 text-center transition-[background-color,border-color,transform]",
        "active:scale-[0.97] motion-reduce:active:scale-100",
        selezionata ? "border-accent-strong bg-accent-strong/10" : "border-border hover:bg-secondary/60",
      )}
    >
      <span
        className={cn("block rounded-md p-1.5 [&>svg]:h-auto [&>svg]:w-full", trasparente && "scacchiera")}
        style={trasparente ? undefined : { background: sfondo }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span className="block truncate text-[10px] leading-tight text-muted-foreground">{nome}</span>
    </button>
  );
}
