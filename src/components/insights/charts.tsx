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

export function SlotChart({ data }: { data: { slot: string; covers: number }[] }) {
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
  const byKey = new Map(data.map((d) => [`${d.weekday}|${d.slot}`, d.covers]));
  const max = Math.max(1, ...data.map((d) => d.covers));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[520px] grid-cols-[3rem_repeat(6,1fr)] gap-1 text-xs">
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
                  className="flex h-9 items-center justify-center rounded-md font-medium text-carbon-900"
                  style={{ backgroundColor: `rgba(201, 162, 90, ${alpha})` }}
                >
                  {covers > 0 ? covers : ""}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function SourcesChart({ data }: { data: { source: string; count: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="source" innerRadius={56} outerRadius={86} paddingAngle={4}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
