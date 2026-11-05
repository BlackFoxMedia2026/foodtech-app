"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Briefcase, Building2, CalendarDays, Pencil, UserRoundCheck } from "lucide-react";
import type { StaffCapability, StaffPrimaryRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAvvisi } from "@/components/ui/avvisi";
import { CapabilityPicker } from "@/components/staff/capability-picker";
import { readApiError } from "@/lib/api-client";
import { ROLE_OPTIONS_BY_DEPARTMENT, staffDepartmentLabel } from "@/lib/staff-departments";
import { DEFAULT_CAPABILITIES_BY_ROLE, STAFF_ROLE_DESCRIPTIONS, staffCapabilityLabel, staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { dataLunga, perCampoData } from "@/lib/scheda-dipendente";
import { Caratteristiche } from "./caratteristiche";
import { Contratto } from "./contratto";
import { Blocco, Dischetto, Voce } from "./lettura";
import { CampoModulo, GrigliaCampi, PiedeModifica, Sezione } from "./sezione";
import type { ContrattoDTO, PersonaDTO } from "./tipi";

type Responsabile = { id: string; nome: string; primaryRole: StaffPrimaryRole | null };

const NESSUNO = "__nessuno__";

/**
 * La linguetta «Lavoro»: il rapporto con il locale.
 *
 * Tre sezioni, perché sono tre cose che cambiano con ritmi diversi: il
 * **ruolo** (una volta l'anno, forse), il **contratto** (a ogni rinnovo, con
 * la sua storia) e le **caratteristiche** (quando si scopre che parla
 * francese). Metterle in un modulo solo vorrebbe dire salvare un contratto
 * per aver aggiunto un tag.
 */
export function Lavoro({
  persona,
  contratti,
  responsabili,
  canEdit,
  canContracts,
}: {
  persona: PersonaDTO;
  contratti: ContrattoDTO[];
  responsabili: Responsabile[];
  canEdit: boolean;
  canContracts: boolean;
}) {
  return (
    <div className="space-y-5">
      <Ruolo persona={persona} responsabili={responsabili} canEdit={canEdit} />
      {canContracts ? (
        <Contratto waiterId={persona.id} contratti={contratti} canEdit={canContracts} />
      ) : (
        <Sezione titolo="Contratto" icona={Briefcase}>
          <p className="text-base text-muted-foreground">I dati del contratto sono riservati a chi gestisce i contratti del locale.</p>
        </Sezione>
      )}
      <Caratteristiche waiterId={persona.id} skills={persona.skills} canEdit={canEdit} />
    </div>
  );
}

function Ruolo({ persona, responsabili, canEdit }: { persona: PersonaDTO; responsabili: Responsabile[]; canEdit: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [modifica, setModifica] = useState(false);
  const [primaryRole, setPrimaryRole] = useState<StaffPrimaryRole | null>(persona.primaryRole);
  const [capabilities, setCapabilities] = useState<StaffCapability[]>(persona.capabilities);
  const [hireDate, setHireDate] = useState(perCampoData(persona.hireDate));
  const [managerId, setManagerId] = useState<string>(persona.managerId ?? NESSUNO);
  const capabilityToccate = useRef(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreRuolo, setErroreRuolo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const reparto = staffDepartmentOf({ primaryRole: modifica ? primaryRole : persona.primaryRole, department: persona.department });
  const mostraCapability = reparto === "SALA" || reparto === "BAR" || reparto === "DIREZIONE";

  function inizia() {
    setPrimaryRole(persona.primaryRole);
    setCapabilities(persona.capabilities);
    setHireDate(perCampoData(persona.hireDate));
    setManagerId(persona.managerId ?? NESSUNO);
    capabilityToccate.current = false;
    setErrore(null);
    setErroreRuolo(null);
    setModifica(true);
  }

  function cambiaRuolo(next: StaffPrimaryRole) {
    setPrimaryRole(next);
    if (!capabilityToccate.current) setCapabilities(DEFAULT_CAPABILITIES_BY_ROLE[next]);
  }

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!primaryRole) {
      setErroreRuolo("Seleziona un ruolo.");
      return;
    }
    setSalvando(true);
    setErrore(null);
    const res = await fetch(`/api/waiters/${persona.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        primaryRole,
        capabilities: mostraCapability ? capabilities : [],
        hireDate: hireDate || null,
        managerId: managerId === NESSUNO ? null : managerId,
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Impossibile salvare. Riprova."));
      return;
    }
    setModifica(false);
    avvisi.mostra("Dati lavorativi aggiornati");
    router.refresh();
  }

  if (!modifica) {
    return (
      <Sezione
        id="ruolo"
        titolo="Ruolo e reparto"
        icona={Briefcase}
        descrizione="Cosa fa nel locale, da quando, e a chi risponde."
        azione={
          canEdit && (
            <Button type="button" variant="outline" onClick={inizia}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
            </Button>
          )
        }
      >
        {/* A riposo come la scheda ospite (4 novembre 2026): due riquadri con
            le icone al posto della griglia di etichette. Lo stato non si
            ripete: è in testata, dove si cambia. */}
        <div className={mostraCapability ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
          <Blocco titolo="Nel locale">
            <Voce icona={Briefcase} etichetta="Ruolo">
              {persona.primaryRole ? staffPrimaryRoleLabel(persona.primaryRole) : persona.role}
            </Voce>
            <Voce icona={Building2} etichetta="Reparto">
              {staffDepartmentLabel(reparto)}
            </Voce>
            <Voce
              icona={CalendarDays}
              etichetta="Assunzione"
              vuoto="Non indicata"
              nota={persona.hireDate ? anzianita(new Date(persona.hireDate)) : undefined}
            >
              {persona.hireDate ? dataLunga(persona.hireDate) : null}
            </Voce>
            <Voce icona={UserRoundCheck} etichetta="Risponde a" vuoto="Nessun responsabile">
              {persona.manager ? (
                <>
                  {persona.manager.nome}
                  {persona.manager.primaryRole && (
                    <span className="text-sm text-muted-foreground"> · {staffPrimaryRoleLabel(persona.manager.primaryRole)}</span>
                  )}
                </>
              ) : null}
            </Voce>
          </Blocco>

          {mostraCapability && (
            <Blocco titolo="Competenze in sala">
              {persona.capabilities.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {persona.capabilities.map((c) => (
                    <li key={c} className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/10 p-2">
                      <Dischetto icona={BadgeCheck} tinta="oro" />
                      <span className="break-words text-[15px] font-medium leading-snug">{staffCapabilityLabel(c)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nessuna: non compare fra i candidati quando si assegna la sala.
                </p>
              )}
              <p className="text-xs text-muted-foreground">Decidono a quali ruoli al tavolo può essere assegnata durante il servizio.</p>
            </Blocco>
          )}
        </div>
      </Sezione>
    );
  }

  return (
    <form onSubmit={salva} noValidate>
      <Sezione id="ruolo" titolo="Ruolo e reparto" icona={Briefcase} descrizione="Stai modificando i dati lavorativi.">
        <GrigliaCampi>
          <CampoModulo etichetta="Ruolo" htmlFor="primaryRole" errore={erroreRuolo ?? undefined} nota={primaryRole ? STAFF_ROLE_DESCRIPTIONS[primaryRole] : undefined}>
            <Select value={primaryRole ?? undefined} onValueChange={(v) => cambiaRuolo(v as StaffPrimaryRole)}>
              <SelectTrigger id="primaryRole" aria-invalid={!!erroreRuolo}>
                <SelectValue placeholder="Seleziona un ruolo" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS_BY_DEPARTMENT.map((g) => (
                  <SelectGroup key={g.department}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.roles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </CampoModulo>
          <CampoModulo etichetta="Reparto" nota="Determinato dal ruolo.">
            <Input readOnly aria-readonly="true" value={staffDepartmentLabel(reparto)} className="cursor-not-allowed bg-muted text-muted-foreground" />
          </CampoModulo>
          <CampoModulo etichetta="Data di assunzione" htmlFor="hireDate">
            <Input id="hireDate" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </CampoModulo>
          <CampoModulo etichetta="Responsabile diretto" htmlFor="managerId">
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger id="managerId">
                <SelectValue placeholder="Nessuno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                {responsabili.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                    {r.primaryRole ? ` · ${staffPrimaryRoleLabel(r.primaryRole)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoModulo>
          {mostraCapability && (
            <CampoModulo etichetta="Competenze operative" largo nota="Determinano a quali ruoli tavolo può essere assegnata.">
              <CapabilityPicker
                value={capabilities}
                onChange={(next) => {
                  capabilityToccate.current = true;
                  setCapabilities(next);
                }}
              />
            </CampoModulo>
          )}
        </GrigliaCampi>
        <PiedeModifica onAnnulla={() => setModifica(false)} salvando={salvando} errore={errore} />
      </Sezione>
    </form>
  );
}

/** «5 anni», «8 mesi»: da quanto è in squadra, accanto alla data. */
function anzianita(inizio: Date): string | undefined {
  const adesso = new Date();
  const mesi =
    (adesso.getFullYear() - inizio.getFullYear()) * 12 + (adesso.getMonth() - inizio.getMonth()) - (adesso.getDate() < inizio.getDate() ? 1 : 0);
  if (mesi < 1) return undefined;
  if (mesi < 12) return `${mesi} ${mesi === 1 ? "mese" : "mesi"}`;
  const anni = Math.floor(mesi / 12);
  return `${anni} ${anni === 1 ? "anno" : "anni"}`;
}
