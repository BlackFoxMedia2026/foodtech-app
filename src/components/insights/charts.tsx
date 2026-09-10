"use client";

import { Fragment } from "react";
import { interpola } from "@/lib/colore-leggibile";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SOURCE_LABELS } from "@/lib/insight-rules";

const PALETTE = ["#8a7510", "#cfad03", "#d9bf3d", "#e6d168", "#f2f0e7", "#e6e3d2", "#c9b139"];

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function SlotChart({ data }: { data: { slot: string; covers: number }[] }) {
  const hasData = data.some((d) => d.covers > 0);
  if (!hasData) {
    return (
      <EmptyState
        title="Nessun dato disponibile nel periodo selezionato."
        description="Quando inizieranno ad arrivare prenotazioni tracciate, vedrai qui la distribuzione per fascia oraria."
      />
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="slotBarGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#cfad03" />
              <stop offset="100%" stopColor="#c9b139" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="slot" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
          />
          <Bar dataKey="covers" fill="url(#slotBarGradient)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const WEEKDAY_ORDER = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
/**
 * La scala dei coperti resta **scura da un capo all'altro**, e questo non è
 * estetica: è la ragione per cui i numeri si leggono.
 *
 * Prima era una velatura d'oro sul fondo della scheda, dal 15% al 100%, con il
 * numero in `text-carbon-900` fisso. Una velatura fa viaggiare l'intensità
 * sulla **luminosità**, che è esattamente ciò di cui ha bisogno anche il testo
 * sopra: le celle scure avevano numeri a **2,09 : 1**. E non bastava derivare
 * il colore del testo, perché quella scala attraversa una **fascia morta** fra
 * il 40% e il 78% in cui *né* il crema *né* l'inchiostro arrivano a 4,5 : 1.
 *
 * Così l'intensità viaggia sulla **tinta**: dal verde della scheda a una
 * terracotta profonda, entrambe scure. Il crema regge su tutta la scala —
 * 8,54 : 1 in fondo, 5,87 : 1 in cima — e la separazione fra il primo e
 * l'ultimo gradino è quasi il doppio di quella che aveva la velatura capata.
 *
 * Chi cambia l'arrivo della scala deve rimisurare: già a `hsl(24 68% 38%)` il
 * crema scende a 4,45 e i numeri tornano illeggibili.
 */
const SCALA_DA = "#224639";
const SCALA_A = "#834821";

const SLOT_ORDER = ["12-14", "14-17", "17-19", "19-21", "21-23", "23+"];

export function WeekdayHeatmap({ data }: { data: { weekday: string; slot: string; covers: number }[] }) {
  const hasData = data.some((d) => d.covers > 0);
  if (!hasData) {
    return (
      <EmptyState
        title="Nessun dato disponibile nel periodo selezionato."
        description="Quando inizieranno ad arrivare prenotazioni tracciate, vedrai qui l'andamento per giorno e orario."
      />
    );
  }

  const byKey = new Map(data.map((d) => [`${d.weekday}|${d.slot}`, d.covers]));
  const max = Math.max(1, ...data.map((d) => d.covers));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[3.5rem_repeat(6,1fr)] gap-1.5 text-xs">
          <div />
          {SLOT_ORDER.map((slot) => (
            <div key={slot} className="text-center text-muted-foreground">{slot}</div>
          ))}
          {WEEKDAY_ORDER.map((weekday) => (
            <Fragment key={weekday}>
              <div className="flex items-center text-muted-foreground">{weekday}</div>
              {SLOT_ORDER.map((slot) => {
                const covers = byKey.get(`${weekday}|${slot}`) ?? 0;
                const intensita = covers / max;
                return (
                  <div
                    key={`${weekday}-${slot}`}
                    title={`${weekday} ${slot}: ${covers} coperti`}
                    className="flex h-10 items-center justify-center font-medium text-cream rounded-md"
                    style={{ backgroundColor: covers === 0 ? "hsl(var(--secondary))" : interpola(SCALA_DA, SCALA_A, intensita) }}
                  >
                    {covers > 0 ? covers : ""}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Meno coperti</span>
        <div className="flex h-3 w-24 overflow-hidden rounded-full">
          {[0, 0.25, 0.5, 0.75, 1].map((q) => (
            <div key={q} className="flex-1" style={{ backgroundColor: interpola(SCALA_DA, SCALA_A, q) }} />
          ))}
        </div>
        <span>Più coperti</span>
      </div>
    </div>
  );
}

export function SourcesChart({ data }: { data: { source: string; count: number }[] }) {
  const hasData = data.some((d) => d.count > 0);
  if (!hasData) {
    return (
      <EmptyState
        title="Le fonti di prenotazione non sono ancora tracciate."
        description="Quando collegherai widget, Google, Instagram o altre integrazioni, vedrai qui da dove arrivano gli ospiti."
      />
    );
  }

  const labeled = data.map((d) => ({ ...d, label: SOURCE_LABELS[d.source] ?? d.source }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={labeled} dataKey="count" nameKey="label" innerRadius={56} outerRadius={86} paddingAngle={4}>
            {labeled.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
