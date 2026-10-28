"use client";

import { useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { NomeEspandibile } from "@/components/floor/nome-espandibile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const campoData = useRef<HTMLInputElement>(null);
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
    `compatta`: il calendario è un'icona, e la data si legge passandoci
    sopra; il servizio resta scritto, perché è la cosa che cambia più spesso.
    Il campo data vero sta sotto l'icona, invisibile: il clic apre il suo
    selettore, che così compare dove ci si aspetta.
  */
  if (variante === "compatta") {
    const giorno = date
      ? new Date(`${date}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" })
      : "Scegli il giorno";
    return (
      <div className="flex items-center gap-0.5 rounded-full bg-secondary/60 p-0.5">
        <span className="relative">
          <button
            type="button"
            onClick={() => {
              const campo = campoData.current;
              if (!campo) return;
              try {
                campo.showPicker();
              } catch {
                campo.focus();
              }
            }}
            aria-label={`Giorno: ${giorno}`}
            title={giorno}
            className="group flex h-8 items-center rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <CalendarDays className="h-4 w-4 shrink-0" />
            <NomeEspandibile>{giorno}</NomeEspandibile>
          </button>
          <input
            ref={campoData}
            type="date"
            value={date}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => update({ date: e.target.value })}
            className="pointer-events-none absolute inset-0 opacity-0"
          />
        </span>
        <Select value={service} onValueChange={(v) => update({ service: v })}>
          <SelectTrigger className="h-8 w-auto gap-1 whitespace-nowrap rounded-full border-0 bg-transparent px-2.5 text-xs font-medium [&>span]:max-w-[7rem] [&>span]:truncate">
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
