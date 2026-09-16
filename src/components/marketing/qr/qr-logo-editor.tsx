"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOGO_CENTRO_MAX, NOMI_POSIZIONI_LOGO, POSIZIONI_LOGO, type DesignQr, type PosizioneLogo } from "@/lib/qr-disegno";
import { LOGO_ACCEPT, fileInDataUrl, problemaLogo } from "@/lib/qr-logo";
import { cn } from "@/lib/utils";

/**
 * Il logo del locale sul codice.
 *
 * Due cose sono decise qui e non si lasciano decidere: **quanto è grande** e
 * **cosa c'è sotto**. Un logo al centro copre dei moduli, e il codice regge
 * quella copertura solo perché il disegno alza la correzione d'errore e mette
 * un riquadro chiaro sotto l'immagine (vedi `lib/qr-disegno.ts`). Un cursore
 * per la dimensione servirebbe soltanto a permettere di superare il punto
 * oltre cui non funziona più — e quel punto non si vede sullo schermo, si vede
 * al tavolo.
 */
export function QrLogoEditor({
  design,
  logoLocale,
  nomeLocale,
  onCambia,
}: {
  design: DesignQr;
  logoLocale: string | null;
  nomeLocale: string;
  onCambia: (patch: Partial<DesignQr>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const suo = !!logoLocale && design.logoUrl === logoLocale;

  /**
   * Il file scelto finisce nel codice subito, senza passare da nessuna parte.
   *
   * Il perché per esteso sta in `lib/qr-logo.ts`. In breve: il caricamento sul
   * server è l'unica cosa in questo editor che poteva fallire mentre si
   * sceglie, e non c'era ragione perché avvenisse in quel momento. Adesso
   * avviene al salvataggio, dove un indirizzo duraturo serve davvero.
   */
  async function scegli(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    /* Il campo si svuota subito: senza, riscegliere **lo stesso** file non
       emette un secondo `change` e il gesto sembra ignorato. */
    e.target.value = "";
    if (!file) return;

    const problema = problemaLogo(file);
    if (problema) {
      setErrore(problema);
      return;
    }

    setCaricamento(true);
    setErrore(null);
    try {
      onCambia({ logoUrl: await fileInDataUrl(file) });
    } catch {
      setErrore("Non siamo riusciti a leggere l'immagine. Riprova, o provane un'altra.");
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {design.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={design.logoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md border border-border bg-white object-contain p-1"
          />
        )}

        {logoLocale && !suo && (
          <Button type="button" variant="outline" size="sm" onClick={() => onCambia({ logoUrl: logoLocale })}>
            Usa logo del locale
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={caricamento}
        >
          <Upload className="h-3.5 w-3.5" />
          {caricamento ? "Apro..." : design.logoUrl ? "Carica un altro logo" : "Carica un logo"}
        </Button>

        {design.logoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setErrore(null);
              onCambia({ logoUrl: null });
            }}
          >
            Togli
          </Button>
        )}

        <input
          ref={input}
          type="file"
          accept={LOGO_ACCEPT}
          className="hidden"
          onChange={scegli}
        />
      </div>

      {suo && <p className="t-nota">È il logo di {nomeLocale}, quello del profilo.</p>}
      {errore && <p className="text-xs text-destructive-soft">{errore}</p>}

      {design.logoUrl && (
        <>
          <div className="space-y-2">
            <p className="t-etichetta">Dove sta</p>
            <div className="grid grid-cols-4 gap-1.5">
              {POSIZIONI_LOGO.map((p) => (
                <SchemaPosizione
                  key={p}
                  posizione={p}
                  design={design}
                  selezionata={design.posizioneLogo === p}
                  onScegli={() => onCambia({ posizioneLogo: p })}
                />
              ))}
            </div>
          </div>

          {design.posizioneLogo === "centro" && (
            <p className="t-nota">
              Al centro il logo occupa {Math.round(LOGO_CENTRO_MAX * 100)}% del lato
              {design.sfondoTrasparente
                ? ", e senza sfondo poggia direttamente sui moduli"
                : ", con un riquadro chiaro sotto"}
              : è la misura oltre cui i telefoni cominciano a non prenderlo, e per questo non si tocca.
            </p>
          )}
          {design.posizioneLogo === "cornice" && (
            <p className="t-nota">
              Il logo va nella fascia dell&apos;invito: senza una cornice con scritta, scivola sotto il codice.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Le quattro composizioni, disegnate come schemi.
 *
 * Non sono anteprime del codice vero — sarebbero quattro QR minuscoli tutti
 * uguali — ma quattro disposizioni: il quadrato è il codice, il pallino è il
 * logo. In venti pixel è l'unica cosa che si distingue.
 */
function SchemaPosizione({
  posizione,
  design,
  selezionata,
  onScegli,
}: {
  posizione: PosizioneLogo;
  design: DesignQr;
  selezionata: boolean;
  onScegli: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onScegli}
      title={NOMI_POSIZIONI_LOGO[posizione]}
      aria-label={NOMI_POSIZIONI_LOGO[posizione]}
      aria-pressed={selezionata}
      className={cn(
        "space-y-1 rounded-lg border p-1.5 text-center transition-[background-color,border-color,transform]",
        "active:scale-[0.97] motion-reduce:active:scale-100",
        selezionata ? "border-accent-strong bg-accent-strong/10" : "border-border hover:bg-secondary/60",
      )}
    >
      <span
        className={cn("block rounded-md p-1.5", design.sfondoTrasparente && "scacchiera")}
        style={design.sfondoTrasparente ? undefined : { background: design.coloreSfondo }}
      >
        <svg viewBox="0 0 40 40" className="h-auto w-full" aria-hidden="true">
          {posizione === "centro" && (
            <>
              <rect x="4" y="4" width="32" height="32" rx="3" fill={design.coloreQr} />
              <rect x="14" y="14" width="12" height="12" rx="2.5" fill={design.coloreSfondo} />
              <circle cx="20" cy="20" r="3.4" fill={design.coloreQr} opacity="0.5" />
            </>
          )}
          {posizione === "sopra" && (
            <>
              <circle cx="20" cy="8" r="5" fill={design.coloreQr} opacity="0.5" />
              <rect x="6" y="16" width="28" height="20" rx="3" fill={design.coloreQr} />
            </>
          )}
          {posizione === "sotto" && (
            <>
              <rect x="6" y="4" width="28" height="20" rx="3" fill={design.coloreQr} />
              <circle cx="20" cy="32" r="5" fill={design.coloreQr} opacity="0.5" />
            </>
          )}
          {posizione === "cornice" && (
            <>
              <rect x="7" y="3" width="26" height="22" rx="3" fill={design.coloreQr} />
              <rect x="3" y="28" width="34" height="9" rx="4.5" fill={design.coloreQr} opacity="0.5" />
              <circle cx="9.5" cy="32.5" r="3" fill={design.coloreSfondo} />
            </>
          )}
        </svg>
      </span>
      <span className="block truncate text-[10px] leading-tight text-muted-foreground">
        {NOMI_POSIZIONI_LOGO[posizione]}
      </span>
    </button>
  );
}
