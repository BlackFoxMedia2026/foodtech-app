"use client";

import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Il costo che si accumula nel mese, contro il budget.
 *
 * ## Tre cose diverse, tre trattamenti diversi
 *
 * **Speso** è pieno: è successo. **Impegnato** è la stessa tinta al 35%, e si
 * appoggia sopra lo speso — così si vede dove arriverebbe il mese se tutte le
 * campagne programmate partissero, senza far credere che sia già fatturato.
 * La **previsione** è tratteggiata, perché è un'ipotesi: dandole una linea
 * piena si direbbe che il futuro è un dato.
 *
 * Il **budget** è una riga orizzontale, e basta guardare dove la curva la
 * incrocia per sapere se e quando si sfora. È l'unica cosa che questo grafico
 * deve far capire in due secondi.
 */

/** `sage.strong` di tailwind.config: il verde che nel prodotto significa «fatto». */
const SALVIA = "#B6C695";

export function GraficoCosto({
  serie,
  budgetCents,
  impegnatoCents,
  previsioneCents,
  giorniNelCiclo,
}: {
  serie: { giorno: string; cumulatoCents: number | null }[];
  budgetCents: number | null;
  impegnatoCents: number;
  previsioneCents: number | null;
  giorniNelCiclo: number;
}) {
  const punti = serie.filter((s) => s.cumulatoCents !== null);

  if (punti.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nessun consumo registrato in questo ciclo.
        </p>
      </div>
    );
  }

  const ultimo = punti[punti.length - 1];
  type Punto = { giorno: string; speso: number | null; conImpegnato: number | null; previsione: number | null };

  const dati: Punto[] = punti.map((p) => ({
    giorno: p.giorno.slice(8),
    speso: (p.cumulatoCents ?? 0) / 100,
    /* L'impegnato si somma **solo** all'ultimo punto: è il costo di campagne
       che partiranno, non una spesa distribuita nei giorni passati. */
    conImpegnato: p === ultimo ? ((p.cumulatoCents ?? 0) + impegnatoCents) / 100 : (p.cumulatoCents ?? 0) / 100,
    /* La previsione parte **dall'ultimo dato vero**: una linea tratteggiata
       che comincia a mezz'aria sembra un secondo dato, non la prosecuzione di
       questo. */
    previsione: p === ultimo ? (p.cumulatoCents ?? 0) / 100 : null,
  }));

  if (previsioneCents !== null && dati.length > 0) {
    dati.push({
      giorno: String(giorniNelCiclo).padStart(2, "0"),
      speso: null,
      conImpegnato: null,
      previsione: previsioneCents / 100,
    });
  }

  const budget = budgetCents !== null ? budgetCents / 100 : null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dati} margin={{ top: 16, right: 12, bottom: 0, left: -12 }}>
          <XAxis dataKey="giorno" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
          <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v) => `€${v}`} />
          <Tooltip
            formatter={(v: number, nome: string) => [`€${Number(v).toFixed(2)}`, etichetta(nome)]}
            labelFormatter={(g) => `Giorno ${g}`}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Area
            type="monotone"
            dataKey="conImpegnato"
            stroke="none"
            fill={SALVIA}
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="speso"
            stroke={SALVIA}
            strokeWidth={2}
            fill={SALVIA}
            fillOpacity={0.35}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="previsione"
            stroke="hsl(var(--accent))"
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
          {budget !== null && (
            <ReferenceLine
              y={budget}
              stroke="hsl(var(--destructive))"
              strokeDasharray="6 3"
              label={{ value: `budget €${budget}`, position: "insideTopRight", fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function etichetta(nome: string): string {
  if (nome === "speso") return "Speso";
  if (nome === "conImpegnato") return "Speso + impegnato";
  return "Previsione";
}
