"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { WAITER_ROLES } from "@/server/waiters";

type FieldErrors = Partial<Record<"firstName" | "lastName" | "birthday" | "phone" | "role" | "customRole", string>>;

function calculateAge(birthday: string): number | null {
  if (!birthday) return null;
  const dob = new Date(birthday);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

function isValidPhone(phone: string) {
  const trimmed = phone.trim();
  if (!/^\+?[0-9\s()-]{6,20}$/.test(trimmed)) return false;
  return (trimmed.match(/\d/g)?.length ?? 0) >= 6;
}

export function NewWaiterDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [birthday, setBirthday] = useState("");
  const [role, setRole] = useState("");
  const [showToast, setShowToast] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const age = useMemo(() => calculateAge(birthday), [birthday]);
  const isOther = role === "Altro";

  function resetTransientState() {
    setFormError(null);
    setFieldErrors({});
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const fd = new FormData(e.currentTarget);
    const firstName = ((fd.get("firstName") as string) || "").trim();
    const lastName = ((fd.get("lastName") as string) || "").trim();
    const phone = ((fd.get("phone") as string) || "").trim();
    const customRole = ((fd.get("customRole") as string) || "").trim();
    const resolvedRole = isOther ? customRole : role;

    const errors: FieldErrors = {};
    if (!firstName) errors.firstName = "Inserisci il nome.";
    if (!lastName) errors.lastName = "Inserisci il cognome.";
    if (!birthday) {
      errors.birthday = "Inserisci la data di nascita.";
    } else if (new Date(birthday) > new Date()) {
      errors.birthday = "La data di nascita non può essere futura.";
    }
    if (!phone) {
      errors.phone = "Inserisci il numero di cellulare.";
    } else if (!isValidPhone(phone)) {
      errors.phone = "Numero di telefono non valido.";
    }
    if (!role) errors.role = "Seleziona una mansione.";
    if (isOther && !customRole) errors.customRole = "Specifica la mansione.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    const res = await fetch("/api/waiters", {
      method: "POST",
      body: JSON.stringify({ firstName, lastName, birthday, phone, role: resolvedRole }),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);

    if (!res.ok) {
      setFormError("Impossibile salvare il cameriere. Verifica i dati e riprova.");
      return;
    }

    setOpen(false);
    setBirthday("");
    setRole("");
    resetTransientState();
    router.refresh();
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 3500);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetTransientState();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="accent">
            <Plus className="h-4 w-4" /> Nuovo cameriere
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-w-[560px]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            firstFieldRef.current?.focus();
          }}
          aria-labelledby="new-waiter-title"
          aria-describedby="new-waiter-description"
        >
          <DialogHeader>
            <DialogTitle id="new-waiter-title">Nuovo cameriere</DialogTitle>
            <DialogDescription id="new-waiter-description">
              Aggiungi un nuovo membro dello staff di sala.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Nome</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  ref={firstFieldRef}
                  placeholder="Es. Marco"
                  aria-invalid={!!fieldErrors.firstName}
                  aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
                />
                {fieldErrors.firstName && (
                  <p id="firstName-error" className="text-xs text-destructive">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Cognome</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  placeholder="Es. Rossi"
                  aria-invalid={!!fieldErrors.lastName}
                  aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
                />
                {fieldErrors.lastName && (
                  <p id="lastName-error" className="text-xs text-destructive">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="birthday">Data di nascita</Label>
                <Input
                  id="birthday"
                  name="birthday"
                  type="date"
                  max={today}
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  aria-invalid={!!fieldErrors.birthday}
                  aria-describedby={fieldErrors.birthday ? "birthday-error" : undefined}
                />
                {fieldErrors.birthday && (
                  <p id="birthday-error" className="text-xs text-destructive">
                    {fieldErrors.birthday}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="age">Età</Label>
                <Input
                  id="age"
                  name="age"
                  readOnly
                  aria-readonly="true"
                  value={age !== null ? `${age} anni` : ""}
                  placeholder="Inserisci la data di nascita"
                  className="cursor-not-allowed bg-muted text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">Calcolata automaticamente dalla data di nascita.</p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="phone">Numero di cellulare</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="Es. +39 333 1234567"
                  aria-invalid={!!fieldErrors.phone}
                  aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                />
                {fieldErrors.phone && (
                  <p id="phone-error" className="text-xs text-destructive">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="role">Ruolo / Mansione</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="role" aria-invalid={!!fieldErrors.role}>
                    <SelectValue placeholder="Seleziona una mansione" />
                  </SelectTrigger>
                  <SelectContent>
                    {WAITER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.role && <p className="text-xs text-destructive">{fieldErrors.role}</p>}

                {isOther && (
                  <div className="pt-2">
                    <Input
                      id="customRole"
                      name="customRole"
                      placeholder="Specifica la mansione"
                      aria-invalid={!!fieldErrors.customRole}
                      aria-describedby={fieldErrors.customRole ? "customRole-error" : undefined}
                    />
                    {fieldErrors.customRole && (
                      <p id="customRole-error" className="mt-1 text-xs text-destructive">
                        {fieldErrors.customRole}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={submitting}>
                {submitting ? "Salvataggio…" : "Registra cameriere"}
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
            Cameriere registrato correttamente
          </div>,
          document.body,
        )}
    </>
  );
}
