import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * La «i» di Analytics: le regole del calcolo, dietro un tocco.
 *
 * Una vista che si legge non nasconde il suo metro, ma non lo scrive sotto
 * ogni numero: sta qui, a un tocco da chi lo cerca.
 */
export function Spiega({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        aria-label={titolo}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 p-3.5 text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-card-foreground">{titolo}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

