"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { readApiError } from "@/lib/api-client";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, Trash2 } from "lucide-react";
import type { StaffCapability, StaffDepartment, StaffPrimaryRole, WaiterStatus } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { CapabilityPicker } from "@/components/staff/capability-picker";
import { StaffContractSection } from "@/components/staff/staff-contract-section";
import { DEFAULT_CAPABILITIES_BY_ROLE, ROLE_DEPARTMENT, STAFF_ROLE_DESCRIPTIONS, staffDepartmentOf } from "@/lib/staff-roles";
import { ROLE_OPTIONS_BY_DEPARTMENT, staffDepartmentLabel } from "@/lib/staff-departments";
import { staffStatusLabel, staffStatusTone } from "@/lib/staff-status";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/utils";

type FieldErrors = Partial<Record<"firstName" | "lastName" | "birthday" | "phone" | "email" | "primaryRole", string>>;

type ProfilePerson = {
  id: string;
  firstName: string;
  lastName: string;
  birthday: Date;
  phone: string;
  email: string | null;
  hireDate: Date | null;
  role: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment | null;
  capabilities: StaffCapability[];
  status: WaiterStatus;
  photoUrl: string | null;
  /** L'account con cui questa persona entra, se ne ha uno. */
  user: { email: string } | null;
};

/** `<input type="date">` vuole «2026-09-11» e niente altro. Un Date nullo
 * diventa stringa vuota, non «Invalid Date». */
