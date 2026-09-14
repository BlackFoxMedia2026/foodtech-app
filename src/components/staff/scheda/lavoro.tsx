"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Pencil } from "lucide-react";
import type { StaffCapability, StaffPrimaryRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAvvisi } from "@/components/ui/avvisi";
import { CapabilityPicker } from "@/components/staff/capability-picker";
import { readApiError } from "@/lib/api-client";
import { ROLE_OPTIONS_BY_DEPARTMENT, staffDepartmentLabel } from "@/lib/staff-departments";
import { DEFAULT_CAPABILITIES_BY_ROLE, STAFF_ROLE_DESCRIPTIONS, staffCapabilityLabel, staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { staffStatusLabel, staffStatusTone } from "@/lib/staff-status";
import { dataLunga, perCampoData } from "@/lib/scheda-dipendente";
import { Caratteristiche } from "./caratteristiche";
import { Contratto } from "./contratto";
import { Campo, CampoModulo, GrigliaCampi, PiedeModifica, Sezione } from "./sezione";
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
        <GrigliaCampi>
          <Campo etichetta="Ruolo" valore={persona.primaryRole ? staffPrimaryRoleLabel(persona.primaryRole) : persona.role} />
          <Campo etichetta="Reparto" valore={staffDepartmentLabel(reparto)} nota="Determinato dal ruolo." />
          <Campo
            etichetta="Stato"
            valore={<Badge tone={staffStatusTone(persona.status)} className="text-sm">{staffStatusLabel(persona.status)}</Badge>}
            nota="Si cambia dall'intestazione della scheda."
          />
          <Campo etichetta="Data di assunzione" valore={persona.hireDate ? dataLunga(persona.hireDate) : null} vuoto="Non indicata" />
          <Campo etichetta="Responsabile diretto" valore={persona.manager?.nome} vuoto="Nessuno" nota={persona.manager?.primaryRole ? staffPrimaryRoleLabel(persona.manager.primaryRole) : undefined} />
          {mostraCapability && (
            <Campo
              etichetta="Competenze operative"
              largo
              valore={
                persona.capabilities.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {persona.capabilities.map((c) => (
                      <Badge key={c} tone="gold" className="text-sm">
                        {staffCapabilityLabel(c)}
                      </Badge>
                    ))}
                  </span>
                ) : null
              }
              vuoto="Nessuna: non compare fra i candidati quando si assegna la sala."
              nota="Determinano a quali ruoli tavolo può essere assegnata durante il servizio."
            />
          )}
        </GrigliaCampi>
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
