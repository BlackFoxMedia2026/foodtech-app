"use client";

import type { StaffContractType } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_OPTIONS_BY_DEPARTMENT } from "@/lib/staff-departments";
import { Badge } from "@/components/ui/badge";
import type { ContractFormErrors, ContractFormValues } from "@/lib/contract-form";
import { CONTRACT_STATUS_BADGE_TONE, CONTRACT_STATUS_LABELS, STAFF_CONTRACT_TYPES, getContractStatus, getContractStatusDetail } from "@/lib/staff-contracts";
import { GIORNI_SETTIMANA } from "@/lib/scheda-dipendente";
import { cn } from "@/lib/utils";

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
        <CampoMansione
          id={`${idPrefix}-contractualRole`}
          valore={value.contractualRole}
          onCambia={(contractualRole) => onChange({ ...value, contractualRole })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-level`}>Livello / inquadramento</Label>
        <Input
          id={`${idPrefix}-level`}
          placeholder="Es. 4° livello CCNL Turismo"
          value={value.level}
          onChange={(e) => onChange({ ...value, level: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-probationEndDate`}>Fine periodo di prova</Label>
        <Input
          id={`${idPrefix}-probationEndDate`}
          type="date"
          min={value.startDate || undefined}
          value={value.probationEndDate}
          onChange={(e) => onChange({ ...value, probationEndDate: e.target.value })}
          aria-invalid={!!errors.probationEndDate}
        />
        {errors.probationEndDate ? (
          <p className="text-xs text-destructive">{errors.probationEndDate}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Vuoto se non previsto.</p>
        )}
      </div>

      {/* I giorni della settimana come sette interruttori, non una tendina a
          scelta multipla: si vede a colpo d'occhio quali sono accesi. */}
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Giorni lavorativi</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Giorni lavorativi">
          {GIORNI_SETTIMANA.map((g) => {
            const attivo = value.workingDays.includes(g.value);
            return (
              <button
                key={g.value}
                type="button"
                aria-pressed={attivo}
                aria-label={g.label}
                onClick={() =>
                  onChange({
                    ...value,
                    workingDays: attivo ? value.workingDays.filter((d) => d !== g.value) : [...value.workingDays, g.value],
                  })
                }
                className={cn(
                  "h-9 min-w-[3rem] rounded-full border px-3 text-xs font-medium transition-colors",
                  attivo ? "border-accent/40 bg-accent/15 text-accent-strong" : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {g.breve}
              </button>
            );
          })}
        </div>
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

const ALTRA = "__altra";
const MANSIONI = new Set(ROLE_OPTIONS_BY_DEPARTMENT.flatMap((g) => g.roles.map((r) => r.label)));

/**
 * La mansione del contratto: una tendina con i ruoli del personale, divisi
 * per reparto, invece di un testo libero — «Chef de rang», «chef de rang» e
 * «Chef di rango» erano tre mansioni diverse. Per quello che non c'è
 * («Altra mansione…») si scrive a mano; un contratto già salvato con una
 * mansione fuori elenco si apre direttamente così, senza perderla.
 */
function CampoMansione({ id, valore, onCambia }: { id: string; valore: string; onCambia: (v: string) => void }) {
  const [aMano, setAMano] = useState(() => !!valore.trim() && !MANSIONI.has(valore.trim()));

  if (aMano) {
    return (
      <div className="flex gap-2">
        <Input id={id} autoFocus placeholder="Scrivi la mansione" value={valore} onChange={(e) => onCambia(e.target.value)} />
        <button
          type="button"
          onClick={() => {
            setAMano(false);
            if (!MANSIONI.has(valore.trim())) onCambia("");
          }}
          className="shrink-0 rounded-full px-3 text-sm text-muted-foreground hover:bg-veil-10 hover:text-foreground"
        >
          Elenco
        </button>
      </div>
    );
  }
  return (
    <Select
      value={MANSIONI.has(valore) ? valore : undefined}
      onValueChange={(v) => {
        if (v === ALTRA) {
          setAMano(true);
          onCambia("");
        } else onCambia(v);
      }}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Scegli la mansione" />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS_BY_DEPARTMENT.map((g) => (
          <SelectGroup key={g.department}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.roles.map((r) => (
              <SelectItem key={r.value} value={r.label}>
                {r.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        <SelectGroup>
          <SelectItem value={ALTRA}>Altra mansione…</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