function toDateInput(value: Date | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

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

/**
 * La scheda di una persona.
 *
 * Divisa in **dati personali** e **dati lavorativi**, e non è un vezzo
 * grafico: erano otto campi in fila dove la data di nascita stava accanto al
 * ruolo operativo, cioè una cosa che non cambia mai accanto a una che cambia
 * ogni stagione. Due blocchi con un titolo dicono anche **chi può guardare
 * cosa**, il giorno in cui i permessi diventeranno più fini.
 *
 * Si apre in due modi: con un `children` che fa da trigger (l'avatar e il nome
 * nell'elenco), oppure controllata da fuori con `open`/`onOpenChange` (dal
 * menu contestuale della riga, dove un trigger annidato litigherebbe con il
 * menu).
 */
export function StaffProfileDialog({
  person,
  children,
  canManageContracts = false,
  canManageStaff = true,
  open: controlledOpen,
  onOpenChange,
}: {
  person: ProfilePerson;
  children?: React.ReactNode;
  canManageContracts?: boolean;
  canManageStaff?: boolean;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const waiter = person;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  /* Stabile fra un render e l'altro: senza `useCallback` questa funzione è
     nuova ogni volta, e l'effetto che apre la scheda da un link profondo
     (`?waiterId=…`) la vedrebbe cambiata a ogni giro — cioè girerebbe di
     continuo. */
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlled) onOpenChange?.(next);
      else setUncontrolledOpen(next);
    },
    [controlled, onOpenChange],
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [birthday, setBirthday] = useState(toDateInput(waiter.birthday));
  const [hireDate, setHireDate] = useState(toDateInput(waiter.hireDate));
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

  const today = useVenueToday();
  const age = useMemo(() => calculateAge(birthday), [birthday]);
  const fullName = `${waiter.firstName} ${waiter.lastName}`;
  /* Il reparto segue il ruolo **mentre lo si sta scegliendo**, non quello
     salvato: chi sposta una persona da «Cameriere» a «Sous-chef» deve vedere
     subito che sta cambiando reparto, prima di salvare. */
  const reparto = staffDepartmentOf({ primaryRole, department: waiter.department });
  const mostraCapability = reparto === "SALA" || reparto === "BAR" || reparto === "DIREZIONE";

  // Deep-link from a notification's "Visualizza profilo" (brief section 12):
  // ?waiterId=<id> opens this profile directly when it matches.
  useEffect(() => {
    if (searchParams.get("waiterId") === waiter.id) setOpen(true);
  }, [searchParams, waiter.id, setOpen]);

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
      setPhotoError(await readApiError(res, "Caricamento foto non riuscito. Riprova."));
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
    const email = ((fd.get("email") as string) || "").trim();

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
    // L'email è facoltativa — metà di una brigata non ne ha una di lavoro — ma
    // se c'è deve essere scritta bene: è l'indirizzo su cui un giorno
    // arriverà l'invito all'account.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "Indirizzo email non valido.";
    if (!primaryRole) errors.primaryRole = "Seleziona un ruolo principale.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    const res = await fetch(`/api/waiters/${waiter.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        firstName,
        lastName,
        birthday,
        phone,
        email: email || null,
        hireDate: hireDate || null,
        primaryRole,
        capabilities,
      }),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);

    if (!res.ok) {
      setFormError(await readApiError(res, "Impossibile salvare le modifiche. Verifica i dati e riprova."));
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
      setDeleteError(await readApiError(res, "Impossibile eliminare il profilo. Riprova."));
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
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogContent
          className="max-h-[85vh] max-w-[560px] overflow-y-auto"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            firstFieldRef.current?.focus();
          }}
          aria-labelledby="waiter-profile-title"
          aria-describedby="waiter-profile-description"
        >
          <DialogHeader>
            <DialogTitle id="waiter-profile-title">Scheda personale</DialogTitle>
            <DialogDescription id="waiter-profile-description">Visualizza e modifica i dati di {fullName}.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {photoUrl && <AvatarImage src={photoUrl} alt={fullName} />}
              <AvatarFallback className="text-base">{initials(fullName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={staffStatusTone(waiter.status)}>{staffStatusLabel(waiter.status)}</Badge>
                <span className="t-etichetta text-muted-foreground">
                  {staffDepartmentLabel(reparto)}
                </span>
              </div>
              {/* L'accesso, in una riga. `Waiter.userId` esisteva da sempre e
                  non si vedeva da nessuna parte: senza, non c'era modo di
                  sapere chi di questa squadra può entrare nel gestionale — e
                  un ordine o una comanda si attribuiscono a un account, non a
                  un'anagrafica. */}
              <p className="t-nota truncate">
                {waiter.user ? `Accede con ${waiter.user.email}` : "Nessun accesso a Tavolo"}
              </p>
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

          <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
            <p className="t-etichetta">Dati personali</p>
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

              <div className="space-y-1.5">
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

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={waiter.email ?? ""}
                  placeholder="Facoltativa"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                />
                {fieldErrors.email && (
                  <p id="email-error" className="text-xs text-destructive">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="t-etichetta">Dati lavorativi</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="primaryRole">Ruolo</Label>
                  <Select
                    value={primaryRole ?? undefined}
                    onValueChange={(v) => handlePrimaryRoleChange(v as StaffPrimaryRole)}
                  >
                    <SelectTrigger id="primaryRole" aria-invalid={!!fieldErrors.primaryRole}>
                      <SelectValue placeholder="Seleziona un ruolo" />
                    </SelectTrigger>
                    {/*
                      I ruoli sono sedici, e un elenco piatto di sedici voci in
                      un menu a tendina si scorre due volte per trovarne una.
                      Raggruppati per reparto se ne leggono quattro alla volta —
                      ed e\u0300 anche il modo in cui si capisce che scegliere
                      «Sous-chef» sposta la persona in cucina.
                    */}
                    <SelectContent>
                      {ROLE_OPTIONS_BY_DEPARTMENT.map((gruppo) => (
                        <SelectGroup key={gruppo.department}>
                          <SelectLabel>{gruppo.label}</SelectLabel>
                          {gruppo.roles.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.primaryRole && <p className="text-xs text-destructive">{fieldErrors.primaryRole}</p>}
                  {primaryRole && STAFF_ROLE_DESCRIPTIONS[primaryRole] && (
                    <p className="text-xs text-muted-foreground">{STAFF_ROLE_DESCRIPTIONS[primaryRole]}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="department">Reparto</Label>
                  <Input
                    id="department"
                    readOnly
                    aria-readonly="true"
                    value={staffDepartmentLabel(reparto)}
                    className="cursor-not-allowed bg-muted text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Determinato dal ruolo.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="hireDate">Data di assunzione</Label>
                  <Input
                    id="hireDate"
                    name="hireDate"
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="statoAttuale">Stato</Label>
                  <Input
                    id="statoAttuale"
                    readOnly
                    aria-readonly="true"
                    value={staffStatusLabel(waiter.status)}
                    className="cursor-not-allowed bg-muted text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Si cambia dall&apos;elenco, senza aprire la scheda.</p>
                </div>

                {/*
                  Le competenze contano solo per chi puo\u0300 stare su un tavolo.
                  Un lavapiatti non ha capability, e mostrargli dieci caselle
                  vuote da spuntare gli farebbe sembrare la scheda incompleta —
                  oltre a invitare a spuntarne una, cosa che lo farebbe comparire
                  fra i candidati quando il maitre assegna la sala.
                */}
                {mostraCapability && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Competenze operative</Label>
                    <CapabilityPicker value={capabilities} onChange={handleCapabilitiesChange} />
                    <p className="text-xs text-muted-foreground">Determinano a quali ruoli tavolo può essere assegnato.</p>
                  </div>
                )}
              </div>
            </div>

            {canManageContracts && (
              <>
                <Separator />
                <StaffContractSection waiterId={waiter.id} open={open} />
              </>
            )}

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
            className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 riquadro bg-card px-4 py-3 text-sm text-card-foreground shadow-2xl animate-fade-in"
          >
            <CheckCircle2 className="h-4 w-4 text-accent-strong" />
            Dati aggiornati correttamente
          </div>,
          document.body,
        )}
    </>
  );
}
