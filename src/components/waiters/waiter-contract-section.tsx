"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { StaffContractType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ContractFields } from "@/components/waiters/contract-fields";
import { ContractDocument, type ContractDocumentInfo } from "@/components/waiters/contract-document";
import {
  EMPTY_CONTRACT_FORM,
  contractFormToPayload,
  contractToFormValues,
  validateContractForm,
  type ContractFormErrors,
  type ContractFormValues,
} from "@/lib/contract-form";
import {
  CONTRACT_STATUS_BADGE_TONE,
  CONTRACT_STATUS_LABELS,
  getContractStatus,
  getContractStatusDetail,
  pickCurrentContract,
  staffContractTypeLabel,
} from "@/lib/staff-contracts";

type Contract = {
  id: string;
  contractType: StaffContractType;
  startDate: string;
  endDate: string | null;
  weeklyHours: number | null;
  contractualRole: string | null;
  notes: string | null;
  document: ContractDocumentInfo | null;
};

function toDates(c: Contract) {
  return { ...c, startDate: new Date(c.startDate), endDate: c.endDate ? new Date(c.endDate) : null };
}

export function WaiterContractSection({ waiterId, open }: { waiterId: string; open: boolean }) {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create">("view");
  const [formValues, setFormValues] = useState<ContractFormValues>(EMPTY_CONTRACT_FORM);
  const [formErrors, setFormErrors] = useState<ContractFormErrors>({});
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/waiters/${waiterId}/contracts`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setContracts(data);
      });
    return () => {
      cancelled = true;
    };
  }, [open, waiterId]);

  if (contracts === null) {
    return <p className="text-xs text-muted-foreground">Carico contratto…</p>;
  }

  const current = pickCurrentContract(contracts.map(toDates));
  const history = contracts.map(toDates).filter((c) => c.id !== current?.id);

  async function refresh() {
    const res = await fetch(`/api/waiters/${waiterId}/contracts`);
    if (res.ok) setContracts(await res.json());
    router.refresh();
  }

  function startEdit() {
    if (!current) return;
    setFormValues(contractToFormValues(current));
    setFormErrors({});
    setFormSubmitError(null);
    setMode("edit");
  }

  function startCreate() {
    setFormValues({ ...EMPTY_CONTRACT_FORM, startDate: new Date().toISOString().slice(0, 10) });
    setFormErrors({});
    setFormSubmitError(null);
    setMode("create");
  }

  async function handleSubmit() {
    const errors = validateContractForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    setFormSubmitError(null);
    const payload = contractFormToPayload(formValues);
    const isEdit = mode === "edit" && current;
    const res = await fetch(isEdit ? `/api/waiters/${waiterId}/contracts/${current!.id}` : `/api/waiters/${waiterId}/contracts`, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormSubmitError("Impossibile salvare il contratto. Verifica i dati e riprova.");
      return;
    }
    setMode("view");
    await refresh();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    const res = await fetch(`/api/waiters/${waiterId}/contracts/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) return;
    setConfirmingDeleteId(null);
    await refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Contratto</p>
        {mode === "view" && (
          <Button type="button" variant="outline" size="sm" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5" /> Nuovo contratto
          </Button>
        )}
      </div>
      <Separator />

      {mode === "view" && (
        <>
          {current ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-card-foreground">{staffContractTypeLabel(current.contractType)}</p>
                <Badge tone={CONTRACT_STATUS_BADGE_TONE[getContractStatus(current)]}>{getContractStatusDetail(current)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {current.startDate.toLocaleDateString("it-IT")} → {current.endDate ? current.endDate.toLocaleDateString("it-IT") : "Nessuna scadenza"}
                {current.weeklyHours != null ? ` · ${current.weeklyHours} ore/settimana` : ""}
                {current.contractualRole ? ` · ${current.contractualRole}` : ""}
              </p>

              <ContractDocument
                waiterId={waiterId}
                contractId={current.id}
                document={current.document}
                onChange={() => refresh()}
              />

              {current.notes && <p className="text-xs text-muted-foreground">{current.notes}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={startEdit}>
                  Modifica contratto
                </Button>
                {confirmingDeleteId === current.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Eliminare questo contratto?</span>
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(current.id)} disabled={deleting}>
                      {deleting ? "Elimino…" : "Elimina"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                      Annulla
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDeleteId(current.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nessun contratto registrato per questo cameriere. Crea un contratto per poter caricare anche il documento.
            </p>
          )}

          {history.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setHistoryExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-accent"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyExpanded ? "rotate-180" : ""}`} />
                Storico contratti ({history.length})
              </button>
              {historyExpanded && (
                <div className="space-y-1.5 rounded-md border border-border p-2.5">
                  {history.map((c) => (
                    <div key={c.id} className="space-y-1 border-b border-border/60 py-1.5 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {c.startDate.toLocaleDateString("it-IT")} – {c.endDate ? c.endDate.toLocaleDateString("it-IT") : "senza scadenza"} ·{" "}
                          {staffContractTypeLabel(c.contractType)}
                        </span>
                        {confirmingDeleteId === c.id ? (
                          <span className="flex items-center gap-1.5">
                            <button type="button" className="text-destructive" onClick={() => handleDelete(c.id)} disabled={deleting}>
                              Elimina
                            </button>
                            <button type="button" onClick={() => setConfirmingDeleteId(null)}>
                              Annulla
                            </button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirmingDeleteId(c.id)} aria-label="Elimina contratto">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <ContractDocument waiterId={waiterId} contractId={c.id} document={c.document} onChange={() => refresh()} variant="compact" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {(mode === "edit" || mode === "create") && (
        <div className="space-y-3">
          <ContractFields idPrefix="contract" value={formValues} onChange={setFormValues} errors={formErrors} />
          {formSubmitError && <p className="text-sm text-destructive">{formSubmitError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setMode("view")} disabled={submitting}>
              Annulla
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Salvataggio…" : mode === "create" ? "Crea contratto" : "Salva contratto"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
