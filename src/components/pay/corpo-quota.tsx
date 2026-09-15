"use client";

import { Plus } from "lucide-react";
import { quotaDivisa, quoteRimaste } from "@/lib/conto-diviso";

/** Le divisioni che coprono quasi tutti i tavoli. Oltre, si aggiunge a mano. */
const RAPIDE = [2, 3, 4, 5, 6];

/**
 * «In quante persone?»
 *
 * ## Un tastierino, non un contatore
 *
 * C'era un più e un meno ai lati di un numero grande: per arrivare a sei si
 * toccava quattro volte. Ma le divisioni che succedono davvero sono cinque —
 * due, tre, quattro, cinque, sei — e stanno tutte in una riga di pastiglie che
 * si prendono al primo colpo. Il più resta per il tavolo da dodici, che esiste
 * ma non detta il disegno.
 *
 * ## La quota si calcola sul residuo di adesso
 *
 * Non sul totale del tavolo: se due hanno già pagato, dividere in quattro
 * quello che resta è quasi sempre quello che la gente intende. Il conto della
 * testa — «eravamo sei, due hanno già pagato» — lo fa la persona, e questa
 * schermata si limita a non contraddirla.
 *
 * L'aritmetica è la stessa del server (`lib/conto-diviso.ts`), quindi la cifra
 * mostrata qui è quella che verrà addebitata — a meno che qualcuno non paghi
 * nel frattempo, e in quel caso il server se ne accorge e si ricomincia.
 */
export function CorpoQuota({
  residuoCents,
  euro,
  parti,
  onParti,
}: {
  residuoCents: number;
  euro: (c: number) => string;
  parti: number;
  onParti: (n: number) => void;
}) {
  const quota = quotaDivisa(residuoCents, parti);
  const restano = quoteRimaste(residuoCents - quota, quota);

  return (
    <div className="space-y-4 pb-2">
      <div className="flex flex-wrap gap-2">
        {RAPIDE.map((n) => (
          <Pastiglia key={n} attiva={parti === n} onClick={() => onParti(n)}>
            {n}
          </Pastiglia>
        ))}
        {parti > RAPIDE[RAPIDE.length - 1] && (
          <Pastiglia attiva onClick={() => undefined}>
            {parti}
          </Pastiglia>
        )}
        <button
          type="button"
          onClick={() => onParti(Math.min(50, parti + 1))}
          disabled={parti >= 50}
          aria-label="Una persona in più"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong text-foreground transition duration-200 active:scale-[0.96] disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="rounded-[20px] border border-border/70 bg-background/40 px-4 py-3.5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">La tua quota</p>
        <p className="text-display mt-0.5 text-[40px] leading-none tabular-nums">{euro(quota)}</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {euro(residuoCents)} divisi in {parti}
          {restano > 0 &&
            (restano === 1 ? " · dopo di te resta 1 quota" : ` · dopo di te restano ${restano} quote`)}
        </p>
      </div>
    </div>
  );
}

function Pastiglia({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      // 48 px: la misura minima perché un pollice lo prenda al primo colpo.
      className={`h-12 min-w-[3rem] rounded-2xl px-3 text-[17px] font-semibold tabular-nums transition duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        attiva
          ? "bg-cream text-clay-ink"
          : "border border-border-strong text-foreground hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );
}
