import { cn } from "@/lib/utils";

/**
 * Reusable reactive liquid-glass surface — same four layers, same shared
 * ember gradient as the sidebar (`.liquid-sidebar`), minus the pointer-
 * reactive highlight (`.liquid-card__highlights` instead of the sidebar's
 * own `__highlights`). Used anywhere a control should visually read as part
 * of the same glass system instead of a flat bg/border treatment.
 */
export function LiquidSurface({
  className,
  contentClassName,
  radius,
  children,
}: {
  className?: string;
  contentClassName?: string;
  /** Overrides the sidebar's default 2rem corner radius for compact controls. */
  radius?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("liquid-sidebar relative", className)} style={radius ? ({ "--glass-radius": radius } as React.CSSProperties) : undefined}>
      <div className="liquid-sidebar__refraction" aria-hidden="true" />
      <div className="liquid-sidebar__glass" aria-hidden="true" />
      <div className="liquid-card__highlights" aria-hidden="true" />
      <div className={cn("liquid-sidebar__content", contentClassName)}>{children}</div>
    </div>
  );
}
