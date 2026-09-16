"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CORNICI,
  MAX_TESTO_CORNICE,
  NOMI_CORNICI,
  corniceConTesto,
  type Cornice,
  type DesignQr,
} from "@/lib/qr-disegno";
import { schedaTipo, type TipoQr } from "@/lib/qr-tipi";
import { cn } from "@/lib/utils";

/**
 * La cornice, cioè la sola parte del cartoncino che una persona **legge**.
 *
 * Un QR nudo su un tavolo non dice cosa succede a inquadrarlo, e la maggior
 * parte della gente non lo inquadra per scoprirlo. «Scansiona per pagare»
 * cambia quanti lo usano molto più di qualunque scelta di colore.
 *
 * L'invito è già scritto quando si arriva qui, e lo detta il tipo: chi non ha
 * niente da dire in proposito non deve inventarsi una frase.
 */
export function QrFrameSelector({
  design,
  kind,
  onCambia,
}: {
  design: DesignQr;
  kind: TipoQr;
  onCambia: (patch: Partial<DesignQr>) => void;
}) {
  const conTesto = corniceConTesto(design.cornice);
  const invito = schedaTipo(kind).invito;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5">
        {CORNICI.map((c) => (
          <SchemaCornice
            key={c}
            cornice={c}
            design={design}
            selezionata={design.cornice === c}
            onScegli={() =>
              onCambia({
                cornice: c,
                /* Passando a una cornice con scritta, se non c'è ancora niente
                   da leggere si mette l'invito del tipo: una fascia vuota è
                   peggio di nessuna fascia. */
                ...(corniceConTesto(c) && !design.testoCornice.trim() ? { testoCornice: invito } : {}),
              })
            }
          />
        ))}
      </div>

      {conTesto && (
        <div className="space-y-1.5">
          <Label htmlFor="qr-invito">Testo della cornice</Label>
          <Input
            id="qr-invito"
            value={design.testoCornice}
            onChange={(e) => onCambia({ testoCornice: e.target.value })}
            placeholder={invito}
            maxLength={120}
          />
          <p className={design.testoCornice.length > MAX_TESTO_CORNICE ? "text-xs text-accent-strong" : "t-nota"}>
            {design.testoCornice.length > MAX_TESTO_CORNICE
              ? `Oltre ${MAX_TESTO_CORNICE} caratteri la scritta viene tagliata.`
              : `Poche parole, all'imperativo: «${invito}».`}
          </p>
        </div>
      )}
    </div>
  );
}

/** Lo schema di una cornice: il codice è il quadrato, la fascia è la barra. */
function SchemaCornice({
  cornice,
  design,
  selezionata,
  onScegli,
}: {
  cornice: Cornice;
  design: DesignQr;
  selezionata: boolean;
  onScegli: () => void;
}) {
  const qr = design.coloreQr;
  const sf = design.coloreSfondo;
  return (
    <button
      type="button"
      onClick={onScegli}
      title={NOMI_CORNICI[cornice]}
      aria-label={NOMI_CORNICI[cornice]}
      aria-pressed={selezionata}
      className={cn(
        "space-y-1 rounded-lg border p-1.5 text-center transition-[background-color,border-color,transform]",
        "active:scale-[0.97] motion-reduce:active:scale-100",
        selezionata ? "border-accent-strong bg-accent-strong/10" : "border-border hover:bg-secondary/60",
      )}
    >
      <span className="block rounded-md p-1.5" style={{ background: sf }}>
        <svg viewBox="0 0 40 40" className="h-auto w-full" aria-hidden="true">
          {cornice === "nessuna" && <rect x="5" y="5" width="30" height="30" rx="2" fill={qr} />}
          {cornice === "semplice" && (
            <>
              <rect x="2" y="2" width="36" height="36" rx="4" fill="none" stroke={qr} strokeWidth="2.5" />
              <rect x="9" y="9" width="22" height="22" rx="2" fill={qr} />
            </>
          )}
          {cornice === "cta-sopra" && (
            <>
              <rect x="3" y="3" width="34" height="9" rx="3" fill={qr} />
              <rect x="9" y="16" width="22" height="21" rx="2" fill={qr} opacity="0.75" />
            </>
          )}
          {cornice === "cta-sotto" && (
            <>
              <rect x="9" y="3" width="22" height="21" rx="2" fill={qr} opacity="0.75" />
              <rect x="3" y="28" width="34" height="9" rx="3" fill={qr} />
            </>
          )}
          {cornice === "badge" && (
            <>
              <rect x="9" y="4" width="22" height="21" rx="2" fill={qr} opacity="0.75" />
              <rect x="8" y="29" width="24" height="8" rx="4" fill={qr} />
            </>
          )}
          {cornice === "card" && (
            <>
              <rect x="2" y="2" width="36" height="36" rx="4" fill="none" stroke={qr} strokeWidth="2.5" />
              <rect x="9" y="8" width="22" height="19" rx="2" fill={qr} />
              <rect x="11" y="31" width="18" height="3" rx="1.5" fill={qr} opacity="0.55" />
            </>
          )}
        </svg>
      </span>
      <span className="block truncate text-[10px] leading-tight text-muted-foreground">
        {NOMI_CORNICI[cornice]}
      </span>
    </button>
  );
}
