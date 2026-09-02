"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Trash2 } from "lucide-react";
import type { StaffCapability, StaffPrimaryRole } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { CapabilityPicker } from "@/components/waiters/capability-picker";
import { DEFAULT_CAPABILITIES_BY_ROLE, STAFF_PRIMARY_ROLES } from "@/lib/staff-roles";
import { initials } from "@/lib/utils";

type FieldErrors = Partial<Record<"firstName" | "lastName" | "birthday" | "phone" | "primaryRole", string>>;

type ProfileWaiter = {
  id: string;
  firstName: string;
  lastName: string;
  birthday: Date;
  phone: string;
  role: string;
  primaryRole: StaffPrimaryRole | null;
  capabilities: StaffCapability[];
  photoUrl: string | null;
};

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

export function WaiterProfileDialog({ waiter, children }: { waiter: ProfileWaiter; children: React.ReactNode }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [birthday, setBirthday] = useState(waiter.birthday.toISOString().slice(0, 10));
  const [primaryRole, setPrimaryRole] = useState<StaffPrimaryRole | null>(waiter.primaryRole);
  const [capabilities, setCapabilities] = useState<StaffCapability[]>(waiter.capabilities);
  const capabilitiesTouchedRef = useRef(false);
  const [showToast, setShowToast] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(waiter.photoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const age = useMemo(() => calculateAge(birthday), [birthday]);
  const fullName = `${waiter.firstName} ${waiter.lastName}`;

  function handlePrimaryRoleChange(next: StaffPrimaryRole) {
    setPrimaryRole(next);
    if (!capabilitiesTouchedRef.current) {
      setCapabilities(DEFAULT_CAPABILITIES_BY_ROLE[next]);
    }
  }

  function handleCapabilitiesChange(next: StaffCapability[]) {
    capabilitiesTouchedRef.current = true;
    setCapabilities(next);
  }

  function resetTransientState() {
    setFormError(null);
    setFieldErrors({});
    setConfirmingDelete(false);
    setDeleteError(null);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/waiters/${waiter.id}/photo`, { method: "POST", body: fd });
    setUploadingPhoto(false);
    if (!res.ok) {
      setPhotoError("Caricamento foto non riuscito. Riprova.");
      return;
    }
    const updated = await res.json();
    setPhotoUrl(updated.photoUrl);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const fd = new FormData(e.currentTarget);
    const firstName = ((fd.get("firstName") as string) || "").trim();
    const lastName = ((fd.get("lastName") as string) || "").trim();
    const phone = ((fd.get("phone") as string) || "").trim();

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
    if (!primaryRole) errors.primaryRole = "Seleziona un ruolo principale.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    const res = await fetch(`/api/waiters/${waiter.id}`, {
      method: "PATCH",
      body: JSON.stringify({ firstName, lastName, birthday, phone, primaryRole, capabilities }),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);

    if (!res.ok) {
      setFormError("Impossibile salvare le modifiche. Verifica i dati e riprova.");
      return;
    }

    setOpen(false);
    resetTransientState();
    router.refresh();
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 3500);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/waiters/${waiter.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      setDeleteError("Impossibile eliminare il profilo. Riprova.");
      return;
    }
    setOpen(false);
    resetTransientState();
    router.refresh();
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
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent
          className="max-w-[560px]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            firstFieldRef.current?.focus();
          }}
          aria-labelledby="waiter-profile-title"
          aria-describedby="waiter-profile-description"
        >
          <DialogHeader>
            <DialogTitle id="waiter-profile-title">Profilo cameriere</DialogTitle>
            <DialogDescription id="waiter-profile-description">Visualizza e modifica i dati di {fullName}.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {photoUrl && <AvatarImage src={photoUrl} alt={fullName} />}
              <AvatarFallback className="text-base">{initials(fullName)}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
                <Camera className="h-3.5 w-3.5" />
                {uploadingPhoto ? "Carico…" : photoUrl ? "Cambia foto" : "Carica foto"}
              </Button>
              {photoError && <p className="text-xs text-destructive">{photoError}</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Nome</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  ref={firstFieldRef}
                  defaultValue={waiter.firstName}
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
                  defaultValue={waiter.lastName}
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
                  defaultValue={waiter.phone}
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
                <Label htmlFor="primaryRole">Ruolo principale</Label>
                <Select
                  value={primaryRole ?? undefined}
                  onValueChange={(v) => handlePrimaryRoleChange(v as StaffPrimaryRole)}
                >
                  <SelectTrigger id="primaryRole" aria-invalid={!!fieldErrors.primaryRole}>
                    <SelectValue placeholder="Seleziona un ruolo" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_PRIMARY_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.primaryRole && <p className="text-xs text-destructive">{fieldErrors.primaryRole}</p>}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Competenze operative</Label>
                <CapabilityPicker value={capabilities} onChange={handleCapabilitiesChange} />
                <p className="text-xs text-muted-foreground">Determinano a quali ruoli tavolo può essere assegnato.</p>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Eliminare definitivamente questo profilo?</span>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Elimino…" : "Elimina profilo"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                    Annulla
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Elimina profilo
                </Button>
              )}
              {deleteError && <span className="text-xs text-destructive">{deleteError}</span>}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" variant="accent" disabled={submitting}>
                  {submitting ? "Salvataggio…" : "Salva modifiche"}
                </Button>
              </div>
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
            Dati aggiornati correttamente
          </div>,
          document.body,
        )}
    </>
  );
}
