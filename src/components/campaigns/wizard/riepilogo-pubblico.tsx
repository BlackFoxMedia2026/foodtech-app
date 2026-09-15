"use client";

import {
  Cake,
  Crown,
  MoonStar,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FiltroAttivo, IconaSegmento, SegmentoPreset } from "@/lib/campaign-segments";
import type { SegmentPreviewResult } from "@/lib/campaign-wizard-api";

export const ICONE_SEGMENTO: Record<IconaSegmento, LucideIcon> = {
  Users,
  Repeat,
  TrendingDown,
  MoonStar,
  UserPlus,
  Crown,
  Cake,
  SlidersHorizontal,
};

/** Milleduecento persone si scrivono 1.200, non 1200: è un pubblico, non un id. */
function formatta(n: number): string {
  return n.toLocaleString("it-IT");
}

/** Una riga sottile che separa senza dividere: il pannello resta una cosa sola. */
function Filo() {
  return <div className="h-px bg-gradient-to-r from-border via-border/50 to-transparent" />;
}

function EtichettaSegmento({ preset }: { preset: SegmentoPreset | null }) {
  if (!preset) return <p className="t-corpo text-muted-foreground">—</p>;
  const Icon = ICONE_SEGMENTO[preset.icon];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-accent-strong/40 bg-accent-strong/10 px-3 py-1.5 text-sm font-medium text-accent-strong">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {preset.label}
    </span>
  );
}

/**
 * Il numero che conta, accanto a chi lo cambia.
 *
 * È la stessa colonna in «Segmento» e in «Filtri» — si guarda mentre si
 * sceglie, non dopo aver scorso. Cambia solo cosa le sta sopra: il gruppo
 * appena scelto nel primo passo, il gruppo **più** i filtri nel secondo.
 */
export function RiepilogoPubblico({
  preset,
  filtri,
  preview,
  quota,
  nota = false,
  titoloSegmento = "Segmento selezionato",
  titoloNumero = "Destinatari",
}: {
  preset: SegmentoPreset | null;
  /** Se presente, il riepilogo elenca anche i filtri: è il passo «Filtri». */
  filtri?: FiltroAttivo[];
  preview: SegmentPreviewResult | null;
  /** Gli invii che restano nel piano: senza, la colonna non parla di costi. */
  quota?: { disponibili: number; limite: number } | null;
  /** La riga sul consenso: sta dove si sceglie il pubblico, non dove lo si affina. */
  nota?: boolean;
  titoloSegmento?: string;
  titoloNumero?: string;
}) {
  return (
    <aside className="surface h-fit space-y-5 p-5 xl:sticky xl:top-0">
      <div className="space-y-2">
        <p className="t-etichetta">{titoloSegmento}</p>
        <EtichettaSegmento preset={preset} />
      </div>

      {filtri && (
        <>
          <Filo />
          <div className="space-y-2">
            <p className="t-etichetta">Filtri applicati</p>
            {filtri.length === 0 ? (
              <p className="t-nota">Nessun filtro: il pubblico è tutto il segmento iniziale.</p>
            ) : (
              <ul className="space-y-1.5">
                {filtri.map((filtro) => (
                  <li key={filtro.id} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{filtro.label}</span>
                    <span className="truncate text-right font-medium text-foreground">{filtro.valore}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Filo />

      {/* La gerarchia sta tutta qui: una cifra in serif, grande abbastanza da
          essere la prima cosa che si legge entrando nella colonna. */}
      <div className="space-y-1">
        <p className="t-etichetta">{titoloNumero}</p>
        <p className="text-display text-4xl leading-none tabular-nums md:text-5xl">
          {preview ? formatta(preview.finalRecipients) : "—"}
        </p>
        {preview && (
          /*
            Le esclusioni si elencano tutte, comprese quelle a zero: la somma
            deve tornare. Un ristoratore che legge «mille corrispondono» e
            «novecento destinatari» si fa il conto, e se mancano cento senza
            una riga che li spieghi il numero grande smette di essere credibile.

            Le righe a zero sparirebbero volentieri per brevità, e sarebbe un
            errore: «0 esclusi perché hanno segnalato spam» è l'informazione
            che dice che la lista è pulita.
          */
          <ul className="space-y-1 pt-2 text-xs text-muted-foreground">
            <li>{formatta(preview.totalMatchingFilters)} clienti corrispondono alla selezione</li>
            <li>{formatta(preview.excludedNoEmail)} esclusi perché senza email valida</li>
            <li>{formatta(preview.excludedNoConsent)} esclusi perché senza consenso marketing</li>
            <li>{formatta(preview.excludedSuppressed)} esclusi perché non raggiungibili</li>
            <li>{formatta(preview.duplicatesRemoved)} doppioni con lo stesso indirizzo</li>
          </ul>
        )}
        {preview && preview.finalRecipients === 0 && (
          <p className="pt-2 text-xs text-accent-strong">Nessun destinatario corrisponde a questa selezione.</p>
        )}
      </div>

      {quota && preview && (
        <>
          <Filo />
          {/*
            Quanto costa questa campagna, mentre la si sta componendo.

            Due righe sotto il numero dei destinatari, non un cruscotto:
            quanti invii ho, e quanti me ne restano dopo questa campagna. È la
            sottrazione che uno farebbe a mente, fatta prima che se la chieda —
            e se il risultato è negativo lo si dice qui, non al momento di
            premere «invia».
          */}
          <div className="space-y-1.5">
            <p className="t-etichetta">Invii</p>
            <dl className="space-y-1 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Disponibili</dt>
                <dd className="tabular-nums">{formatta(quota.disponibili)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Dopo questa campagna</dt>
                <dd
                  className={
                    preview.finalRecipients > quota.disponibili
                      ? "tabular-nums text-destructive-soft"
                      : "tabular-nums"
                  }
                >
                  {preview.finalRecipients > quota.disponibili
                    ? `mancano ${formatta(preview.finalRecipients - quota.disponibili)}`
                    : formatta(quota.disponibili - preview.finalRecipients)}
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      {nota && (
        <>
          <Filo />
          <p className="flex items-start gap-2 t-nota">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Sono inclusi solo clienti con consenso marketing attivo ed email valida.</span>
          </p>
        </>
      )}
    </aside>
  );
}
