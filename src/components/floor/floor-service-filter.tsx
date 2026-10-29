"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { NomeEspandibile } from "@/components/floor/nome-espandibile";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { MiniMese } from "@/components/staff/calendario/mini-mese";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { spostaMese } from "@/lib/turni";
import { cn } from "@/lib/utils";

export function FloorServiceFilter({
  date,
  service,
  serviceOptions,
  variante = "riquadro",
}: {
  date: string;
  service: string;
  serviceOptions: string[];
  /** `barra`: il filtro è già dentro un riquadro — non ne serve un secondo attorno. */
  variante?: "riquadro" | "barra" | "compatta";
}) {
  const oggi = useVenueToday();
  const [calendarioAperto, setCalendarioAperto] = useState(false);
  const [meseMostrato, setMeseMostrato] = useState(date || oggi);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function update(next: { date?: string; service?: string }) {
    const sp = new URLSearchParams(search);
    if (next.date) sp.set("date", next.date);
    if (next.service) sp.set("service", next.service);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const inBarra = variante === "barra";

  /*
    `compatta`: il giorno e il servizio, scritti, dentro la barra della sala.
    Il calendario è quello del prodotto (lo stesso del calendario turni), in
    un popover sopra la barra: il selettore nativo del browser ha i colori del
    sistema operativo e non quelli della pagina.
  */
  if (variante === "compatta") {
    const giorno = date
      ? new Date(`${date}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" })
      : "Scegli il giorno";
    return (
      <div className="flex items-center gap-0.5 rounded-full bg-secondary/60 p-0.5">
        <Popover
          open={calendarioAperto}
          onOpenChange={(v) => {
            if (v) setMeseMostrato(date || oggi);
            setCalendarioAperto(v);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Giorno: ${giorno}`}
              className="group flex h-10 items-center rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground data-[state=open]:bg-card data-[state=open]:text-foreground"
            >
              <CalendarDays className="h-[18px] w-[18px] shrink-0" />
              <NomeEspandibile apertoDa="largo">{giorno}</NomeEspandibile>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-[248px] p-0">
            <MiniMese
              className="border-0 bg-transparent"
              mese={meseMostrato}
              selezionato={date}
              oggi={oggi}
              settimana={[]}
              onSeleziona={(g) => {
                setCalendarioAperto(false);
                if (g !== date) update({ date: g });
              }}
              onCambiaMese={(d) => setMeseMostrato((m) => spostaMese(m, d))}
            />
          </PopoverContent>
        </Popover>
        <Select value={service} onValueChange={(v) => update({ service: v })}>
          <SelectTrigger className="h-10 w-auto gap-1 whitespace-nowrap rounded-full border-0 bg-transparent px-2.5 text-[13px] font-medium [&>span]:max-w-[7rem] [&>span]:truncate">
            <SelectValue placeholder="Servizio" />
          </SelectTrigger>
          <SelectContent>
            {serviceOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", inBarra ? "gap-0.5 rounded-lg bg-secondary/60 p-0.5" : "gap-2 riquadro bg-card p-1")}>
      <input
        type="date"
        value={date}
        onChange={(e) => update({ date: e.target.value })}
        className={cn("bg-transparent px-2 text-sm font-medium focus:outline-none", inBarra && "h-8")}
      />
      <Select value={service} onValueChange={(v) => update({ service: v })}>
        {/* 36 px come gli altri controlli: su un tablet si tocca anche qui. */}
        <SelectTrigger
          className={cn(
            "border-0 bg-transparent",
            // Nella barra il nome del servizio non manda a capo la riga: si accorcia.
            inBarra ? "h-8 w-40 whitespace-nowrap [&>span]:truncate" : "h-9 w-36",
          )}
        >
          <SelectValue placeholder="Servizio" />
        </SelectTrigger>
        <SelectContent>
          {serviceOptions.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
