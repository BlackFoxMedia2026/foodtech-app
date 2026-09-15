"use client";

import type { ContoTavolo } from "@/server/conto-tavolo";

/**
 * Il conto per esteso, dentro il foglio.
 *
 * Qui non si sceglie niente: si controlla. Quindi tutto quello che altrove
 * viene nascosto per non rallentare — le righe già saldate dagli altri, gli
 * sconti, la quota impegnata da chi sta pagando in questo momento — qui c'è,
 * per intero e in ordine. È l'unico posto della pagina dove la densità di un
 * documento è la cosa giusta.
 *
 * Le righe già pagate restano visibili e barrate. Farle sparire sarebbe
 * peggio: chi cerca il proprio secondo in un elenco che non lo contiene più
 * si chiede se ha inquadrato il tavolo sbagliato.
 */
export function FoglioConto({
  conto,
  euro,
}: {
  conto: ContoTavolo;
  euro: (c: number) => string;
}) {
  return (
    <div className="space-y-4 pb-2">
      <ul className="space-y-2.5">
        {conto.righe.map((r) => {
          const saldata = r.disponibili === 0;
          return (
            <li
              key={r.id}
              className={`flex items-baseline justify-between gap-3 text-[15px] ${
                saldata ? "text-muted-foreground" : ""
              }`}
            >
              <span className={saldata ? "line-through" : ""}>
                <span className="text-muted-foreground tabular-nums">{r.quantita} ×</span> {r.nome}
              </span>
              <span className={`shrink-0 tabular-nums ${saldata ? "line-through" : ""}`}>
                {euro(r.prezzoUnitarioCents * r.quantita)}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="space-y-1.5 border-t border-border pt-3 text-[15px]">
        <Riga etichetta="Totale conto" valore={euro(conto.totaleCents)} />
        {conto.scontiCents > 0 && (
          <Riga etichetta="Già scalato" valore={`− ${euro(conto.scontiCents)}`} />
        )}
        {conto.pagatoCents > 0 && (
          <Riga etichetta="Già pagato" valore={`− ${euro(conto.pagatoCents)}`} />
        )}
        {conto.inCorsoCents > 0 && (
          <Riga
            etichetta="Pagamento in corso"
            valore={`− ${euro(conto.inCorsoCents)}`}
            nota="Qualcuno al tavolo sta pagando in questo momento."
          />
        )}
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
          <dt className="font-semibold">Da pagare</dt>
          <dd className="text-display text-[22px] tabular-nums">{euro(conto.residuoCents)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Riga({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{etichetta}</dt>
        <dd className="tabular-nums">{valore}</dd>
      </div>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}
