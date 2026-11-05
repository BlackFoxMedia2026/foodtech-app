"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BadgeCheck, CalendarDays, CalendarX2, ChevronDown, Clock, FileSignature, Hourglass, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAvvisi } from "@/components/ui/avvisi";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { ContractDocument } from "@/components/staff/contract-document";
import { ContractFields } from "@/components/staff/contract-fields";
import { readApiError } from "@/lib/api-client";
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
  getContractStatus,
  getContractStatusDetail,
  pickCurrentContract,
  staffContractTypeLabel,
} from "@/lib/staff-contracts";
import { dataLunga } from "@/lib/scheda-dipendente";
import { Blocco, GiorniSettimana, Tassello, Voce } from "./lettura";
import { PiedeModifica, Sezione } from "./sezione";
import type { ContrattoDTO } from "./tipi";

function conDate(c: ContrattoDTO) {
  return {
    ...c,
    startDate: new Date(c.startDate),
    endDate: c.endDate ? new Date(c.endDate) : null,
    probationEndDate: c.probationEndDate ? new Date(c.probationEndDate) : null,
  };
}

/**
 * Il contratto: quello attuale, leggibile, e lo storico dei precedenti.
 *
 * Il modello è uno-a-molti di proposito (vedi `StaffContract`): un rinnovo
 * è una riga nuova con il suo documento, non una data spostata. Qui si
 * vede quello in corso con tutti i suoi termini — tipo, date, ore, giorni,
 * inquadramento, periodo di prova — e i vecchi in fondo, chiusi.
 */
