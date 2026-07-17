"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HEX_6_RE = /^#[0-9a-fA-F]{6}$/;

export function ColorField({
  label,
  value,
  onChange,
  placeholder = "#F44C12",
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  placeholder?: string;
}) {
  const pickerValue = HEX_6_RE.test(value) ? value : "#000000";

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-sm" />
      </div>
    </div>
  );
}
