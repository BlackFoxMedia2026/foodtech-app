"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { compareTableLabels, formatTableSelectionLabel, parseTableLabel } from "@/lib/table-range";

type Mode = "ROOMS" | "TABLES";
type RoomOpt = { id: string; name: string };
type TableOpt = { id: string; label: string; seats: number };

type ExistingAssignment = {
  roomId: string | null;
  tableIds: string[];
} | null;

export function AssignServiceDialog({
  waiter,
  mode,
  rooms,
  tables,
  serviceOptions,
  triggerLabel,
  disabled,
}: {
  waiter: { id: string; firstName: string; lastName: string };
  mode: Mode;
  rooms: RoomOpt[];
  tables: TableOpt[];
  serviceOptions: string[];
  triggerLabel: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [service, setService] = useState(serviceOptions[0] ?? "");
  const [roomId, setRoomId] = useState<string>("");
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [rangeStartId, setRangeStartId] = useState("");
  const [rangeEndId, setRangeEndId] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const sortedTables = useMemo(() => [...tables].sort((a, b) => compareTableLabels(a.label, b.label)), [tables]);
  const rangeableTables = useMemo(() => sortedTables.filter((t) => parseTableLabel(t.label)), [sortedTables]);
  const rangeStartPrefix = rangeStartId ? parseTableLabel(rangeableTables.find((t) => t.id === rangeStartId)?.label ?? "")?.prefix : undefined;
  const rangeEndOptions = rangeStartPrefix !== undefined ? rangeableTables.filter((t) => parseTableLabel(t.label)?.prefix === rangeStartPrefix) : rangeableTables;

  useEffect(() => {
    if (!open || !date || !service) return;
    let cancelled = false;
    setLoadingExisting(true);
    fetch(`/api/waiter-assignments?date=${date}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Array<{ waiterId: string; service: string; roomId: string | null; tableIds: string[] }>) => {
        if (cancelled) return;
        const existing: ExistingAssignment =
          rows.find((r) => r.waiterId === waiter.id && r.service === service) ?? null;
        setRoomId(existing?.roomId ?? "");
        setTableIds(existing?.tableIds ?? []);
        setRangeStartId("");
        setRangeEndId("");
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, date, service, waiter.id]);

  function toggleTable(id: string) {
    setTableIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function applyRange() {
    const start = rangeableTables.find((t) => t.id === rangeStartId);
    const end = rangeableTables.find((t) => t.id === rangeEndId);
    if (!start || !end) return;
    const startParsed = parseTableLabel(start.label);
    const endParsed = parseTableLabel(end.label);
    if (!startParsed || !endParsed || startParsed.prefix !== endParsed.prefix) return;
    const lo = Math.min(startParsed.num, endParsed.num);
    const hi = Math.max(startParsed.num, endParsed.num);
    const idsInRange = rangeableTables
      .filter((t) => {
        const parsed = parseTableLabel(t.label);
        return parsed && parsed.prefix === startParsed.prefix && parsed.num >= lo && parsed.num <= hi;
      })
      .map((t) => t.id);
    setTableIds((prev) => Array.from(new Set([...prev, ...idsInRange])));
  }

  const selectedTableLabels = tables.filter((t) => tableIds.includes(t.id)).map((t) => t.label);
  const previewLabel = mode === "TABLES" ? formatTableSelectionLabel(selectedTableLabels) : rooms.find((r) => r.id === roomId)?.name;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!date) {
      setError("Seleziona una data.");
      return;
    }
    if (!service) {
      setError("Seleziona un servizio.");
      return;
    }
    if (mode === "ROOMS" && !roomId) {
      setError("Seleziona una sala.");
      return;
    }
    if (mode === "TABLES" && tableIds.length === 0) {
      setError("Seleziona almeno un tavolo.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/waiter-assignments", {
      method: "POST",
      body: JSON.stringify({
        waiterId: waiter.id,
        date,
        service,
        roomId: mode === "ROOMS" ? roomId : undefined,
        tableIds: mode === "TABLES" ? tableIds : undefined,
      }),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.message ?? "Impossibile salvare l'assegnazione.");
      return;
    }

    setOpen(false);
    router.refresh();
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 3500);
  }

  return (
    <>
      <Dialog open={open && !disabled} onOpenChange={(next) => setOpen(next && !disabled)}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={disabled}
            title={disabled ? "Cameriere a riposo: non assegnabile" : undefined}
          >
            <CalendarCheck className="h-4 w-4" /> {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[560px]" aria-labelledby="assign-service-title" aria-describedby="assign-service-description">
          <DialogHeader>
            <DialogTitle id="assign-service-title">Assegna servizio</DialogTitle>
            <DialogDescription id="assign-service-description">
              Definisci dove lavorerà questo cameriere durante il servizio.
            </DialogDescription>
            <p className="text-sm font-medium text-card-foreground">
              {waiter.firstName} {waiter.lastName}
            </p>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="assign-date">Data</Label>
                <Input id="assign-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assign-service">Servizio</Label>
                <Select value={service} onValueChange={setService}>
                  <SelectTrigger id="assign-service">
                    <SelectValue placeholder="Seleziona un servizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {mode === "ROOMS" ? (
              <div className="space-y-1.5">
                <Label htmlFor="assign-room">Sala</Label>
                <Select value={roomId} onValueChange={setRoomId} disabled={loadingExisting}>
                  <SelectTrigger id="assign-room">
                    <SelectValue placeholder="Seleziona una sala" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rooms.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nessuna sala configurata. Aggiungine una da Impostazioni → Organizzazione del servizio.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {rangeableTables.length > 0 && (
                  <div className="space-y-2 rounded-md border border-border bg-secondary/40 p-3">
                    <Label>Assegna intervallo</Label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="range-start">Da tavolo</Label>
                        <Select
                          value={rangeStartId}
                          onValueChange={(v) => {
                            setRangeStartId(v);
                            setRangeEndId("");
                          }}
                        >
                          <SelectTrigger id="range-start">
                            <SelectValue placeholder="Seleziona" />
                          </SelectTrigger>
                          <SelectContent>
                            {rangeableTables.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="range-end">A tavolo</Label>
                        <Select value={rangeEndId} onValueChange={setRangeEndId} disabled={!rangeStartId}>
                          <SelectTrigger id="range-end">
                            <SelectValue placeholder="Seleziona" />
                          </SelectTrigger>
                          <SelectContent>
                            {rangeEndOptions.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={applyRange} disabled={!rangeStartId || !rangeEndId}>
                      Seleziona intervallo
                    </Button>
                  </div>
                )}

                <Label>Tavoli assegnati</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                  {sortedTables.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-secondary">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={tableIds.includes(t.id)}
                        onChange={() => toggleTable(t.id)}
                        disabled={loadingExisting}
                      />
                      {t.label} · {t.seats} posti
                    </label>
                  ))}
                  {tables.length === 0 && <p className="p-1.5 text-xs text-muted-foreground">Nessun tavolo configurato.</p>}
                </div>
                {previewLabel && <p className="text-xs text-muted-foreground">Anteprima: {previewLabel}</p>}
              </div>
            )}

            {mode === "ROOMS" && previewLabel && (
              <p className="text-xs text-muted-foreground">Anteprima: {previewLabel}</p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={submitting || loadingExisting}>
                {submitting ? "Salvataggio…" : "Salva assegnazione"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {showToast &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-2xl animate-fade-in"
          >
            <CheckCircle2 className="h-4 w-4 text-accent-strong" />
            Assegnazione salvata correttamente
          </div>,
          document.body,
        )}
    </>
  );
}