export function Contratto({ waiterId, contratti, canEdit }: { waiterId: string; contratti: ContrattoDTO[]; canEdit: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const oggi = useVenueToday();
  const [modo, setModo] = useState<"vista" | "modifica" | "nuovo">("vista");
  const [valori, setValori] = useState<ContractFormValues>(EMPTY_CONTRACT_FORM);
  const [errori, setErrori] = useState<ContractFormErrors>({});
  const [errore, setErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [storicoAperto, setStoricoAperto] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);

  const tutti = contratti.map(conDate);
  const attuale = pickCurrentContract(tutti);
  const storico = tutti.filter((c) => c.id !== attuale?.id);

  function iniziaModifica() {
    if (!attuale) return;
    setValori(contractToFormValues(attuale));
    setErrori({});
    setErrore(null);
    setModo("modifica");
  }

  function iniziaNuovo() {
    setValori({ ...EMPTY_CONTRACT_FORM, startDate: oggi });
    setErrori({});
    setErrore(null);
    setModo("nuovo");
  }

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validateContractForm(valori);
    if (Object.keys(err).length) {
      setErrori(err);
      return;
    }
    setErrori({});
    setSalvando(true);
    setErrore(null);
    const eModifica = modo === "modifica" && attuale;
    const res = await fetch(eModifica ? `/api/waiters/${waiterId}/contracts/${attuale.id}` : `/api/waiters/${waiterId}/contracts`, {
      method: eModifica ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(contractFormToPayload(valori)),
    });
    setSalvando(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Impossibile salvare il contratto."));
      return;
    }
    setModo("vista");
    avvisi.mostra(eModifica ? "Contratto aggiornato" : "Nuovo contratto registrato");
    router.refresh();
  }

  async function elimina(id: string) {
    const res = await fetch(`/api/waiters/${waiterId}/contracts/${id}`, { method: "DELETE" });
    setConfermaElimina(null);
    if (!res.ok) {
      avvisi.problema(await readApiError(res, "Impossibile eliminare il contratto."));
      return;
    }
    avvisi.mostra("Contratto eliminato");
    router.refresh();
  }

  if (modo !== "vista") {
    return (
      <form onSubmit={salva} noValidate>
        <Sezione id="contratto" titolo={modo === "nuovo" ? "Nuovo contratto" : "Contratto"} icona={FileSignature} descrizione={modo === "nuovo" ? "Un rinnovo è un contratto nuovo: il precedente resta nello storico." : "Stai modificando il contratto in corso."}>
          <ContractFields idPrefix="contratto" value={valori} onChange={setValori} errors={errori} />
          <PiedeModifica onAnnulla={() => setModo("vista")} salvando={salvando} errore={errore} etichettaSalva={modo === "nuovo" ? "Crea contratto" : "Salva modifiche"} />
        </Sezione>
      </form>
    );
  }

  return (
    <Sezione
      id="contratto"
      titolo="Contratto"
      icona={FileSignature}
      descrizione={attuale ? "Il contratto in corso e la sua copia digitale." : "Nessun contratto registrato."}
      azione={
        canEdit && (
          <>
            {attuale && (
              <Button type="button" variant="outline" onClick={iniziaModifica}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
              </Button>
            )}
            <Button type="button" variant={attuale ? "ghost" : "accent"} onClick={iniziaNuovo}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Nuovo contratto
            </Button>
          </>
        )
      }
    >
      {attuale ? (
        <div className="space-y-4">
          {/* La testa del contratto: il tipo in grande col suo stato. Poi i
              termini in tasselli con l'icona e i giorni come una settimana
              disegnata (4 novembre 2026: prima erano otto etichette in
              maiuscoletto su quattro colonne). */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[linear-gradient(135deg,#1C4A3A_0%,#102B22_100%)] p-4 text-cream shadow-[0_8px_18px_rgba(16,43,34,0.25)]">
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream/10">
              <FileSignature className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-cream/70">Contratto in corso</p>
              <p className="text-display break-words text-xl leading-tight md:text-2xl">{staffContractTypeLabel(attuale.contractType)}</p>
            </div>
            <Badge tone={CONTRACT_STATUS_BADGE_TONE[getContractStatus(attuale)]} className={
                /* Sul verde i toni neutri sparivano: crema per «in corso» e
                   «senza scadenza», i colori d'allarme restano i loro. */
                ["EXPIRING_SOON", "EXPIRED"].includes(getContractStatus(attuale))
                  ? "text-sm"
                  : "border-cream/30 bg-cream/15 text-sm text-cream"
              }
            >
              {getContractStatusDetail(attuale)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <Tassello icona={CalendarDays} etichetta="Inizio" valore={dataLunga(attuale.startDate)} />
            <Tassello icona={CalendarX2} etichetta="Fine" valore={attuale.endDate ? dataLunga(attuale.endDate) : "Nessuna scadenza"} />
            <Tassello icona={Clock} etichetta="Ore a settimana" valore={attuale.weeklyHours != null ? `${attuale.weeklyHours} ore` : null} vuoto="Non indicate" />
            <Tassello icona={Award} etichetta="Livello" valore={attuale.level} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Blocco titolo="Giorni lavorativi">
              {attuale.workingDays.length ? (
                <GiorniSettimana giorni={attuale.workingDays} />
              ) : (
                <p className="text-sm text-tertiary-foreground">Non indicati</p>
              )}
            </Blocco>
            <Blocco titolo="Mansione e prova">
              <Voce icona={BadgeCheck} etichetta="Mansione contrattuale" vuoto="Non indicata">
                {attuale.contractualRole}
              </Voce>
              <Voce
                icona={Hourglass}
                etichetta="Periodo di prova"
                vuoto="Non previsto"
                nota={attuale.probationEndDate && attuale.probationEndDate.getTime() < Date.now() ? "concluso" : undefined}
              >
                {attuale.probationEndDate ? `Fino al ${dataLunga(attuale.probationEndDate)}` : null}
              </Voce>
            </Blocco>
          </div>

          {attuale.notes && (
            <Blocco titolo="Note">
              <p className="whitespace-pre-line break-words text-base text-foreground">{attuale.notes}</p>
            </Blocco>
          )}

          <div className="border-t border-border/60 pt-5">
            <ContractDocument waiterId={waiterId} contractId={attuale.id} document={attuale.document} onChange={() => router.refresh()} />
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 border-t border-border/60 pt-4">
              {confermaElimina === attuale.id ? (
                <>
                  <span className="text-sm text-muted-foreground">Eliminare questo contratto e il suo documento?</span>
                  <Button type="button" variant="destructive" size="sm" onClick={() => elimina(attuale.id)}>
                    Elimina
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfermaElimina(null)}>
                    Annulla
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfermaElimina(attuale.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina contratto
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-base text-muted-foreground">
          Registra il contratto per vederne qui la scadenza e caricare la copia firmata.
        </p>
      )}

      {storico.length > 0 && (
        <div className="mt-6 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => setStoricoAperto((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-accent-strong"
            aria-expanded={storicoAperto}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${storicoAperto ? "rotate-180" : ""}`} aria-hidden="true" />
            Contratti precedenti ({storico.length})
          </button>
          {storicoAperto && (
            <ul className="mt-3 divide-y divide-border/60">
              {storico.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-base text-foreground">{staffContractTypeLabel(c.contractType)}</p>
                    <p className="text-sm text-muted-foreground">
                      {dataLunga(c.startDate)} – {c.endDate ? dataLunga(c.endDate) : "senza scadenza"}
                      {c.weeklyHours != null ? ` · ${c.weeklyHours} ore/settimana` : ""}
                    </p>
                    <div className="mt-1">
                      <ContractDocument waiterId={waiterId} contractId={c.id} document={c.document} onChange={() => router.refresh()} variant="compact" />
                    </div>
                  </div>
                  {canEdit &&
                    (confermaElimina === c.id ? (
                      <span className="flex items-center gap-2 text-sm">
                        <Button type="button" variant="destructive" size="sm" onClick={() => elimina(c.id)}>
                          Elimina
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfermaElimina(null)}>
                          Annulla
                        </Button>
                      </span>
                    ) : (
                      <Button type="button" variant="ghost" size="icon" aria-label="Elimina contratto" onClick={() => setConfermaElimina(c.id)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sezione>
  );
}
