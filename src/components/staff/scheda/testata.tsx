"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, CalendarRange, Camera, FileText, KeyRound, MoreHorizontal, Pencil, Phone, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvvisi } from "@/components/ui/avvisi";
import { StaffStatusSelect } from "@/components/staff/staff-status-select";
import { readApiError } from "@/lib/api-client";
import { staffDepartmentLabel } from "@/lib/staff-departments";
import { staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { staffStatusLabel, staffStatusTone } from "@/lib/staff-status";
import { initials } from "@/lib/utils";
import { nomeCompleto, type PersonaDTO } from "./tipi";

/**
 * L'intestazione della scheda: **chi è**, in una riga.
 *
 * ## Revisione del 4 novembre 2026
 *
 * Era una card alta duecento pixel con quattro dati rapidi a destra —
 * telefono, email, assunzione, contratto — e la Panoramica subito sotto
 * ripeteva in quattro card ruolo, reparto, assunzione e contratto: metà dei
 * dati letti due volte, e un'email «non indicata» scritta in grande. Adesso
 * è la stessa riga della scheda ospite: freccia, **la faccia**, il nome con
 * ruolo e reparto, lo stato. Anzianità e contratto stanno nelle tessere della
 * Panoramica, i contatti in «Dati personali».
 *
 * La foto è il centro della riga: una persona si riconosce dalla faccia prima
 * che dal nome. Chi gestisce lo staff la cambia toccandola.
 *
 * Le azioni: «Modifica profilo» è l'unica pillola; il resto — chiamare,
 * documenti, contratto, accesso, calendario — sta nel menu «•••», con
 * l'eliminazione in fondo, in rosso, dietro una conferma.
 */
export function Testata({
  persona,
  canManageStaff,
  base,
}: {
  persona: PersonaDTO;
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

  const faccia = (
    <Avatar className="h-14 w-14 border-2 border-card shadow-[0_6px_16px_rgba(16,43,34,0.22)] md:h-16 md:w-16">
      {persona.photoUrl && <AvatarImage src={persona.photoUrl} alt={nome} className="object-cover" />}
      <AvatarFallback className="text-lg font-medium text-foreground">{initials(nome)}</AvatarFallback>
    </Avatar>
  );

  return (
    <header className="fissa flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 pb-3">
      {/* Il contenuto in un solo figlio elastico con `basis-0`, come nella
          testata ospite: le azioni non finiscono mai a capo da sole. */}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:w-auto lg:flex-1 lg:basis-0">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="-ml-2 h-8 w-8 shrink-0">
            <Link href="/staff" aria-label="Torna allo staff" title="Staff">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>

          {canManageStaff ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={caricoFoto}
                aria-label={persona.photoUrl ? "Sostituisci la foto" : "Carica una foto"}
                title={persona.photoUrl ? "Sostituisci la foto" : "Carica una foto"}
                className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {faccia}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 grid place-items-center rounded-full bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <Camera className="h-5 w-5" />
                </span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={cambiaFoto} />
            </>
          ) : (
            <span className="shrink-0">{faccia}</span>
          )}

          {/* Il nome non si taglia: va a capo se deve. */}
          <div className="min-w-0">
            <h1 className="break-words text-display text-2xl leading-tight">{nome}</h1>
            <p className="text-sm text-muted-foreground">
              {ruolo} <span aria-hidden="true">·</span> {reparto}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageStaff ? (
            <StaffStatusSelect waiterId={persona.id} status={persona.status} />
          ) : (
            <Badge tone={staffStatusTone(persona.status)}>{staffStatusLabel(persona.status)}</Badge>
          )}
          {persona.account?.membership?.disabledAt && <Badge tone="neutral">Account disattivato</Badge>}
        </div>
      </div>

      {canManageStaff && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label={`Altre azioni per ${nome}`} title="Altre azioni">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{nome}</DropdownMenuLabel>
              {persona.phone && (
                <DropdownMenuItem asChild>
                  <a href={`tel:${persona.phone}`}>
                    <Phone className="h-4 w-4" aria-hidden="true" /> Chiama {persona.phone}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href={`${base}?tab=documenti`} scroll={false}>
                  <FileText className="h-4 w-4" aria-hidden="true" /> Documenti
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${base}?tab=lavoro`} scroll={false}>
                  <Briefcase className="h-4 w-4" aria-hidden="true" /> Ruolo e contratto
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${base}?tab=account`} scroll={false}>
                  <KeyRound className="h-4 w-4" aria-hidden="true" /> Accesso al gestionale
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/staff/turni">
                  <CalendarRange className="h-4 w-4" aria-hidden="true" /> Calendario turni
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfermaElimina(true)} className="text-destructive-soft">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina dallo staff
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button asChild variant="accent">
            <Link href={`${base}?tab=personali&modifica=1`} scroll={false}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica profilo
            </Link>
          </Button>
        </div>
      )}

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
