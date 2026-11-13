"use client";

import type { ReactNode } from "react";
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
import { cn } from "@/lib/utils";

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

/**
 * Da quanti si parte a quanti arriva, disegnato.
 *
 * Una barra sola, lunga quanto i clienti che corrispondono: il tratto pieno
 * sono i destinatari, gli altri pezzi le ragioni per cui qualcuno resta fuori.
 * La legenda le elenca **tutte**, anche quelle a zero — la somma deve tornare,
 * e «0 non raggiungibili» è proprio l'informazione che dice che la lista è
 * pulita. Le righe a zero si leggono più piano, non spariscono.
 */
function Imbuto({ preview }: { preview: SegmentPreviewResult }) {
  const pezzi = [
    { id: "dest", label: "Destinatari", n: preview.finalRecipients, colore: "bg-forest" },
    { id: "email", label: "Senza email valida", n: preview.excludedNoEmail, colore: "bg-gilt" },
    { id: "consenso", label: "Senza consenso", n: preview.excludedNoConsent, colore: "bg-terracotta" },
    { id: "spam", label: "Non raggiungibili", n: preview.excludedSuppressed, colore: "bg-stato-dot-negative" },
    { id: "doppi", label: "Doppioni", n: preview.duplicatesRemoved, colore: "bg-sand-400" },
  ];
  const totale = pezzi.reduce((a, p) => a + p.n, 0);
  return (
    <div className="space-y-3">
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={`${formatta(preview.finalRecipients)} destinatari su ${formatta(preview.totalMatchingFilters)} clienti che corrispondono`}
      >
        {totale > 0 &&
          pezzi
            .filter((p) => p.n > 0)
            .map((p) => (
              <span
                key={p.id}
                className={cn("h-full transition-[flex-grow] duration-500", p.colore)}
                style={{ flexGrow: p.n, flexBasis: 0, minWidth: 4 }}
              />
            ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.72rem] leading-tight">
        {pezzi.slice(1).map((p) => (
          <li key={p.id} className={cn("flex items-center gap-1.5", p.n === 0 && "opacity-55")}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", p.colore)} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.label}</span>
            <span className="font-medium tabular-nums text-foreground">{formatta(p.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Una fascia del pannello: il filo sopra la separa senza staccarla. */
function Fascia({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-t border-border/60 px-5 py-4", className)}>{children}</div>;
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
  sceltaSegmento,
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
  /** Al posto dell'etichetta: dove il gruppo si può ancora cambiare. */
  sceltaSegmento?: ReactNode;
}) {
  const supera = quota && preview ? preview.finalRecipients > quota.disponibili : false;
  return (
    <aside data-destinazione="consenso" className="surface h-fit overflow-hidden p-0 xl:sticky xl:top-0">
      <div className="space-y-2 px-5 pb-4 pt-5">
        <p className="t-etichetta">{titoloSegmento}</p>
        {sceltaSegmento ?? <EtichettaSegmento preset={preset} />}
      </div>

      {filtri && (
        <Fascia className="space-y-2">
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
        </Fascia>
      )}

      {/* La gerarchia sta tutta qui: una cifra in serif, grande abbastanza da
          essere la prima cosa che si legge entrando nella colonna, e accanto
          il «su quanti» che le dà la misura. */}
      <Fascia className="space-y-4 bg-gradient-to-b from-secondary/50 to-transparent">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="t-etichetta">{titoloNumero}</p>
            <p className="text-display text-5xl leading-none tabular-nums" aria-live="polite">
              {preview ? formatta(preview.finalRecipients) : "—"}
            </p>
          </div>
          {preview && (
            <p className="pb-1 text-right text-xs leading-snug text-muted-foreground">
              su <span className="font-medium text-foreground">{formatta(preview.totalMatchingFilters)}</span>
              <br />
              che corrispondono
            </p>
          )}
        </div>
        {preview && <Imbuto preview={preview} />}
        {preview && preview.finalRecipients === 0 && (
          <p className="text-xs text-accent-strong">Nessun destinatario corrisponde a questa selezione.</p>
        )}
      </Fascia>

      {quota && preview && (
        /*
          Quanto costa questa campagna, mentre la si sta componendo: la parte
          del piano già usata, quella che prende questa campagna, quella che
          resta. È la sottrazione che uno farebbe a mente, fatta prima che se
          la chieda — e se non bastano lo si dice qui, non al momento di
          premere «invia».
        */
        <Fascia className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-etichetta">Invii del piano</p>
            <p className={cn("text-xs tabular-nums", supera ? "text-destructive-soft" : "text-muted-foreground")}>
              {supera ? (
                <>mancano {formatta(preview.finalRecipients - quota.disponibili)}</>
              ) : (
                <>
                  ne restano{" "}
                  <span className="font-medium text-foreground">
                    {formatta(quota.disponibili - preview.finalRecipients)}
                  </span>
                </>
              )}
            </p>
          </div>
          <BarraPiano quota={quota} questa={preview.finalRecipients} />
          <p className="text-[0.72rem] text-muted-foreground">
            Questa campagna ne usa{" "}
            <span className="font-medium text-foreground">{formatta(preview.finalRecipients)}</span> su{" "}
            {formatta(quota.disponibili)} disponibili.
          </p>
        </Fascia>
      )}

      {nota && (
        <div className="t-nota flex items-start gap-2 border-t border-border/60 bg-secondary/40 px-5 py-3">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-sage-strong" aria-hidden="true" />
          <span>Sono inclusi solo clienti con consenso marketing attivo ed email valida.</span>
        </div>
      )}
    </aside>
  );
}

/** Il piano come una barra: già usati, questa campagna (in evidenza), liberi. */
function BarraPiano({ quota, questa }: { quota: { disponibili: number; limite: number }; questa: number }) {
  const limite = Math.max(quota.limite, quota.disponibili, 1);
  const usati = Math.max(limite - quota.disponibili, 0);
  const presi = Math.min(questa, quota.disponibili);
  const pct = (n: number) => `${(n / limite) * 100}%`;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
      <span className="h-full bg-muted-foreground/35" style={{ width: pct(usati) }} />
      <span
        className="h-full bg-forest transition-[width] duration-500"
        style={{ width: pct(presi), minWidth: presi > 0 ? 4 : 0 }}
      />
    </div>
  );
}
