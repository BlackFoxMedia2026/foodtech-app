"use client";

import type { StaffContractType } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { ContractFormErrors, ContractFormValues } from "@/lib/contract-form";
import { CONTRACT_STATUS_BADGE_TONE, CONTRACT_STATUS_LABELS, STAFF_CONTRACT_TYPES, getContractStatus, getContractStatusDetail } from "@/lib/staff-contracts";

export function ContractFields({
  idPrefix,
  value,
  onChange,
  errors,
}: {
  idPrefix: string;
  value: ContractFormValues;
  onChange: (next: ContractFormValues) => void;
  errors: ContractFormErrors;
}) {
  const previewStatus =
    value.startDate && (value.noExpiry || value.endDate)
      ? getContractStatus({ startDate: new Date(value.startDate), endDate: value.noExpiry ? null : new Date(value.endDate) })
      : null;
  const previewDetail =
    previewStatus && value.startDate
      ? getContractStatusDetail({ startDate: new Date(value.startDate), endDate: value.noExpiry ? null : new Date(value.endDate) })
      : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-contractType`}>Tipologia contratto</Label>
        <Select
          value={value.contractType ?? undefined}
          onValueChange={(v) => onChange({ ...value, contractType: v as StaffContractType })}
        >
          <SelectTrigger id={`${idPrefix}-contractType`} aria-invalid={!!errors.contractType}>
            <SelectValue placeholder="Seleziona una tipologia" />
          </SelectTrigger>
          <SelectContent>
            {STAFF_CONTRACT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.contractType && <p className="text-xs text-destructive">{errors.contractType}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-startDate`}>Data inizio contratto</Label>
        <Input
          id={`${idPrefix}-startDate`}
          type="date"
          value={value.startDate}
          onChange={(e) => onChange({ ...value, startDate: e.target.value })}
          aria-invalid={!!errors.startDate}
        />
        {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-endDate`}>Data scadenza</Label>
        <Input
          id={`${idPrefix}-endDate`}
          type="date"
          value={value.endDate}
          disabled={value.noExpiry}
          onChange={(e) => onChange({ ...value, endDate: e.target.value })}
          aria-invalid={!!errors.endDate}
          className={value.noExpiry ? "cursor-not-allowed bg-muted text-muted-foreground" : undefined}
        />
        <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Switch
            checked={value.noExpiry}
            onCheckedChange={(checked) => onChange({ ...value, noExpiry: checked, endDate: checked ? "" : value.endDate })}
          />
          Nessuna scadenza
        </label>
        {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-weeklyHours`}>Ore settimanali</Label>
        <Input
          id={`${idPrefix}-weeklyHours`}
          type="number"
          min={0}
          placeholder="Es. 40"
          value={value.weeklyHours}
          onChange={(e) => onChange({ ...value, weeklyHours: e.target.value })}
          aria-invalid={!!errors.weeklyHours}
        />
        {errors.weeklyHours && <p className="text-xs text-destructive">{errors.weeklyHours}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-contractualRole`}>Mansione contrattuale</Label>
        <Input
          id={`${idPrefix}-contractualRole`}
          placeholder="Es. Chef de rang"
          value={value.contractualRole}
          onChange={(e) => onChange({ ...value, contractualRole: e.target.value })}
        />
      </div>

      {previewStatus && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Stato</Label>
          <div>
            <Badge tone={CONTRACT_STATUS_BADGE_TONE[previewStatus]}>{previewDetail ?? CONTRACT_STATUS_LABELS[previewStatus]}</Badge>
          </div>
        </div>
      )}

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-notes`}>Note contratto</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          placeholder="Es. Rinnovo previsto a fine stagione."
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
