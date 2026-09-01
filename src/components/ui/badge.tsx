import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      tone: {
        neutral: "border-current/25 bg-current/10",
        gold: "border-accent/30 bg-accent/10 text-accent",
        pearl: "border-white/60 bg-gradient-to-br from-white to-[#F2F2F2] text-carbon-900 shadow-sm",
        success: "border-sage/40 bg-sage/15 text-sage",
        warning: "border-amber-200 bg-amber-50 text-amber-700",
        danger: "border-rose-200 bg-rose-50 text-rose-700",
        info: "border-sky-200 bg-sky-50 text-sky-700",
        carbon: "border-carbon-700 bg-carbon-800 text-sand-50",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
