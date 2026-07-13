"use client";

import { useAmbientGlass } from "@/lib/use-ambient-glass";

/**
 * Wraps the app shell and drives the shared --gradient-* custom properties
 * (see use-ambient-glass). Everything nested here — the mesh background, the
 * sidebar's liquid glass — reads the same live values via CSS inheritance.
 */
export function AmbientScene({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useAmbientGlass<HTMLDivElement>();
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
