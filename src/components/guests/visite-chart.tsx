"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Le visite nel tempo.
 *
 * ## Barre e non una linea
 *
 * Una linea dice «fra due punti il valore è passato di lì», e fra il 4 e il
 * 18 agosto un cliente non ha fatto mezza visita: ha fatto una visita, poi
 * un'altra. Le visite sono **eventi contati dentro un periodo**, non una
 * grandezza che scorre, e la barra è la forma che lo dice. Con due o tre
 * visite in sei mesi — il caso più comune di un archivio vero — una linea
 * disegnerebbe due picchi uniti da un avvallamento che non esiste.
 *
 * ## L'aggregazione la sceglie il periodo, non l'utente
 *
 * Trenta giorni si guardano a settimane, tre e sei mesi a mesi, dodici mesi
 * ancora a mesi. È il numero di barre a decidere: sotto le cinque barre il
 * grafico non racconta niente, sopra le quindici diventa un pettine di righe
 * da un pixel. Nessuna impostazione da mettere in un menù — chi consulta la
 * scheda di un cliente non deve scegliere un passo di campionamento.
 *
 * ## I periodi vuoti ci sono
 *
 * Un mese senza visite è una barra a zero, non un buco. Saltare i periodi
 * vuoti darebbe un grafico in cui le barre sono sempre tutte alte e in cui un
 * cliente che ha smesso di venire sembra un cliente regolare — che è
 * esattamente l'informazione che questa pagina esiste per dare.
 */

const PERIODI = [
  { chiave: "30g", label: "30 giorni", giorni: 30, passo: "settimana" },
  { chiave: "3m", label: "3 mesi", giorni: 90, passo: "mese" },
  { chiave: "6m", label: "6 mesi", giorni: 182, passo: "mese" },
  { chiave: "12m", label: "12 mesi", giorni: 365, passo: "mese" },
] as const;

type Periodo = (typeof PERIODI)[number];

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function inizioSettimana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Lunedì: `getDay()` dà 0 alla domenica, che in Italia chiude la settimana.
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return x;
}

function serie(date: Date[], periodo: Periodo, ora: Date) {
  const da = new Date(ora.getTime() - periodo.giorni * 86_400_000);
  const dentro = date.filter((d) => d >= da);

  const barre: { etichetta: string; visite: number; inizio: Date }[] = [];

  if (periodo.passo === "settimana") {
    let cursore = inizioSettimana(da);
    while (cursore <= ora) {
      const fine = new Date(cursore.getTime() + 7 * 86_400_000);
      barre.push({
        etichetta: `${cursore.getDate()} ${MESI[cursore.getMonth()]}`,
        visite: dentro.filter((d) => d >= cursore && d < fine).length,
        inizio: new Date(cursore),
      });
      cursore = fine;
    }
  } else {
    let cursore = new Date(da.getFullYear(), da.getMonth(), 1);
    while (cursore <= ora) {
      const fine = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 1);
      barre.push({
        // L'anno solo a gennaio: ripeterlo su ogni barra riempirebbe l'asse
        // di «2026» dodici volte per dire una cosa sola.
        etichetta:
          cursore.getMonth() === 0
            ? `${MESI[0]} ${String(cursore.getFullYear()).slice(2)}`
            : MESI[cursore.getMonth()],
        visite: dentro.filter((d) => d >= cursore && d < fine).length,
        inizio: new Date(cursore),
      });
      cursore = fine;
    }
  }

  return barre;
}

export function VisiteChart({ date }: { date: string[] }) {
  const [periodo, setPeriodo] = useState<Periodo>(PERIODI[2]);

  const { barre, totale, ora } = useMemo(() => {
    /*
      «Adesso» si fissa dentro il `useMemo` e non a ogni disegno: senza,
      cambiare periodo ricalcolerebbe i confini su un istante diverso, e
      l'ultima barra potrebbe scivolare di un giorno. Dipende da `date` e
      `periodo`, che è quanto basta.
    */
    const adesso = new Date();
    const d = date.map((s) => new Date(s));
    const b = serie(d, periodo, adesso);
    return { barre: b, totale: b.reduce((n, x) => n + x.visite, 0), ora: adesso };
  }, [date, periodo]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {totale === 0 ? (
            "Nessuna visita in questo periodo"
          ) : (
            <>
              <span className="font-medium text-foreground">{totale}</span>{" "}
              {totale === 1 ? "visita" : "visite"} negli ultimi {periodo.label.toLowerCase()}
            </>
          )}
        </p>
        {/*
          Quattro pulsanti e non un menu a tendina: sono quattro, si vedono
          tutti, e quello attivo si riconosce senza aprire niente. Un `<select>`
          nasconderebbe tre opzioni su quattro per risparmiare sessanta pixel.
        */}
        <div className="flex shrink-0 rounded-md border border-border p-0.5" role="group" aria-label="Periodo">
          {PERIODI.map((p) => (
            <button
              key={p.chiave}
              type="button"
              onClick={() => setPeriodo(p)}
              aria-pressed={p.chiave === periodo.chiave}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                p.chiave === periodo.chiave
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barre} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.4} />
            <XAxis
              dataKey="etichetta"
              stroke="hsl(var(--card-foreground) / 0.65)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              /* Con tredici mesi le etichette si sovrappongono: recharts ne
                 salta quante gliene servono invece di sovrapporle. */
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              stroke="hsl(var(--card-foreground) / 0.65)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={26}
              /* Le visite sono numeri interi: senza questo, un asse che va da
                 0 a 2 mostra «0,5», «1,5» — mezze visite. */
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--secondary) / 0.35)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
                background: "hsl(var(--card))",
                color: "hsl(var(--card-foreground))",
              }}
              formatter={(v: number) => [`${v} ${v === 1 ? "visita" : "visite"}`, ""]}
              labelFormatter={(l) => String(l)}
            />
            {/* Il salvia chiaro: è il verde che si legge sul fondo scuro
                (5,68 : 1, vedi `tailwind.config.ts`), non quello delle
                superfici — una barra della stessa tinta della card non si
                vedrebbe. */}
            <Bar dataKey="visite" fill="#B6C695" radius={[3, 3, 0, 0]} maxBarSize={38} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        Visite per periodo dal {ora.toLocaleDateString("it-IT")}: {barre.map((b) => `${b.etichetta}: ${b.visite}`).join(", ")}
      </p>
    </div>
  );
}
