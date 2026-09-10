import { cn } from "@/lib/utils";

/**
 * Shared brand mark — same treatment as the dashboard's venue switcher chip
 * (rounded-lg, font-display), reused across landing, login and anywhere else
 * the "T" mark appears outside the app shell.
 *
 * Il fondo è il bruno scuro, non il terracotta: bianco su terracotta fa
 * 3,67 : 1 e crema su terracotta 2,99, entrambi sotto soglia. Su bruno scuro
 * il crema fa 6,63. Lo switcher del locale porta gli stessi due colori — se
 * uno cambia devono cambiare insieme.
 */
export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-surface-brown-dark text-cream",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        className,
      )}
    >
      <span className={cn("font-display font-semibold", size === "sm" ? "text-sm" : "text-base")}>T</span>
    </span>
  );
}
