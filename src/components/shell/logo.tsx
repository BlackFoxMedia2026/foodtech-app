import { cn } from "@/lib/utils";

/**
 * Shared brand mark — same treatment as the dashboard's venue switcher chip
 * (bg-accent, rounded-lg, font-display), reused across landing, login and
 * anywhere else the "T" mark appears outside the app shell.
 */
export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-accent text-white",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        className,
      )}
    >
      <span className={cn("font-display font-semibold", size === "sm" ? "text-sm" : "text-base")}>T</span>
    </span>
  );
}
