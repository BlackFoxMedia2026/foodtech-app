"use client";

import { useEffect, useRef, useState } from "react";
import type { StaffCapability } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TABLE_ASSIGNABLE_CAPABILITIES, TABLE_ROLE_LABELS } from "@/lib/staff-roles";
import { TABLE_ROLE_ICONS } from "./staff-role-icons";

type Assignment = {
  assignmentType: StaffCapability;
  waiter: { id: string; firstName: string; lastName: string; status: "ACTIVE" | "RESTING" };
};

type EligibleWaiter = { id: string; firstName: string; lastName: string };

/**
 * Lifted to floor-canvas.tsx as a sibling of the table nodes (same pattern
 * as FloorPlanDialog) — deliberately NOT nested inside TableNode. A Portal's
 * content still bubbles synthetic React events along the *component* tree,
 * so if this lived inside TableNode, clicks here would reach the table's own
 * onPointerDown/setPointerCapture (the drag handler) and get silently
 * swallowed — the exact bug already found and fixed for the "•••" menu.
 * Living outside TableNode sidesteps it entirely.
 */
export function AssignStaffDialog({
  open,
  onOpenChange,
  table,
  roomName,
  date,
  service,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: { id: string; label: string } | null;
  roomName: string;
  date: string;
  service: string;
  onChanged: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRole, setExpandedRole] = useState<StaffCapability | null>(null);
  const [eligible, setEligible] = useState<EligibleWaiter[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [savingRole, setSavingRole] = useState<StaffCapability | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const dateServiceKeyRef = useRef(`${date}|${service}`);
  useEffect(() => {
    const key = `${date}|${service}`;
    if (key !== dateServiceKeyRef.current) {
      dateServiceKeyRef.current = key;
      if (open) onOpenChange(false);
    }
  }, [date, service, open, onOpenChange]);

  async function refreshAssignments() {
    if (!table) return;
    setLoading(true);
    const res = await fetch(
      `/api/staff-assignments?tableId=${table.id}&date=${date}&service=${encodeURIComponent(service)}`,
    );
    setLoading(false);
    if (res.ok) setAssignments(await res.json());
  }

  useEffect(() => {
    if (!open || !table) return;
    setExpandedRole(null);
    setActionError(null);
    refreshAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, table?.id, date, service]);

  function togglePicker(role: StaffCapability) {
    setActionError(null);
    if (expandedRole === role) {
      setExpandedRole(null);
      return;
    }
    setExpandedRole(role);
    setEligibleLoading(true);
    fetch(`/api/staff/eligible?capability=${role}`)
      .then((r) => r.json())
      .then(setEligible)
      .finally(() => setEligibleLoading(false));
  }

  async function assign(role: StaffCapability, waiterId: string) {
    if (!table) return;
    setSavingRole(role);
    setActionError(null);
    const res = await fetch("/api/staff-assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ waiterId, tableId: table.id, assignmentType: role, date, service }),
    });
    setSavingRole(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setActionError(body?.message ?? "Impossibile assegnare. Riprova.");
      return;
    }
    setExpandedRole(null);
    await refreshAssignments();
    onChanged();
  }

  async function removeAssignment(role: StaffCapability) {
    if (!table) return;
    setSavingRole(role);
    setActionError(null);
    const res = await fetch("/api/staff-assignments", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId: table.id, assignmentType: role, date, service }),
    });
    setSavingRole(null);
    if (!res.ok) {
      setActionError("Impossibile rimuovere l'assegnazione. Riprova.");
      return;
    }
    setExpandedRole(null);
    await refreshAssignments();
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        This dialog is rendered inside the floor viewport, whose own
        onPointerDown (pan) sits as a React ancestor even though this
        content is portaled to <body> — Portal content still bubbles
        synthetic React events along the *component* tree. Without the
        stopPropagation below, clicks here reach the viewport's
        setPointerCapture and get swallowed — same root cause as the table
        "•••" menu bug fixed earlier in table-node.tsx.
      */}
      <DialogContent
        className="max-w-[440px]"
        aria-labelledby="assign-staff-title"
        aria-describedby="assign-staff-description"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle id="assign-staff-title">Tavolo {table?.label ?? ""}</DialogTitle>
          <DialogDescription id="assign-staff-description">
            {service} · {roomName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {TABLE_ASSIGNABLE_CAPABILITIES.map((role) => {
            const Icon = TABLE_ROLE_ICONS[role];
            const current = assignments.find((a) => a.assignmentType === role);
            const isExpanded = expandedRole === role;
            return (
              <div key={role} className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {TABLE_ROLE_LABELS[role]}
                </p>

                <div className="flex items-center justify-between gap-2">
                  {loading ? (
                    <span className="text-sm text-muted-foreground">Carico…</span>
                  ) : current ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-card-foreground">
                        {current.waiter.firstName} {current.waiter.lastName}
                      </span>
                      {current.waiter.status === "RESTING" && <Badge tone="warning">A riposo</Badge>}
                    </div>
                  ) : (
                    <span className="text-sm italic text-muted-foreground">Non assegnato</span>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => togglePicker(role)}>
                    {current ? "Cambia" : "Assegna"}
                  </Button>
                </div>

                {isExpanded && (
                  <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
                    {eligibleLoading ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Carico…</p>
                    ) : eligible.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nessun cameriere con questa competenza.
                      </p>
                    ) : (
                      eligible.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          disabled={savingRole === role}
                          onClick={() => assign(role, w.id)}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-card-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                        >
                          {w.firstName} {w.lastName}
                        </button>
                      ))
                    )}
                    {current && (
                      <button
                        type="button"
                        disabled={savingRole === role}
                        onClick={() => removeAssignment(role)}
                        className="w-full rounded px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Rimuovi assegnazione
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
