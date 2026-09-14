"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarDays, Camera, FileText, Mail, MoreHorizontal, Pencil, Phone, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAvvisi } from "@/components/ui/avvisi";
import { StaffStatusSelect } from "@/components/staff/staff-status-select";
import { readApiError } from "@/lib/api-client";
import { staffDepartmentLabel } from "@/lib/staff-departments";
import { staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { staffStatusLabel, staffStatusTone } from "@/lib/staff-status";
import { dataLunga } from "@/lib/scheda-dipendente";
import { initials } from "@/lib/utils";
import { nomeCompleto, type PersonaDTO } from "./tipi";

/**
 * L'intestazione della scheda: **chi è**, in un colpo d'occhio.
 *
 * A sinistra la faccia, grande, e il nome con ruolo e reparto — l'ordine con
 * cui ci si presenta. Lo stato sta accanto al nome perché è l'unica cosa qui
 * che cambia ogni giorno e che si cambia da qui (è lo stesso selettore
 * dell'elenco). A destra i quattro dati che si cercano mentre si legge il
 * nome: telefono, email, da quando lavora qui, con che contratto.
 *
 * Tre azioni e non dieci: modificare, i documenti, e un menu per il resto.
 * Eliminare una persona sta dietro una conferma: non si fa di corsa.
 */
export function Testata({
  persona,
  tipoContratto,
  canManageStaff,
  base,
}: {
  persona: PersonaDTO;
  tipoContratto: string | null;
  canManageStaff: boolean;
  base: string;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [caricoFoto, setCaricoFoto] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const [elimino, setElimino] = useState(false);
  const [erroreElimina, setErroreElimina] = useState<string | null>(null);

  const nome = nomeCompleto(persona);
  const ruolo = persona.primaryRole ? staffPrimaryRoleLabel(persona.primaryRole) : persona.role;
  const reparto = staffDepartmentLabel(staffDepartmentOf(persona));

  async function cambiaFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCaricoFoto(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/waiters/${persona.id}/photo`, { method: "POST", body: fd });
    setCaricoFoto(false);
    if (!res.ok) {
      avvisi.problema(await readApiError(res, "Caricamento della foto non riuscito."));
      return;
    }
    avvisi.mostra("Foto aggiornata");
    router.refresh();
  }

  async function elimina() {
    setElimino(true);
    setErroreElimina(null);
    const res = await fetch(`/api/waiters/${persona.id}`, { method: "DELETE" });
    setElimino(false);
    if (!res.ok) {
      setErroreElimina(await readApiError(res, "Impossibile eliminare il profilo."));
      return;
    }
    router.push("/staff");
    router.refresh();
  }

  return (
    <header className="surface p-5 md:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        {/* ------------------------------------------------------- chi è */}
        <div className="flex min-w-0 items-start gap-4 md:gap-5">
          <div className="relative shrink-0">
            <Avatar className="h-20 w-20 md:h-24 md:w-24">
              {persona.photoUrl && <AvatarImage src={persona.photoUrl} alt={nome} className="object-cover" />}
              <AvatarFallback className="text-2xl">{initials(nome)}</AvatarFallback>
            </Avatar>
            {canManageStaff && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={caricoFoto}
                  aria-label={persona.photoUrl ? "Sostituisci la foto" : "Carica una foto"}
                  title={persona.photoUrl ? "Sostituisci la foto" : "Carica una foto"}
                  className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:bg-secondary disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={cambiaFoto} />
              </>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="text-display text-3xl leading-tight md:text-4xl">{nome}</h1>
            <p className="mt-1 text-base text-muted-foreground md:text-lg">
              {ruolo} <span aria-hidden="true">·</span> {reparto}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canManageStaff ? (
                <StaffStatusSelect waiterId={persona.id} status={persona.status} />
              ) : (
                <Badge tone={staffStatusTone(persona.status)}>{staffStatusLabel(persona.status)}</Badge>
              )}
              {persona.account?.membership?.disabledAt && <Badge tone="neutral">Account disattivato</Badge>}
            </div>
          </div>
        </div>

        {/* --------------------------------------- dati rapidi e azioni */}
        <div className="flex min-w-0 flex-col gap-4 lg:items-end">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
            <Rapido icona={Phone} etichetta="Telefono">
              <a href={`tel:${persona.phone}`} className="tabular-nums hover:text-accent-strong">
                {persona.phone}
              </a>
            </Rapido>
            <Rapido icona={Mail} etichetta="Email">
              {persona.email ? (
                <a href={`mailto:${persona.email}`} className="break-all hover:text-accent-strong">
                  {persona.email}
                </a>
              ) : (
                <span className="text-tertiary-foreground">non indicata</span>
              )}
            </Rapido>
            <Rapido icona={CalendarDays} etichetta="Assunzione">
              {persona.hireDate ? dataLunga(persona.hireDate) : <span className="text-tertiary-foreground">non indicata</span>}
            </Rapido>
            <Rapido icona={Briefcase} etichetta="Contratto">
              {tipoContratto ?? <span className="text-tertiary-foreground">nessun contratto</span>}
            </Rapido>
          </dl>

          {canManageStaff && (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="accent">
                <Link href={`${base}?tab=personali&modifica=1`} scroll={false}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica profilo
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`${base}?tab=documenti`} scroll={false}>
                  <FileText className="h-4 w-4" aria-hidden="true" /> Documenti
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label={`Altre azioni per ${nome}`}>
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem asChild>
                    <Link href={`${base}?tab=lavoro`} scroll={false}>
                      Ruolo e contratto
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`${base}?tab=account`} scroll={false}>
                      Accesso al gestionale
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/staff/turni`}>Apri il calendario turni</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConfermaElimina(true)} className="text-destructive-soft">
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina dallo staff
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      <Dialog open={confermaElimina} onOpenChange={setConfermaElimina}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare {nome} dallo staff?</DialogTitle>
            <DialogDescription>
              Spariscono la scheda, i turni, i contratti e i documenti caricati. Se la persona ha smesso di lavorare
              qui, è meglio cambiarle lo stato in «Non disponibile» e disattivarle l&apos;account: la storia resta.
            </DialogDescription>
          </DialogHeader>
          {erroreElimina && <p className="text-sm text-destructive-soft">{erroreElimina}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfermaElimina(false)} disabled={elimino}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" onClick={elimina} disabled={elimino}>
              {elimino ? "Elimino…" : "Elimina definitivamente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function Rapido({
  icona: Icona,
  etichetta,
  children,
}: {
  icona: React.ComponentType<{ className?: string }>;
  etichetta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icona className="h-4 w-4 shrink-0 text-tertiary-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="sr-only">{etichetta}</dt>
        <dd className="truncate text-base text-foreground">{children}</dd>
      </div>
    </div>
  );
}
