import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    // Una data vuota mostra «gg/mm/aaaa» col colore del testo, e sembra già
    // compilata: finché è vuota prende il colore del suggerimento.
    const dataVuota = (type === "date" || type === "time" || type === "month") && props.value === "";
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          // Il suggerimento è chiaro, non grigio scuro: con il colore del
          // testo secondario «Es. Marco» si leggeva come un nome già scritto.
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          dataVuota && "text-foreground/40",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
