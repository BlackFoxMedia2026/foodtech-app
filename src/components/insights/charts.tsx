"use client";

import { Fragment } from "react";
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

const PALETTE = ["#15161a", "#c9a25a", "#e2c98a", "#5e6068", "#a3a4ab", "#dec59a", "#7a5a2f"];

export const SOURCE_LABELS: Record<string, string> = {
  WIDGET: "Widget sito",
  PHONE: "Telefono",
  WALK_IN: "Walk-in",
  GOOGLE: "Google",
  SOCIAL: "Social",
  CONCIERGE: "Manuale",
  EVENT: "Evento",
};

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
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="slot" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
          />
          <Bar dataKey="covers" fill="#c9a25a" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const WEEKDAY_ORDER = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
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
                const alpha = covers === 0 ? 0 : 0.15 + 0.85 * (covers / max);
                return (
                  <div
                    key={`${weekday}-${slot}`}
                    title={`${weekday} ${slot}: ${covers} coperti`}
                    className="flex h-10 items-center justify-center rounded-md font-medium text-carbon-900"
                    style={{ backgroundColor: covers === 0 ? "hsl(var(--secondary))" : `rgba(201, 162, 90, ${alpha})` }}
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
          {[0.15, 0.35, 0.55, 0.75, 1].map((a) => (
            <div key={a} className="flex-1" style={{ backgroundColor: `rgba(201, 162, 90, ${a})` }} />
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
